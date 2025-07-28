/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as path from "path";
import { ChildProcess } from "child_process";
import { debug, log, showOutputChannel } from "../utils/logger";
import * as readline from "readline";
import { activateEventSimulator, deactivateEventSimulator } from "../visualizer/activate";
import { extension } from "../SIExtensionContext";
import { findLSJarPath, getClassPath, getLog4jConfigFile, getSiddhiFileNameWithoutExtension } from "../utils/utils";
const child_process = require("child_process");

let rl: readline.Interface;
const pendingRequests = new Map<number, { resolve: (result: any) => void; reject: (error: any) => void }>();
let nextRequestId = 1;

const SIDDHI_APP_RUNNER = "io.siddhi.langserver.runner.SiddhiAppLSRunner";

export async function startSiddhiApp(siddhiHome: string, javaHome: string, program: string) {
    showOutputChannel();
    const RUNTIME_PATH = path.join(String(siddhiHome), "wso2", "server");

    let args: string[] = [...getClassPath(siddhiHome)];

    if (process.env.RUNTIME_DEBUG === "true") {
        args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005,quiet=y,");
        debug("Runtime starting in debug mode.");
    }

    args.push(
        "-Dslf4j.provider=org.apache.logging.slf4j.SLF4JServiceProvider",
        `-Dlog4j2.configurationFile=${getLog4jConfigFile(process.platform, findLSJarPath("runner"))}`
    );

    args.push(SIDDHI_APP_RUNNER, program);

    let executable: string = path.join(String(javaHome), "bin", "java");
    
    if (process.platform === "win32") {
        if (!executable.endsWith(".exe")) {
            executable += ".exe";
        }
        if (executable.includes(" ")) {
            executable = `"${executable}"`;
        }
    }
    
    let javaProcess = child_process.spawn(executable, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: {
            ...process.env,
            CARBON_HOME: siddhiHome,
            RUNTIME_PATH,
        },
    });

    let siddhiAppName = getSiddhiFileNameWithoutExtension(program);

    extension.javaRuntimes.set(siddhiAppName, javaProcess!);
    rl = readline.createInterface({ input: javaProcess!.stdout! });

    rl.on("line", (line) => {
        handleRpcOutput(line);
    });

    javaProcess!.stderr!.on("data", (data: Buffer) => {
        log(data.toString());
    });

    try {
        await sendRpcRequest(siddhiAppName, "runtime/start", {
            path: program,
        });
        if (!extension.runningSiddhiApps.includes(siddhiAppName)) {
            extension.runningSiddhiApps.push(siddhiAppName);
        }
        activateEventSimulator();
    } catch (error) {
        if (error && typeof error === "object" && "message" in error) {
            log(`Error starting Siddhi application: ${(error as { message: string }).message}`);
        } else {
            log(`Error starting Siddhi application`);
        }
    }
}

function handleRpcOutput(line: string) {
    try {
        const response = JSON.parse(line);
        if (response.jsonrpc && (response.result || response.error)) {
            const handler = pendingRequests.get(response.id);
            if (handler) {
                pendingRequests.delete(response.id);
                response.error ? handler.reject(response.error) : handler.resolve(response.result);
            }
        }
    } catch (e) {
        log(line);
    }
}

export async function stopSiddhiApplication(siddhiAppName: string) {
    await sendRpcRequest(siddhiAppName, "runtime/stop", {});
    stopProcess(siddhiAppName);
    extension.runningSiddhiApps = extension.runningSiddhiApps.filter((name) => name !== siddhiAppName);
    deactivateEventSimulator();
}

export async function simulateSingleEvent(siddhiAppName: string, body: string) {
    await sendRpcRequest(siddhiAppName, "eventSimulator/singleEvent", { body });
}

export async function feedSimulate(siddhiAppName: string, action: string, simulationName: string) {
    await sendRpcRequest(siddhiAppName, "eventSimulator/feedSimulation", { action, simulationName });
}

function sendRpcRequest(siddhiApp, method, params) {
    const id = nextRequestId;
    const request = {
        jsonrpc: "2.0",
        method,
        params,
        id,
    };
    nextRequestId++;
    let siddhiAppRuntime = extension.javaRuntimes.get(siddhiApp);

    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        siddhiAppRuntime!.stdin!.write(JSON.stringify(request) + "\n");
    });
}

function stopProcess(siddhiApp: string) {
    let runtime: ChildProcess = extension.javaRuntimes.get(siddhiApp)!;
    if (runtime) {
        extension.javaRuntimes.delete(siddhiApp)!;
        deactivateEventSimulator();
        runtime.kill();
    }
}
