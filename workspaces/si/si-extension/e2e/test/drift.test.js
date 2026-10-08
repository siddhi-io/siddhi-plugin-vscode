/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const launch = require("../../.e2e-dist/e2e/src/launch");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", "..", "src", relative), "utf8");
const debugHelper = read("debugger/debugHelper.ts");
const server = read("server/server.ts");

function stringArray(source, name) {
    const match = new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(source);
    assert.ok(match, `${name} not found in the extension source`);
    return Array.from(match[1].matchAll(/"([^"]*)"/g)).map((entry) => entry[1]);
}

function stringConstant(source, name) {
    const match = new RegExp(`\\b${name}(?::\\s*string)?\\s*=\\s*"([^"]*)"`).exec(source);
    assert.ok(match, `${name} not found in the extension source`);
    return match[1];
}

const hasLiteral = (source, text) => ['"', "`", "'"].some((quote) => source.includes(`${quote}${text}${quote}`));

test("Java flag arrays equal the extension's", () => {
    assert.deepEqual(launch.JAVA_VERSION_BASED_ARGS, stringArray(debugHelper, "JAVA_VERSION_BASED_ARGS"));
    assert.deepEqual(launch.JAVA_24_ARGS, stringArray(debugHelper, "JAVA_24_ARGS"));
});

test("main classes equal the extension's", () => {
    assert.equal(launch.RUNNER_MAIN, stringConstant(debugHelper, "SIDDHI_APP_RUNNER"));
    assert.equal(launch.LS_MAIN, stringConstant(server, "main"));
});

test("Java version thresholds are unchanged in the extension", () => {
    assert.ok(debugHelper.includes("javaMajorVersion > 11"), "runner add-opens threshold changed");
    assert.ok(debugHelper.includes("javaMajorVersion >= 24"), "runner JDK 24 threshold changed");
    assert.ok(server.includes("javaMajorVersion >= 24"), "LS JDK 24 threshold changed");
});

test("fixed system properties appear verbatim in the extension", () => {
    for (const arg of [launch.SLF4J_PROVIDER_ARG]) {
        assert.ok(hasLiteral(debugHelper, arg), `${arg} missing from debugHelper.ts`);
        assert.ok(hasLiteral(server, arg), `${arg} missing from server.ts`);
    }
    for (const arg of [launch.KEYSTORE_PASSWORD_ARG, launch.TRUSTSTORE_PASSWORD_ARG, launch.WSO2_RUNTIME_ARG]) {
        assert.ok(hasLiteral(server, arg), `${arg} missing from server.ts`);
    }
    for (const arg of launch.INSTALL_TOOL_ARGS) {
        assert.ok(hasLiteral(server, arg), `${arg} missing from server.ts`);
    }
    assert.ok(hasLiteral(server, launch.INSTALL_TOOL_MAIN), "install tool main class changed");
});

test("system property prefixes appear in the extension", () => {
    for (const prefix of launch.LS_PROPERTY_PREFIXES) {
        assert.ok(
            server.includes(`\`${prefix}`) || server.includes(`"${prefix}`),
            `${prefix} missing from server.ts`
        );
    }
    assert.ok(debugHelper.includes("`-Dlog4j2.configurationFile="), "runner log4j2 property changed");
});

test("environment variables are still CARBON_HOME and RUNTIME_PATH", () => {
    assert.ok(debugHelper.includes("CARBON_HOME: siddhiHome"));
    assert.ok(debugHelper.includes("RUNTIME_PATH,"));
    assert.ok(server.includes("CARBON_HOME,"));
    assert.ok(server.includes("RUNTIME_PATH: runtimePath"));
});
