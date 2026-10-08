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
import { fileHash, runOrThrow } from "./exec";

export interface LsJars {
    dir: string;
    core: string;
    launcher: string;
    runner: string;
    sha1: Record<string, string>;
}

export function findLsJars(dir: string): LsJars {
    const jars = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".jar"))
        .sort();
    const pick = (part: string): string => {
        const matches = jars.filter((name) => name.includes(`io.siddhi.langserver.${part}`));
        if (matches.length !== 1) {
            throw new Error(`Expected exactly one language server '${part}' jar in ${dir}, found ${matches.length}`);
        }
        return path.join(dir, matches[0]);
    };
    const sha1: Record<string, string> = {};
    for (const jar of jars) {
        sha1[jar] = fileHash(path.join(dir, jar), "sha1");
    }
    return { dir, core: pick("core"), launcher: pick("launcher"), runner: pick("runner"), sha1 };
}

export function extractLsJars(vsixPath: string, workDir: string): LsJars {
    const target = path.join(workDir, "vsix");
    fs.mkdirSync(target, { recursive: true });
    runOrThrow("unzip", ["-q", "-o", vsixPath, "extension/ls/*", "-d", target]);
    return findLsJars(path.join(target, "extension", "ls"));
}

export function readVsixVersion(vsixPath: string): string {
    const manifest = JSON.parse(runOrThrow("unzip", ["-p", vsixPath, "extension/package.json"]).stdout);
    return String(manifest.version);
}
