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
const http = require("http");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { Runner } = require("../../.e2e-dist/e2e/src/runnerDriver");
const { executeStep } = require("../../.e2e-dist/e2e/src/steps");

const tempLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-steps-")), "run.log");
const spawnFake = () =>
    Runner.spawn({ command: process.execPath, args: [path.join(__dirname, "fake-runner.js")], env: process.env }, tempLog());
const context = (runner) => ({ runners: new Map([["app.siddhi", runner]]), defaultApp: "app.siddhi", services: { prefix: "x" } });

test("expect-log passes when the line appears and names the matched line", async () => {
    const runner = spawnFake();
    try {
        const result = await executeStep({ type: "expect-log", pattern: "booted", timeoutMs: 5000 }, context(runner));
        assert.equal(result.status, "pass");
        assert.match(result.name, /log contains \/booted\//);
        assert.match(result.detail, /booted/);
    } finally {
        await runner.terminate();
    }
});

test("expect-log fails with the timeout when the line never appears", async () => {
    const runner = spawnFake();
    try {
        const result = await executeStep({ type: "expect-log", pattern: "never", timeoutMs: 200, name: "custom name" }, context(runner));
        assert.equal(result.status, "fail");
        assert.equal(result.name, "custom name");
        assert.match(result.detail, /not seen within 200 ms/);
    } finally {
        await runner.terminate();
    }
});

test("expect-no-log passes when absent after the wait and fails when present", async () => {
    const runner = spawnFake();
    try {
        await runner.waitForLog(/booted/, 5000);
        const absent = await executeStep({ type: "expect-no-log", pattern: "never", afterMs: 100 }, context(runner));
        assert.equal(absent.status, "pass");
        const present = await executeStep({ type: "expect-no-log", pattern: "booted", afterMs: 50 }, context(runner));
        assert.equal(present.status, "fail");
    } finally {
        await runner.terminate();
    }
});

test("an unknown app reference fails the step instead of throwing", async () => {
    const runner = spawnFake();
    try {
        const result = await executeStep({ type: "expect-log", pattern: "x", app: "other.siddhi" }, context(runner));
        assert.equal(result.status, "fail");
        assert.match(result.detail, /no runner for app 'other.siddhi'/);
    } finally {
        await runner.terminate();
    }
});

test("http-post sends JSON and accepts the expected status, fails otherwise", async () => {
    const received = [];
    const server = http.createServer((request, response) => {
        let body = "";
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
            received.push({ method: request.method, type: request.headers["content-type"], body });
            response.statusCode = request.url === "/teapot" ? 418 : 200;
            response.end("ok");
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
        const ok = await executeStep({ type: "http-post", url: `http://127.0.0.1:${port}/a`, body: { n: 1 } }, context(null));
        assert.equal(ok, undefined);
        assert.deepEqual(received[0], { method: "POST", type: "application/json", body: '{"n":1}' });
        const bad = await executeStep({ type: "http-post", url: `http://127.0.0.1:${port}/teapot`, body: {} }, context(null));
        assert.equal(bad.status, "fail");
        assert.match(bad.detail, /returned 418, expected 200/);
        const expected = await executeStep({ type: "http-post", url: `http://127.0.0.1:${port}/teapot`, body: {}, expectStatus: 418 }, context(null));
        assert.equal(expected, undefined);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test("http-post reports a connection failure as a failed step", async () => {
    const result = await executeStep({ type: "http-post", url: "http://127.0.0.1:1/x", body: {} }, context(null));
    assert.equal(result.status, "fail");
});

test("wait returns no result", async () => {
    const start = Date.now();
    assert.equal(await executeStep({ type: "wait", ms: 50 }, context(null)), undefined);
    assert.ok(Date.now() - start >= 45);
});

test("sql steps route to the container of the named service and default to mysql", async () => {
    const withService = await executeStep(
        { type: "sql", statement: "SELECT 1", service: "postgres" },
        { runners: new Map(), defaultApp: "app.siddhi", services: { prefix: "no-such-prefix" } }
    );
    assert.equal(withService.status, "fail");
    assert.match(withService.detail, /no-such-prefix-postgres/);
    const byDefault = await executeStep(
        { type: "sql", statement: "SELECT 1" },
        { runners: new Map(), defaultApp: "app.siddhi", services: { prefix: "no-such-prefix" } }
    );
    assert.equal(byDefault.status, "fail");
    assert.match(byDefault.detail, /no-such-prefix-mysql/);
});
