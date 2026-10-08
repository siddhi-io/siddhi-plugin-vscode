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
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
    JAVA_24_ARGS,
    JAVA_VERSION_BASED_ARGS,
    installJarsLaunch,
    lsLaunch,
    parseJavaMajor,
    runnerLaunch,
} = require("../../.e2e-dist/e2e/src/launch");

const ls = {
    dir: "/ext/ls",
    core: "/ext/ls/io.siddhi.langserver.core-1.0.1.jar",
    launcher: "/ext/ls/io.siddhi.langserver.launcher-1.0.1.jar",
    runner: "/ext/ls/io.siddhi.langserver.runner-1.0.1.jar",
    sha1: {},
};
const input = (javaMajor) => ({ javaHome: "/jdk", javaMajor, packHome: "/pack", ls });
const CP = "/ext/ls/*:/pack/lib/*:/pack/.jars/*:/pack/wso2/lib/plugins/*";

test("parseJavaMajor reads modern and legacy version strings", () => {
    assert.equal(parseJavaMajor('openjdk version "25.0.1" 2025-10-21'), 25);
    assert.equal(parseJavaMajor('java version "1.8.0_392"'), 8);
    assert.equal(parseJavaMajor('openjdk version "11.0.20" 2023-07-18'), 11);
    assert.equal(parseJavaMajor("not java"), null);
});

test("runnerLaunch on JDK 25 matches the extension's argument order exactly", () => {
    const launch = runnerLaunch(input(25), "/apps/a.siddhi");
    assert.equal(launch.command, "/jdk/bin/java");
    assert.deepEqual(launch.args, [
        "-cp",
        CP,
        ...JAVA_VERSION_BASED_ARGS,
        ...JAVA_24_ARGS,
        "-Dslf4j.provider=org.apache.logging.slf4j.SLF4JServiceProvider",
        "-Dlog4j2.configurationFile=jar:file:///ext/ls/io.siddhi.langserver.runner-1.0.1.jar!/log4j2.properties",
        "io.siddhi.langserver.runner.SiddhiAppLSRunner",
        "/apps/a.siddhi",
    ]);
    assert.equal(launch.env.CARBON_HOME, "/pack");
    assert.equal(launch.env.RUNTIME_PATH, "/pack/wso2/server");
});

test("runnerLaunch adds flags by Java version: none on 11, add-opens on 17, both on 24", () => {
    const flags = (major) => runnerLaunch(input(major), "/a.siddhi").args.filter((arg) => arg.startsWith("--"));
    assert.deepEqual(flags(11), []);
    assert.deepEqual(flags(17), JAVA_VERSION_BASED_ARGS);
    assert.deepEqual(flags(23), JAVA_VERSION_BASED_ARGS);
    assert.deepEqual(flags(24), [...JAVA_VERSION_BASED_ARGS, ...JAVA_24_ARGS]);
    assert.deepEqual(flags(null), []);
});

test("lsLaunch passes only the JDK 24 flags and the LS system properties", () => {
    const launch = lsLaunch(input(25));
    assert.deepEqual(launch.args.slice(0, 2), ["-cp", CP]);
    assert.deepEqual(
        launch.args.filter((arg) => arg.startsWith("--")),
        JAVA_24_ARGS
    );
    assert.ok(launch.args.includes("-Dcarbon.home=/pack"));
    assert.ok(launch.args.includes("-Dwso2.runtime.path=/pack/wso2/server"));
    assert.ok(launch.args.includes("-Dwso2.runtime=server"));
    assert.ok(launch.args.includes("-Djavax.net.ssl.keyStore=/pack/resources/security/wso2carbon.jks"));
    assert.equal(launch.args[launch.args.length - 1], "io.siddhi.langserver.launcher.StdioLauncher");
    assert.equal(lsLaunch(input(17)).args.filter((arg) => arg.startsWith("--")).length, 0);
});

test("installJarsLaunch builds the tool classpath with a leading delimiter, like the extension", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-launch-"));
    fs.mkdirSync(path.join(home, "bin", "tools"), { recursive: true });
    fs.writeFileSync(path.join(home, "bin", "tools", "a.jar"), "x");
    fs.writeFileSync(path.join(home, "bin", "tools", "notes.txt"), "x");
    const launch = installJarsLaunch({ javaHome: "/jdk", packHome: home });
    assert.deepEqual(launch.args, [
        "-cp",
        `:${path.join(home, "bin", "tools", "a.jar")}`,
        "-Dwso2.carbon.tool=install-jars",
        "-Djdk.util.jar.enableMultiRelease=force",
        "org.wso2.carbon.tools.CarbonToolExecutor",
        home,
    ]);
    assert.equal(launch.env.CARBON_HOME, home);
});
