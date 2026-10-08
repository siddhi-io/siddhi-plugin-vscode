/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as path from "path";
import { describeError, run } from "./exec";
import { installJarsLaunch, lsLaunch } from "./launch";
import { LanguageServerClient } from "./lsClient";
import { diffSnapshots, snapshotJars } from "./pack";
import { LsJars } from "./vsix";

export interface PrepareInput {
    javaHome: string;
    javaMajor: number | null;
    packHome: string;
    ls: LsJars;
    extensions: string[];
    logDir: string;
}

function runInstallJars(input: PrepareInput): void {
    const launch = installJarsLaunch({ javaHome: input.javaHome, packHome: input.packHome });
    const result = run(launch.command, launch.args, { env: launch.env, cwd: input.packHome, timeoutMs: 10 * 60 * 1000 });
    if (result.status !== 0) {
        throw new Error(`install-jars failed (status ${result.status}): ${result.stderr || result.stdout}`);
    }
}

export interface PrepareResult {
    changes: string[];
    failedExtensions: Record<string, string>;
}

export async function prepareExtensions(input: PrepareInput): Promise<PrepareResult> {
    const failedExtensions: Record<string, string> = {};
    const before = snapshotJars(input.packHome);
    runInstallJars(input);
    if (input.extensions.length > 0) {
        const client = LanguageServerClient.spawn(
            lsLaunch({ javaHome: input.javaHome, javaMajor: input.javaMajor, packHome: input.packHome, ls: input.ls }),
            path.join(input.logDir, "extension-installer-ls.log")
        );
        try {
            await client.initialize();
            const initialized = await client.request("extensionInstaller/initializeExtensionInstaller", {}, 120000);
            if (!initialized || initialized.success !== true) {
                throw new Error(`extension installer did not initialize: ${JSON.stringify(initialized)}`);
            }
            for (const extension of input.extensions) {
                try {
                    const response = await client.request(
                        "extensionInstaller/installDependencies",
                        { extensionName: extension },
                        15 * 60 * 1000
                    );
                    if (!response || response.error || response.status !== 0) {
                        failedExtensions[extension] = JSON.stringify(response).slice(0, 300);
                    }
                } catch (error) {
                    failedExtensions[extension] = describeError(error).slice(0, 300);
                }
            }
        } finally {
            await client.shutdown();
        }
        runInstallJars(input);
    }
    return { changes: diffSnapshots(before, snapshotJars(input.packHome)), failedExtensions };
}
