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
const net = require("net");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
    describeError,
    fileHash,
    isPortInUse,
    raceTimeout,
    registerCleanup,
    run,
    runCleanups,
    runOrThrow,
    sleep,
} = require("../../.e2e-dist/e2e/src/exec");

test("run returns stdout and status", () => {
    const result = run(process.execPath, ["-e", "console.log('hi')"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "hi");
});

test("run reports a missing command instead of throwing", () => {
    const result = run("definitely-not-a-command-xyz", []);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
});

test("run passes stdin input", () => {
    const result = run(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { input: "abc" });
    assert.equal(result.stdout, "abc");
});

test("runOrThrow throws with the status and stderr on failure", () => {
    assert.throws(
        () => runOrThrow(process.execPath, ["-e", "console.error('bad'); process.exit(3)"]),
        /status 3.*bad/s
    );
});

test("isPortInUse is true only while a server listens", async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    assert.equal(await isPortInUse(port), true);
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await isPortInUse(port), false);
});

test("fileHash matches known digests", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-hash-")), "f");
    fs.writeFileSync(file, "abc");
    assert.equal(fileHash(file, "sha1"), "a9993e364706816aba3e25717850c26c9cd0d89d");
    assert.equal(fileHash(file, "sha256"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("describeError handles errors and other values", () => {
    assert.equal(describeError(new Error("boom")), "boom");
    assert.equal(describeError("text"), "text");
});

test("sleep waits at least the requested time", async () => {
    const start = Date.now();
    await sleep(30);
    assert.ok(Date.now() - start >= 25);
});

test("raceTimeout returns the promise result without a lingering timer, or the fallback on timeout", async () => {
    const start = Date.now();
    assert.equal(await raceTimeout(Promise.resolve("done"), 60000, "late"), "done");
    assert.ok(Date.now() - start < 1000);
    assert.equal(await raceTimeout(new Promise(() => {}), 50, "late"), "late");
});

test("cleanups run once and can be unregistered", async () => {
    const calls = [];
    registerCleanup(async () => {
        calls.push("a");
    });
    const unregister = registerCleanup(async () => {
        calls.push("b");
    });
    unregister();
    await runCleanups();
    await runCleanups();
    assert.deepEqual(calls, ["a"]);
});
