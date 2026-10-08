/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";

export interface ExecOptions {
    input?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}

export interface ExecResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

export function run(command: string, args: string[], options: ExecOptions = {}): ExecResult {
    const result = spawnSync(command, args, {
        input: options.input,
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    });
    const failure = result.error ? String(result.error) : "";
    return { status: result.status, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${failure}` };
}

export function runOrThrow(command: string, args: string[], options: ExecOptions = {}): ExecResult {
    const result = run(command, args, options);
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(" ")} failed (status ${result.status}): ${result.stderr || result.stdout}`
        );
    }
    return result;
}

export const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function raceTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

export function isPortInUse(port: number, host = "127.0.0.1"): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host });
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });
}

export function fileHash(file: string, algorithm: "sha1" | "sha256"): string {
    const hash = crypto.createHash(algorithm);
    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(1024 * 1024);
    try {
        for (;;) {
            const read = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (read === 0) {
                break;
            }
            hash.update(buffer.subarray(0, read));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest("hex");
}

export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function openJarNames(pid: number): string[] {
    const result = run("lsof", ["-p", String(pid), "-Fn"]);
    if (result.status !== 0) {
        return [];
    }
    const names = result.stdout
        .split("\n")
        .filter((line) => line.startsWith("n") && line.endsWith(".jar"))
        .map((line) => path.basename(line.slice(1)));
    return Array.from(new Set(names)).sort();
}

export function commandLineOf(pid: number): string {
    return run("ps", ["-o", "command=", "-p", String(pid)]).stdout.trim();
}

const cleanups = new Set<() => Promise<void>>();

export function registerCleanup(fn: () => Promise<void>): () => void {
    cleanups.add(fn);
    return () => {
        cleanups.delete(fn);
    };
}

export async function runCleanups(): Promise<void> {
    for (const fn of Array.from(cleanups)) {
        try {
            await fn();
        } catch {
            continue;
        }
    }
    cleanups.clear();
}
