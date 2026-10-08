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

const { Runner } = require("../../.e2e-dist/e2e/src/runnerDriver");

const launch = (script = "fake-runner.js") => ({
    command: process.execPath,
    args: [path.join(__dirname, script)],
    env: process.env,
});
const tempLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-runner-")), "run.log");

test("start returns the runtime reply and JSON-RPC lines stay out of the log lines", async () => {
    const runner = Runner.spawn(launch(), tempLog());
    try {
        assert.equal(await runner.start("/tmp/app.siddhi"), "Siddhi app started");
        assert.ok(runner.lines.some((line) => line.includes("started /tmp/app.siddhi")));
        assert.ok(runner.lines.every((line) => !line.startsWith('{"jsonrpc"')));
    } finally {
        await runner.terminate();
    }
});

test("stderr lines are kept as log lines and the log file holds the raw output", async () => {
    const logPath = tempLog();
    const runner = Runner.spawn(launch(), logPath);
    try {
        assert.ok(await runner.waitForLog(/^WARNING: fake jvm warning$/, 5000));
        assert.ok(await runner.waitForLog(/booted/, 5000));
    } finally {
        await runner.terminate();
    }
    const content = fs.readFileSync(logPath, "utf8");
    assert.match(content, /booted/);
    assert.match(content, /WARNING: fake jvm warning/);
});

test("waitForLog returns undefined on timeout", async () => {
    const runner = Runner.spawn(launch(), tempLog());
    try {
        assert.equal(await runner.waitForLog(/never appears/, 300), undefined);
        assert.equal(runner.hasLog(/never appears/), false);
    } finally {
        await runner.terminate();
    }
});

test("an RPC error rejects with the error", async () => {
    const runner = Runner.spawn(launch(), tempLog());
    try {
        await assert.rejects(runner.rpc("boom", {}, 5000), /boom/);
    } finally {
        await runner.terminate();
    }
});

test("an unanswered RPC rejects after its timeout", async () => {
    const runner = Runner.spawn(launch(), tempLog());
    try {
        await assert.rejects(runner.rpc("no-reply", {}, 200), /timed out/);
    } finally {
        await runner.terminate();
    }
});

test("stop sends runtime/stop, reports a clean stop and ends the process", async () => {
    const runner = Runner.spawn(launch(), tempLog());
    await runner.start("/tmp/app.siddhi");
    const result = await runner.stop();
    assert.deepEqual(result, { clean: true, detail: "Siddhi app stopped" });
    assert.equal(runner.hasExited(), true);
});

test("terminate escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const runner = Runner.spawn(launch("fake-runner-stubborn.js"), tempLog());
    assert.ok(await runner.waitForLog(/stubborn ready/, 5000));
    await runner.terminate(300);
    assert.equal(runner.hasExited(), true);
});

test("stop reports an unclean stop when the runner never answers, and still ends the process", async () => {
    const runner = Runner.spawn(launch("fake-runner-stubborn.js"), tempLog());
    assert.ok(await runner.waitForLog(/stubborn ready/, 5000));
    const result = await runner.stop(300, 300);
    assert.equal(result.clean, false);
    assert.equal(runner.hasExited(), true);
});

test("a command that cannot be spawned does not hang", async () => {
    const runner = Runner.spawn({ command: "definitely-not-a-command-xyz", args: [], env: process.env }, tempLog());
    await assert.rejects(runner.rpc("runtime/start", {}, 2000));
    await runner.terminate();
    assert.equal(runner.hasExited(), true);
});
