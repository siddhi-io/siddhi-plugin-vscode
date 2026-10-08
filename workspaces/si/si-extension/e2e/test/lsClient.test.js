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

const { FrameParser, LanguageServerClient } = require("../../.e2e-dist/e2e/src/lsClient");

const tempLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-ls-")), "ls.log");
const spawnFake = () =>
    LanguageServerClient.spawn({ command: process.execPath, args: [path.join(__dirname, "fake-ls.js")], env: process.env }, tempLog());

test("FrameParser parses frames split across chunks, multibyte bodies and noise", () => {
    const parser = new FrameParser();
    const body = JSON.stringify({ a: "é" });
    const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    const first = parser.push(Buffer.concat([Buffer.from("noise\n"), frame.subarray(0, 10)]));
    assert.deepEqual(first, []);
    const second = parser.push(Buffer.concat([frame.subarray(10), frame]));
    assert.deepEqual(second, [{ a: "é" }, { a: "é" }]);
    assert.deepEqual(parser.noise, ["noise\n"]);
});

test("the client initializes, answers custom requests and tolerates stdout noise", async () => {
    const client = spawnFake();
    try {
        await client.initialize();
        assert.deepEqual(await client.request("custom/echo", { x: 1 }, 5000), { x: 1 });
        assert.ok(client.noise.some((text) => text.includes("noise before the first frame")));
    } finally {
        await client.terminate();
    }
});

test("diagnostics are reported per document and counted per publish", async () => {
    const client = spawnFake();
    try {
        await client.initialize();
        client.didOpen("file:///ok.siddhi", "fine");
        assert.deepEqual(await client.waitForDiagnostics("file:///ok.siddhi", 0, 5000), []);
        client.didOpen("file:///bad.siddhi", "BROKEN");
        const diagnostics = await client.waitForDiagnostics("file:///bad.siddhi", 0, 5000);
        assert.equal(diagnostics[0].message, "broken app");
        assert.equal(client.publishCount("file:///bad.siddhi"), 1);
        client.didChange("file:///bad.siddhi", 2, "fixed");
        assert.deepEqual(await client.waitForDiagnostics("file:///bad.siddhi", 1, 5000), []);
        assert.equal(client.publishCount("file:///bad.siddhi"), 2);
    } finally {
        await client.terminate();
    }
});

test("waitForDiagnostics rejects on timeout", async () => {
    const client = spawnFake();
    try {
        await client.initialize();
        await assert.rejects(client.waitForDiagnostics("file:///none.siddhi", 0, 200), /no diagnostics/);
    } finally {
        await client.terminate();
    }
});

test("shutdown returns the exit code 0", async () => {
    const client = spawnFake();
    await client.initialize();
    assert.equal(await client.shutdown(), 0);
});
