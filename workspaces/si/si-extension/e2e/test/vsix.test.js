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

const { run } = require("../../.e2e-dist/e2e/src/exec");
const { extractLsJars, findLsJars, readVsixVersion } = require("../../.e2e-dist/e2e/src/vsix");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "e2e-vsix-"));

function makeVsix(jars) {
    const parent = tempDir();
    const lsDir = path.join(parent, "extension", "ls");
    fs.mkdirSync(lsDir, { recursive: true });
    for (const jar of jars) {
        fs.writeFileSync(path.join(lsDir, jar), jar);
    }
    fs.writeFileSync(path.join(parent, "extension", "package.json"), JSON.stringify({ version: "0.2.3" }));
    const vsix = path.join(parent, "x.vsix");
    assert.equal(run("zip", ["-qr", vsix, "extension"], { cwd: parent }).status, 0);
    return vsix;
}

const ALL = [
    "io.siddhi.langserver.core-1.0.1.jar",
    "io.siddhi.langserver.launcher-1.0.1.jar",
    "io.siddhi.langserver.runner-1.0.1.jar",
];

test("extractLsJars finds the three jars and records their sha1", () => {
    const ls = extractLsJars(makeVsix(ALL), tempDir());
    assert.equal(path.basename(ls.core), ALL[0]);
    assert.equal(path.basename(ls.launcher), ALL[1]);
    assert.equal(path.basename(ls.runner), ALL[2]);
    assert.equal(Object.keys(ls.sha1).length, 3);
    assert.match(ls.sha1[ALL[0]], /^[0-9a-f]{40}$/);
});

test("findLsJars names the missing jar", () => {
    const dir = tempDir();
    for (const jar of ALL.slice(0, 2)) {
        fs.writeFileSync(path.join(dir, jar), "x");
    }
    assert.throws(() => findLsJars(dir), /runner/);
});

test("findLsJars works on a plain directory (the --ls-dir case)", () => {
    const dir = tempDir();
    for (const jar of ALL) {
        fs.writeFileSync(path.join(dir, jar), "x");
    }
    assert.equal(findLsJars(dir).dir, dir);
});

test("readVsixVersion reads the extension manifest", () => {
    assert.equal(readVsixVersion(makeVsix(ALL)), "0.2.3");
});
