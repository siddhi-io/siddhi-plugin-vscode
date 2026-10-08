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

const { applyKnownIssues, loadKnownIssues } = require("../../.e2e-dist/e2e/src/knownIssues");
const { LS_LEAK_CHECK } = require("../../.e2e-dist/e2e/src/lsCheck");
const { overallExitCode, renderMarkdown } = require("../../.e2e-dist/e2e/src/report");
const { fail, pass, skip } = require("../../.e2e-dist/e2e/src/results");

const issue = { id: "N5", check: LS_LEAK_CHECK, note: "pool leak", fixedIn: "si-language-server#11" };

const scenario = (id, status, extra = {}) => ({
    id,
    area: "core",
    status,
    checks: [],
    findings: [],
    logPaths: [],
    commandLines: [],
    openJars: [],
    ...extra,
});

const summary = (overrides = {}) => ({
    startedAt: "2026-10-08T10:00:00Z",
    durationSeconds: 12,
    packSource: "https://x.test/pack.zip",
    packSha256: "a".repeat(64),
    vsixVersion: "0.2.3",
    lsJarSha1: { "io.siddhi.langserver.core-1.0.1.jar": "b".repeat(40) },
    javaHome: "/jdk",
    javaMajor: 25,
    installerChanges: ["+ .jars/x.jar"],
    ls: [pass("ls: initializes")],
    scenarios: [scenario("http-pass-through", "pass")],
    ideRun: false,
    ...overrides,
});

test("known-issues.json parses and its check names exist in the harness", () => {
    const issues = loadKnownIssues(path.join(__dirname, "..", "known-issues.json"));
    assert.ok(issues.some((entry) => entry.id === "N5" && entry.check === LS_LEAK_CHECK));
});

test("a failing known-issue check becomes known-issue and keeps the failure detail", () => {
    const [result] = applyKnownIssues([fail(LS_LEAK_CHECK, "connections grew 21 -> 51")], [issue]);
    assert.equal(result.status, "known-issue");
    assert.equal(result.knownIssueId, "N5");
    assert.match(result.detail, /connections grew 21 -> 51/);
    assert.match(result.detail, /known issue N5/);
});

test("a passing known-issue check says it appears fixed so the entry can be removed", () => {
    const [result] = applyKnownIssues([pass(LS_LEAK_CHECK, "flat")], [issue]);
    assert.equal(result.status, "pass");
    assert.match(result.detail, /N5 appears fixed.*known-issues\.json/);
});

test("other checks and skipped known-issue checks are untouched", () => {
    const checks = [fail("other", "x"), skip(LS_LEAK_CHECK, "no db")];
    assert.deepEqual(applyKnownIssues(checks, [issue]), checks);
});

test("exit code is 0 when scenarios pass and known issues exist", () => {
    const known = { ...pass("a"), status: "known-issue" };
    assert.equal(overallExitCode(summary({ ls: [known] })), 0);
});

test("exit code is 1 for a failed scenario or a failed LS check", () => {
    assert.equal(overallExitCode(summary({ scenarios: [scenario("a", "fail")] })), 1);
    assert.equal(overallExitCode(summary({ ls: [fail("ls: x", "y")] })), 1);
});

test("exit code is 1 when nothing passed, even if nothing failed", () => {
    assert.equal(overallExitCode(summary({ scenarios: [scenario("a", "skip"), scenario("b", "skip")] })), 1);
});

test("exit code is 0 when scenarios were not selected at all and the LS checks pass", () => {
    assert.equal(overallExitCode(summary({ scenarios: [] })), 0);
});

test("renderMarkdown shows inputs, results, known issues, findings and the IDE status", () => {
    const markdown = renderMarkdown(
        summary({
            ls: [{ ...fail(LS_LEAK_CHECK, "grew"), status: "known-issue", knownIssueId: "N5" }],
            scenarios: [
                scenario("http-pass-through", "pass"),
                scenario("kafka-json-pass-through", "fail", {
                    checks: [fail("log contains /x/", "not seen | within 20000 ms")],
                    findings: [{ pattern: "NoClassDefFoundError", line: "java.lang.NoClassDefFoundError: a/B" }],
                }),
                scenario("mysql-store", "skip", { checks: [skip("environment", "services not running: mysql")] }),
            ],
        })
    );
    assert.match(markdown, /# Integrator E2E report/);
    assert.match(markdown, /sha256 a{64}/);
    assert.match(markdown, /\| core \| http-pass-through \| ✅ pass \|/);
    assert.match(markdown, /\| core \| kafka-json-pass-through \| ❌ fail \|/);
    assert.match(markdown, /\| core \| mysql-store \| ⏭️ skip \|/);
    assert.match(markdown, /⚠️ known issue/);
    assert.match(markdown, /NoClassDefFoundError/);
    assert.match(markdown, /not seen \\\| within 20000 ms/);
    assert.match(markdown, /\+ \.jars\/x\.jar/);
    assert.match(markdown, /IDE smoke test: not run/);
});
