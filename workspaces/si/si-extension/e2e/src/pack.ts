/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as fs from "fs";
import * as path from "path";
import { fileHash, run, runOrThrow } from "./exec";

export const PACK_LAYOUT = [
    "bin/tools",
    "lib",
    "wso2/server",
    "wso2/lib/plugins",
    "resources/security/wso2carbon.jks",
];

export function isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

export function zipNameFrom(source: string): string {
    const pathname = isUrl(source) ? new URL(source).pathname : source;
    return path.basename(pathname);
}

export function resolveZip(source: string, downloadDir: string): string {
    const name = zipNameFrom(source);
    if (!name.toLowerCase().endsWith(".zip")) {
        throw new Error(`The pack must be a .zip file, got '${source}'`);
    }
    if (!isUrl(source)) {
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
            throw new Error(`Pack zip not found: ${source}`);
        }
        return path.resolve(source);
    }
    fs.mkdirSync(downloadDir, { recursive: true });
    const target = path.join(downloadDir, name);
    runOrThrow("curl", ["-fL", "--retry", "3", "--silent", "--show-error", "-o", target, source], {
        timeoutMs: 30 * 60 * 1000,
    });
    return target;
}

export function missingLayout(home: string): string[] {
    return PACK_LAYOUT.filter((rel) => !fs.existsSync(path.join(home, rel)));
}

export function findPackHome(root: string): string {
    const children = fs
        .readdirSync(root)
        .map((name) => path.join(root, name))
        .filter((candidate) => fs.statSync(candidate).isDirectory());
    for (const candidate of [root, ...children]) {
        if (missingLayout(candidate).length === 0) {
            return candidate;
        }
    }
    throw new Error(
        `The zip does not contain an SI pack. Missing in ${root}: ${missingLayout(root).join(", ")}`
    );
}

export function extractPack(zipPath: string, workDir: string): { home: string; zipSha256: string } {
    if (fs.existsSync(workDir)) {
        throw new Error(`Work directory ${workDir} already exists; a previous one is never reused`);
    }
    const integrity = run("unzip", ["-tq", zipPath]);
    if (integrity.status !== 0) {
        throw new Error(`Pack zip is corrupt or unreadable: ${zipPath}\n${integrity.stdout}${integrity.stderr}`);
    }
    const target = path.join(workDir, "pack");
    fs.mkdirSync(target, { recursive: true });
    runOrThrow("unzip", ["-q", zipPath, "-d", target], { timeoutMs: 30 * 60 * 1000 });
    return { home: findPackHome(target), zipSha256: fileHash(zipPath, "sha256") };
}

export function snapshotJars(home: string): string[] {
    const entries: string[] = [];
    for (const dir of ["lib", "_lib", ".jars"]) {
        const full = path.join(home, dir);
        if (!fs.existsSync(full)) {
            continue;
        }
        for (const name of fs.readdirSync(full)) {
            if (fs.statSync(path.join(full, name)).isFile()) {
                entries.push(`${dir}/${name}`);
            }
        }
    }
    return entries.sort();
}

export function diffSnapshots(before: string[], after: string[]): string[] {
    const was = new Set(before);
    const is = new Set(after);
    return [
        ...after.filter((entry) => !was.has(entry)).map((entry) => `+ ${entry}`),
        ...before.filter((entry) => !is.has(entry)).map((entry) => `- ${entry}`),
    ];
}
