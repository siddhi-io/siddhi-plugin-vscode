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
import { pathToFileURL } from "url";
import { buildRuntimeClassPath } from "../../src/utils/runtimeClassPath";
import { run } from "./exec";
import { LsJars } from "./vsix";

export const RUNNER_MAIN = "io.siddhi.langserver.runner.SiddhiAppLSRunner";
export const LS_MAIN = "io.siddhi.langserver.launcher.StdioLauncher";
export const JAVA_VERSION_BASED_ARGS = [
    "--add-opens=java.base/sun.reflect.annotation=ALL-UNNAMED",
    "--add-opens=java.base/java.lang=ALL-UNNAMED",
    "--add-opens=jdk.management/com.sun.management.internal=ALL-UNNAMED",
    "--add-opens=java.base/java.net=ALL-UNNAMED",
    "--add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED",
];
export const JAVA_24_ARGS = ["--sun-misc-unsafe-memory-access=allow", "--enable-native-access=ALL-UNNAMED"];
export const SLF4J_PROVIDER_ARG = "-Dslf4j.provider=org.apache.logging.slf4j.SLF4JServiceProvider";
export const KEYSTORE_PASSWORD_ARG = "-Djavax.net.ssl.keyStorePassword=wso2carbon";
export const TRUSTSTORE_PASSWORD_ARG = "-Djavax.net.ssl.trustStorePassword=wso2carbon";
export const WSO2_RUNTIME_ARG = "-Dwso2.runtime=server";
export const LS_PROPERTY_PREFIXES = [
    "-Djavax.net.ssl.keyStore=",
    "-Djavax.net.ssl.trustStore=",
    "-Dcarbon.home=",
    "-Dwso2.runtime.path=",
    "-Dlog4j2.configurationFile=",
];
export const INSTALL_TOOL_ARGS = ["-Dwso2.carbon.tool=install-jars", "-Djdk.util.jar.enableMultiRelease=force"];
export const INSTALL_TOOL_MAIN = "org.wso2.carbon.tools.CarbonToolExecutor";

export interface LaunchSpec {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
}

export interface LaunchInput {
    javaHome: string;
    javaMajor: number | null;
    packHome: string;
    ls: LsJars;
}

export function parseJavaMajor(output: string): number | null {
    const match = output.match(/version\s+"([^"]+)"/i);
    if (!match) {
        return null;
    }
    const version = match[1];
    const major = version.startsWith("1.") ? parseInt(version.split(".")[1], 10) : parseInt(version.split(".")[0], 10);
    return Number.isNaN(major) ? null : major;
}

export function javaMajorVersion(javaExecutable: string): number | null {
    const result = run(javaExecutable, ["-version"]);
    if (result.status !== 0) {
        return null;
    }
    return parseJavaMajor(`${result.stdout}\n${result.stderr}`);
}

const javaExecutable = (javaHome: string): string => path.join(javaHome, "bin", "java");

const carbonEnv = (packHome: string): NodeJS.ProcessEnv => ({
    ...process.env,
    CARBON_HOME: packHome,
    RUNTIME_PATH: path.join(packHome, "wso2", "server"),
});

const log4jConfigFile = (jarPath: string): string => `jar:${pathToFileURL(jarPath).toString()}!/log4j2.properties`;

export function runnerLaunch(input: LaunchInput, appPath: string): LaunchSpec {
    const args = [...buildRuntimeClassPath(input.packHome, path.join(input.ls.dir, "*"))];
    if (input.javaMajor !== null && input.javaMajor > 11) {
        args.push(...JAVA_VERSION_BASED_ARGS);
    }
    if (input.javaMajor !== null && input.javaMajor >= 24) {
        args.push(...JAVA_24_ARGS);
    }
    args.push(
        SLF4J_PROVIDER_ARG,
        `-Dlog4j2.configurationFile=${log4jConfigFile(input.ls.runner)}`,
        RUNNER_MAIN,
        appPath
    );
    return { command: javaExecutable(input.javaHome), args, env: carbonEnv(input.packHome) };
}

export function lsLaunch(input: LaunchInput): LaunchSpec {
    const home = input.packHome;
    const args = [...buildRuntimeClassPath(home, path.join(input.ls.dir, "*"))];
    if (input.javaMajor !== null && input.javaMajor >= 24) {
        args.push(...JAVA_24_ARGS);
    }
    args.push(
        `-Djavax.net.ssl.keyStore=${path.join(home, "resources", "security", "wso2carbon.jks")}`,
        KEYSTORE_PASSWORD_ARG,
        `-Djavax.net.ssl.trustStore=${path.join(home, "resources", "security", "client-truststore.jks")}`,
        TRUSTSTORE_PASSWORD_ARG,
        `-Dcarbon.home=${home}`,
        `-Dwso2.runtime.path=${path.join(home, "wso2", "server")}`,
        WSO2_RUNTIME_ARG,
        SLF4J_PROVIDER_ARG,
        `-Dlog4j2.configurationFile=${log4jConfigFile(input.ls.launcher)}`,
        LS_MAIN
    );
    return { command: javaExecutable(input.javaHome), args, env: carbonEnv(home) };
}

export function installJarsLaunch(input: { javaHome: string; packHome: string }): LaunchSpec {
    const toolDir = path.join(input.packHome, "bin", "tools");
    const classPath = fs
        .readdirSync(toolDir)
        .filter((file) => file.endsWith(".jar"))
        .map((file) => path.delimiter + path.join(toolDir, file))
        .join("");
    return {
        command: javaExecutable(input.javaHome),
        args: ["-cp", classPath, ...INSTALL_TOOL_ARGS, INSTALL_TOOL_MAIN, input.packHome],
        env: carbonEnv(input.packHome),
    };
}
