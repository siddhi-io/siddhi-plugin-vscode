/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as fs from "fs";
import { pathToFileURL } from "url";
import { describeError, sleep } from "./exec";
import { LaunchSpec } from "./launch";
import { LanguageServerClient } from "./lsClient";
import { CheckResult, fail, pass, skip } from "./results";

export const LS_START_CHECK = "ls: initializes";
export const LS_LEAK_CHECK = "ls: no connection-pool growth across edits";
export const LS_EXIT_CHECK = "ls: exits 0 after shutdown";
export const LEAK_TOLERANCE = 5;
export const lsDiagnosticsCheck = (name: string): string => `ls: no diagnostics for ${name}`;

export interface LsCheckInput {
    launch: LaunchSpec;
    logPath: string;
    apps: Array<{ name: string; path: string }>;
    leakApp: { path: string };
    connectionCount?: () => number;
    settleMs?: number;
}

async function leakCheck(client: LanguageServerClient, input: LsCheckInput): Promise<CheckResult> {
    if (!input.connectionCount) {
        return skip(LS_LEAK_CHECK, "no database connection counter available");
    }
    const settleMs = input.settleMs ?? 1500;
    try {
        const uri = pathToFileURL(input.leakApp.path).toString();
        const text = fs.readFileSync(input.leakApp.path, "utf8");
        client.didOpen(uri, text);
        await client.waitForDiagnostics(uri, 0, 60000);
        await sleep(settleMs);
        const baseline = input.connectionCount();
        for (let version = 2; version <= 4; version++) {
            const before = client.publishCount(uri);
            client.didChange(uri, version, `${text}\n/* edit ${version} */\n`);
            await client.waitForDiagnostics(uri, before, 60000);
            await sleep(settleMs);
        }
        const after = input.connectionCount();
        return after - baseline <= LEAK_TOLERANCE
            ? pass(LS_LEAK_CHECK, `connections ${baseline} -> ${after} over 3 edits`)
            : fail(LS_LEAK_CHECK, `connections grew ${baseline} -> ${after} over 3 edits`);
    } catch (error) {
        return fail(LS_LEAK_CHECK, describeError(error));
    }
}

export async function runLsCheck(input: LsCheckInput): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const client = LanguageServerClient.spawn(input.launch, input.logPath);
    try {
        await client.initialize();
        results.push(pass(LS_START_CHECK, "initialize answered"));
    } catch (error) {
        results.push(fail(LS_START_CHECK, describeError(error)));
        await client.terminate();
        return results;
    }
    for (const app of input.apps) {
        const name = lsDiagnosticsCheck(app.name);
        try {
            const uri = pathToFileURL(app.path).toString();
            client.didOpen(uri, fs.readFileSync(app.path, "utf8"));
            const diagnostics = await client.waitForDiagnostics(uri, 0, 60000);
            results.push(
                diagnostics.length === 0
                    ? pass(name)
                    : fail(name, diagnostics.map((diagnostic) => diagnostic.message).join("; "))
            );
        } catch (error) {
            results.push(fail(name, describeError(error)));
        }
    }
    results.push(await leakCheck(client, input));
    const code = await client.shutdown();
    results.push(code === 0 ? pass(LS_EXIT_CHECK, "exit code 0") : fail(LS_EXIT_CHECK, `exit code ${code}`));
    return results;
}
