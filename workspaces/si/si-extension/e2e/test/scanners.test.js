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

const { scanLines } = require("../../.e2e-dist/e2e/src/scanners");
const { fail, pass, scenarioStatus, skip } = require("../../.e2e-dist/e2e/src/results");

test("scanLines flags class-loading and linkage failures", () => {
    const findings = scanLines([
        "[2026-10-08 11:10:44,485]  INFO {a.B} - fine",
        "java.lang.NoClassDefFoundError: org/bson/conversions/Bson",
        "Caused by: java.lang.NoSuchMethodError: 'void X.y()'",
        "java.lang.VerifyError: Bad type on operand stack",
        "java.util.ServiceConfigurationError: x not a subtype",
        "java.sql.SQLException: No suitable driver found for jdbc:mysql://x",
        "WARNING: A terminally deprecated method in sun.misc.Unsafe has been called",
    ]);
    assert.deepEqual(
        findings.map((finding) => finding.pattern),
        ["NoClassDefFoundError", "NoSuchMethodError", "VerifyError", "ServiceConfigurationError", "NoSuitableDriver", "SunMiscUnsafe"]
    );
});

test("scanLines flags ERROR and WARN log levels but not INFO or DEBUG", () => {
    const findings = scanLines([
        "[2026-10-08 11:10:44,485]  INFO {a.B} - ok",
        "[2026-10-08 11:10:44,485] ERROR {a.B} - bad",
        "[2026-10-08 11:10:44,485]  WARN {a.B} - hmm",
        "[2026-10-08 11:10:44,485] DEBUG {a.B} - detail",
    ]);
    assert.deepEqual(
        findings.map((finding) => finding.pattern),
        ["LogError", "LogWarn"]
    );
});

test("scanLines honours the allow list", () => {
    const lines = ["[2026-10-08 11:10:44,485]  WARN {x} - http-request is deprecated"];
    assert.equal(scanLines(lines, [/is deprecated/]).length, 0);
    assert.equal(scanLines(lines, [/something else/]).length, 1);
});

test("scanLines returns one finding per line with the line text", () => {
    const findings = scanLines(["java.lang.LinkageError: loader constraint violation"]);
    assert.deepEqual(findings, [{ pattern: "LinkageError", line: "java.lang.LinkageError: loader constraint violation" }]);
});

test("scenarioStatus fails on a failed check or any finding", () => {
    assert.equal(scenarioStatus([pass("a")], []), "pass");
    assert.equal(scenarioStatus([pass("a"), fail("b", "x")], []), "fail");
    assert.equal(scenarioStatus([pass("a")], [{ pattern: "p", line: "l" }]), "fail");
});

test("scenarioStatus is skip only when every check was skipped", () => {
    assert.equal(scenarioStatus([skip("env", "no kafka")], []), "skip");
    assert.equal(scenarioStatus([skip("env", "x"), pass("a")], []), "pass");
});
