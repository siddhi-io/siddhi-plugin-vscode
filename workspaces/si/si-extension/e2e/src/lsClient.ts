/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import { raceTimeout, sleep } from "./exec";
import { LaunchSpec } from "./launch";

export class FrameParser {
    readonly noise: string[] = [];
    private buffer = Buffer.alloc(0);

    push(chunk: Buffer): unknown[] {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const messages: unknown[] = [];
        for (;;) {
            const match = /Content-Length: (\d+)\r\n(?:[^\r\n]+\r\n)*\r\n/.exec(this.buffer.toString("latin1"));
            if (!match) {
                break;
            }
            const bodyStart = match.index + match[0].length;
            const length = Number(match[1]);
            if (this.buffer.length < bodyStart + length) {
                break;
            }
            if (match.index > 0) {
                this.noise.push(this.buffer.subarray(0, match.index).toString("utf8"));
            }
            messages.push(JSON.parse(this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8")));
            this.buffer = this.buffer.subarray(bodyStart + length);
        }
        return messages;
    }
}

export interface Diagnostic {
    message: string;
    severity?: number;
}

interface Pending {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class LanguageServerClient {
    private readonly parser = new FrameParser();
    private readonly pending = new Map<number, Pending>();
    private readonly published = new Map<string, Diagnostic[][]>();
    private readonly exited: Promise<void>;
    private readonly logFd: number;
    private nextId = 1;
    private exitCode: number | null | undefined;
    private logClosed = false;

    static spawn(launch: LaunchSpec, logPath: string): LanguageServerClient {
        const child = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"], env: launch.env });
        return new LanguageServerClient(child, logPath);
    }

    private constructor(private readonly child: ChildProcess, logPath: string) {
        this.logFd = fs.openSync(logPath, "w");
        this.exited = new Promise<void>((resolve) => {
            child.once("close", (code) => {
                this.exitCode = code;
                this.failPending(new Error(`language server exited with code ${code}`));
                resolve();
            });
            child.once("error", (error) => {
                this.record(`spawn error: ${error.message}`);
                this.exitCode = null;
                this.failPending(error);
                resolve();
            });
        });
        child.stdin?.on("error", () => undefined);
        child.stdout?.on("data", (chunk: Buffer) => {
            for (const message of this.parser.push(chunk)) {
                this.dispatch(message as any);
            }
        });
        child.stderr?.on("data", (chunk: Buffer) => this.record(chunk.toString("utf8").trimEnd()));
    }

    get noise(): string[] {
        return this.parser.noise;
    }

    private record(text: string): void {
        if (!this.logClosed) {
            fs.writeSync(this.logFd, `${text}\n`);
        }
    }

    private failPending(error: Error): void {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.reject(error);
            this.pending.delete(id);
        }
    }

    private send(message: object): void {
        const body = JSON.stringify({ jsonrpc: "2.0", ...message });
        this.child.stdin?.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    }

    private dispatch(message: any): void {
        if (message.method === undefined && message.id !== undefined) {
            const entry = this.pending.get(message.id);
            if (entry) {
                this.pending.delete(message.id);
                clearTimeout(entry.timer);
                if (message.error) {
                    entry.reject(new Error(JSON.stringify(message.error)));
                } else {
                    entry.resolve(message.result);
                }
            }
            return;
        }
        if (message.method === "textDocument/publishDiagnostics") {
            const history = this.published.get(message.params.uri) ?? [];
            history.push(message.params.diagnostics as Diagnostic[]);
            this.published.set(message.params.uri, history);
            return;
        }
        if (message.id !== undefined) {
            this.send({ id: message.id, result: null });
        }
    }

    request(method: string, params: unknown, timeoutMs = 60000): Promise<any> {
        if (this.exitCode !== undefined) {
            return Promise.reject(new Error(`${method}: the language server has already exited`));
        }
        const id = this.nextId++;
        return new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${method} timed out after ${timeoutMs} ms`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.send({ id, method, params });
        });
    }

    notify(method: string, params: unknown): void {
        this.send({ method, params });
    }

    async initialize(): Promise<void> {
        await this.request("initialize", { processId: process.pid, rootUri: null, capabilities: {} });
        this.notify("initialized", {});
    }

    didOpen(uri: string, text: string): void {
        this.notify("textDocument/didOpen", { textDocument: { uri, languageId: "siddhi", version: 1, text } });
    }

    didChange(uri: string, version: number, text: string): void {
        this.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
    }

    publishCount(uri: string): number {
        return this.published.get(uri)?.length ?? 0;
    }

    async waitForDiagnostics(uri: string, previousCount: number, timeoutMs: number): Promise<Diagnostic[]> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const history = this.published.get(uri) ?? [];
            if (history.length > previousCount) {
                return history[history.length - 1];
            }
            if (Date.now() >= deadline) {
                throw new Error(`no diagnostics published for ${uri} within ${timeoutMs} ms`);
            }
            await sleep(50);
        }
    }

    async shutdown(): Promise<number | null> {
        try {
            await this.request("shutdown", null, 15000);
            this.notify("exit", null);
        } catch {
            await this.terminate();
            return this.exitCode ?? null;
        }
        await raceTimeout(this.exited.then(() => true), 15000, false);
        const code = this.exitCode ?? null;
        await this.terminate();
        return code;
    }

    async terminate(): Promise<void> {
        if (this.exitCode === undefined) {
            this.child.kill("SIGTERM");
            const done = await raceTimeout(this.exited.then(() => true), 5000, false);
            if (!done) {
                this.child.kill("SIGKILL");
                await this.exited;
            }
        }
        if (!this.logClosed) {
            this.logClosed = true;
            fs.closeSync(this.logFd);
        }
    }
}
