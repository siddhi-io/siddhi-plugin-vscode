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
    LS_EXIT_CHECK,
    LS_LEAK_CHECK,
    LS_START_CHECK,
    lsDiagnosticsCheck,
    runLsCheck,
} = require("../../.e2e-dist/e2e/src/lsCheck");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-lscheck-"));
const write = (name, text) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, text);
    return file;
};
const launch = { command: process.execPath, args: [path.join(__dirname, "fake-ls.js")], env: process.env };
const base = () => ({
    launch,
    logPath: path.join(dir, `ls-${Math.random().toString(16).slice(2)}.log`),
    apps: [{ name: "core/ok", path: write("ok.siddhi", "define stream S (a string);") }],
    leakApp: { path: write("leak.siddhi", "define stream L (a string);") },
    settleMs: 5,
});
const summary = (results) => results.map((result) => [result.name, result.status]);

test("a healthy language server passes every check", async () => {
    const results = await runLsCheck({ ...base(), connectionCount: () => 5 });
    assert.deepEqual(summary(results), [
        [LS_START_CHECK, "pass"],
        [lsDiagnosticsCheck("core/ok"), "pass"],
        [LS_LEAK_CHECK, "pass"],
        [LS_EXIT_CHECK, "pass"],
    ]);
});

test("diagnostics on an app fail that app's check and carry the message", async () => {
    const input = { ...base(), connectionCount: () => 5 };
    input.apps = [{ name: "core/bad", path: write("bad.siddhi", "BROKEN") }];
    const results = await runLsCheck(input);
    const check = results.find((result) => result.name === lsDiagnosticsCheck("core/bad"));
    assert.equal(check.status, "fail");
    assert.match(check.detail, /broken app/);
});

test("connection growth across edits fails the leak check", async () => {
    let count = 0;
    const results = await runLsCheck({ ...base(), connectionCount: () => (count += 10) });
    const leak = results.find((result) => result.name === LS_LEAK_CHECK);
    assert.equal(leak.status, "fail");
    assert.match(leak.detail, /10 -> 20/);
});

test("growth within the tolerance passes", async () => {
    let count = 0;
    const results = await runLsCheck({ ...base(), connectionCount: () => (count += 3) });
    assert.equal(results.find((result) => result.name === LS_LEAK_CHECK).status, "pass");
});

test("the leak check is skipped when no connection counter is available", async () => {
    const results = await runLsCheck(base());
    assert.equal(results.find((result) => result.name === LS_LEAK_CHECK).status, "skip");
});

test("a language server that cannot start fails the start check and stops early", async () => {
    const input = { ...base(), launch: { command: "definitely-not-a-command-xyz", args: [], env: process.env } };
    const results = await runLsCheck(input);
    assert.deepEqual(summary(results), [[LS_START_CHECK, "fail"]]);
});
