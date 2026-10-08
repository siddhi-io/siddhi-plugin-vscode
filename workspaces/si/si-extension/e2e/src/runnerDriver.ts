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
import * as readline from "readline";
import { commandLineOf, openJarNames, raceTimeout, sleep } from "./exec";
import { LaunchSpec } from "./launch";

interface Pending {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class Runner {
    readonly lines: string[] = [];
    readonly pid: number;
    private readonly pending = new Map<number, Pending>();
    private readonly logFd: number;
    private readonly exited: Promise<void>;
    private nextId = 1;
    private exitCode: number | null | undefined;
    private logClosed = false;

    static spawn(launch: LaunchSpec, logPath: string): Runner {
        const child = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"], env: launch.env });
        return new Runner(child, logPath);
    }

    private constructor(private readonly child: ChildProcess, logPath: string) {
        this.pid = child.pid ?? -1;
        this.logFd = fs.openSync(logPath, "w");
        this.exited = new Promise<void>((resolve) => {
            child.once("exit", (code) => {
                this.exitCode = code;
                this.failPending(new Error(`process exited with code ${code}`));
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
        if (child.stdout) {
            readline.createInterface({ input: child.stdout }).on("line", (line) => this.onStdout(line));
        }
        if (child.stderr) {
            readline.createInterface({ input: child.stderr }).on("line", (line) => this.onLine(line));
        }
    }

    private record(line: string): void {
        if (!this.logClosed) {
            fs.writeSync(this.logFd, `${line}\n`);
        }
    }

    private onLine(line: string): void {
        this.lines.push(line);
        this.record(line);
    }

    private onStdout(line: string): void {
        if (line.startsWith('{"jsonrpc"')) {
            try {
                const message = JSON.parse(line);
                const entry = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
                if (entry) {
                    this.pending.delete(message.id);
                    clearTimeout(entry.timer);
                    this.record(line);
                    if ("error" in message) {
                        entry.reject(new Error(JSON.stringify(message.error)));
                    } else {
                        entry.resolve(message.result);
                    }
                    return;
                }
            } catch {
                this.onLine(line);
                return;
            }
        }
        this.onLine(line);
    }

    private failPending(error: Error): void {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.reject(error);
            this.pending.delete(id);
        }
    }

    rpc(method: string, params: unknown, timeoutMs = 60000): Promise<unknown> {
        if (this.exitCode !== undefined) {
            return Promise.reject(new Error(`${method}: the process has already exited`));
        }
        const id = this.nextId++;
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${method} timed out after ${timeoutMs} ms`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params, id })}\n`);
        });
    }

    async start(appPath: string, timeoutMs = 90000): Promise<string> {
        return String(await this.rpc("runtime/start", { path: appPath }, timeoutMs));
    }

    hasLog(pattern: RegExp): boolean {
        return this.lines.some((line) => pattern.test(line));
    }

    async waitForLog(pattern: RegExp, timeoutMs: number): Promise<string | undefined> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const hit = this.lines.find((line) => pattern.test(line));
            if (hit !== undefined) {
                return hit;
            }
            if (Date.now() >= deadline) {
                return undefined;
            }
            await sleep(100);
        }
    }

    snapshot(): { commandLine: string; openJars: string[] } {
        if (this.exitCode !== undefined || this.pid < 0) {
            return { commandLine: "", openJars: [] };
        }
        return { commandLine: commandLineOf(this.pid), openJars: openJarNames(this.pid) };
    }

    hasExited(): boolean {
        return this.exitCode !== undefined;
    }

    async stop(rpcTimeoutMs = 30000, graceMs = 10000): Promise<{ clean: boolean; detail: string }> {
        let clean = false;
        let detail: string;
        try {
            detail = String(await this.rpc("runtime/stop", {}, rpcTimeoutMs));
            clean = true;
        } catch (error) {
            detail = error instanceof Error ? error.message : String(error);
        }
        await this.terminate(graceMs);
        return { clean, detail };
    }

    async terminate(graceMs = 10000): Promise<void> {
        if (this.exitCode === undefined) {
            this.child.kill("SIGTERM");
            const exited = await raceTimeout(this.exited.then(() => true), graceMs, false);
            if (!exited) {
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
