/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseArgs } = require("../../.e2e-dist/e2e/src/cli");

test("parseArgs applies defaults", () => {
    const options = parseArgs(["--pack", "p.zip"], { JAVA_HOME: "/jdk" });
    assert.equal(options.pack, "p.zip");
    assert.equal(options.javaHome, "/jdk");
    assert.deepEqual(options.only, []);
    assert.equal(options.containerPrefix, "si-e2e");
    assert.equal(options.out, "e2e-results");
    assert.equal(options.skipInfra, false);
    assert.equal(options.skipIde, false);
});

test("parseArgs reads values and flags and ignores a bare --", () => {
    const options = parseArgs(
        [
            "--",
            "--pack",
            "https://x.test/p.zip",
            "--vsix",
            "a.vsix",
            "--ls-dir",
            "/ls",
            "--java-home",
            "/j",
            "--only",
            "a,b",
            "--container-prefix",
            "si-test",
            "--out",
            "res",
            "--work-dir",
            "/w",
            "--skip-infra",
            "--skip-ls",
            "--skip-ide",
            "--keep-infra",
            "--keep-work",
        ],
        {}
    );
    assert.deepEqual(
        [options.pack, options.vsix, options.lsDir, options.javaHome, options.containerPrefix, options.out, options.workDir],
        ["https://x.test/p.zip", "a.vsix", "/ls", "/j", "si-test", "res", "/w"]
    );
    assert.deepEqual(options.only, ["a", "b"]);
    assert.deepEqual(
        [options.skipInfra, options.skipLs, options.skipIde, options.keepInfra, options.keepWork],
        [true, true, true, true, true]
    );
});

test("--java-home overrides JAVA_HOME", () => {
    assert.equal(parseArgs(["--pack", "p.zip", "--java-home", "/a"], { JAVA_HOME: "/b" }).javaHome, "/a");
});

test("parseArgs rejects unknown flags and missing values", () => {
    assert.throws(() => parseArgs(["--pack", "p.zip", "--nope"], {}), /Unknown option --nope/);
    assert.throws(() => parseArgs(["--pack"], {}), /--pack requires a value/);
});

test("--pack is required unless --dry-run or --help is given", () => {
    assert.throws(() => parseArgs([], {}), /--pack is required/);
    assert.equal(parseArgs(["--dry-run"], {}).dryRun, true);
    assert.equal(parseArgs(["--help"], {}).help, true);
});
