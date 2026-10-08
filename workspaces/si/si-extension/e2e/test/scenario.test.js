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

const { loadScenarios, renderTemplate, validateScenario } = require("../../.e2e-dist/e2e/src/scenario");

function makeRoot(scenarios) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-scn-"));
    for (const [area, id, file] of scenarios) {
        const dir = path.join(root, area, id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "app.siddhi"), "define stream S (a string);");
        fs.writeFileSync(path.join(dir, "scenario.json"), JSON.stringify(file));
    }
    return root;
}

const valid = () => ({
    description: "d",
    requires: ["mysql"],
    extensions: ["rdbms-mysql"],
    ports: [8201],
    apps: ["app.siddhi"],
    steps: [
        { type: "http-post", url: "http://localhost:8201/x", body: { a: "{{runId}}" } },
        { type: "expect-log", pattern: "ok-{{runId}}" },
    ],
});

test("loadScenarios loads scenarios sorted by area and id with resolved app paths and defaults", () => {
    const root = makeRoot([
        ["stores", "b-store", valid()],
        ["core", "a-core", { ...valid(), requires: undefined, extensions: undefined, ports: undefined }],
    ]);
    const scenarios = loadScenarios(root);
    assert.deepEqual(
        scenarios.map((s) => `${s.area}/${s.id}`),
        ["core/a-core", "stores/b-store"]
    );
    assert.deepEqual(scenarios[0].requires, []);
    assert.deepEqual(scenarios[0].setup, []);
    assert.deepEqual(scenarios[0].allow, []);
    assert.equal(scenarios[1].appPaths[0], path.join(root, "stores", "b-store", "app.siddhi"));
});

test("loadScenarios filters with only and fails loudly on an unknown id", () => {
    const root = makeRoot([
        ["core", "one", valid()],
        ["core", "two", valid()],
    ]);
    assert.deepEqual(
        loadScenarios(root, ["two"]).map((s) => s.id),
        ["two"]
    );
    assert.throws(() => loadScenarios(root, ["three"]), /Unknown scenario\(s\): three.*Available: one, two/);
});

test("loadScenarios rejects duplicate ids across areas", () => {
    const root = makeRoot([
        ["core", "same", valid()],
        ["stores", "same", valid()],
    ]);
    assert.throws(() => loadScenarios(root), /Duplicate scenario id 'same'/);
});

test("validateScenario rejects unknown step types, services and missing fields", () => {
    const dir = makeRoot([["a", "b", valid()]]) + "/a/b";
    const withStep = (step) => ({ ...valid(), steps: [step] });
    assert.throws(() => validateScenario(withStep({ type: "teleport" }), "b", dir), /unknown step type 'teleport'/);
    assert.throws(() => validateScenario(withStep({ type: "http-post", url: "u" }), "b", dir), /http-post.*body/);
    assert.throws(() => validateScenario({ ...valid(), requires: ["oracle"] }, "b", dir), /unknown service 'oracle'/);
    assert.throws(() => validateScenario({ ...valid(), steps: [] }, "b", dir), /steps must be a non-empty array/);
    assert.throws(() => validateScenario({ ...valid(), apps: ["missing.siddhi"] }, "b", dir), /app file 'missing.siddhi' not found/);
});

test("validateScenario rejects invalid regexes and unknown app references", () => {
    const dir = makeRoot([["a", "b", valid()]]) + "/a/b";
    assert.throws(
        () => validateScenario({ ...valid(), steps: [{ type: "expect-log", pattern: "(" }] }, "b", dir),
        /invalid regular expression/
    );
    assert.throws(
        () => validateScenario({ ...valid(), steps: [{ type: "expect-log", pattern: "x", app: "other.siddhi" }] }, "b", dir),
        /app 'other.siddhi' is not listed in apps/
    );
    assert.throws(() => validateScenario({ ...valid(), allow: ["("] }, "b", dir), /invalid regular expression/);
});

test("renderTemplate replaces variables everywhere and rejects unknown ones", () => {
    const out = renderTemplate({ a: "x-{{runId}}", b: [{ c: "{{runId}}" }], n: 1 }, { runId: "r123" });
    assert.deepEqual(out, { a: "x-r123", b: [{ c: "r123" }], n: 1 });
    assert.throws(() => renderTemplate({ a: "{{nope}}" }, { runId: "r1" }), /Unknown template variable \{\{nope\}\}/);
});

test("validateScenario requires an expect-* step and a non-empty kafka contains", () => {
    const dir = makeRoot([["a", "b", valid()]]) + "/a/b";
    const steps = [{ type: "http-post", url: "http://localhost:8201/x", body: {} }];
    assert.throws(() => validateScenario({ ...valid(), steps }, "b", dir), /Scenario 'b': steps must contain at least one expect-\* step/);
    const kafka = { type: "expect-kafka-topic", topic: "t", contains: [] };
    assert.throws(() => validateScenario({ ...valid(), steps: [kafka] }, "b", dir), /Scenario 'b': .*contains must not be empty/);
});

test("validateScenario accepts a postgres sql step when postgres is required", () => {
    const dir = makeRoot([["a", "b", valid()]]) + "/a/b";
    const raw = {
        ...valid(),
        requires: ["postgres"],
        steps: [{ type: "expect-sql", statement: "SELECT 1", equals: "1", service: "postgres" }],
    };
    assert.equal(validateScenario(raw, "b", dir).steps[0].service, "postgres");
});

test("validateScenario rejects an unknown sql service and a service that is not required", () => {
    const dir = makeRoot([["a", "b", valid()]]) + "/a/b";
    const withStep = (requires, step) => ({ ...valid(), requires, steps: [step] });
    const unknown = { type: "expect-sql", statement: "SELECT 1", equals: "1", service: "oracle" };
    assert.throws(() => validateScenario(withStep(["mysql"], unknown), "b", dir), /unknown service 'oracle'/);
    const notRequired = { type: "sql", statement: "SELECT 1", service: "postgres" };
    const expectStep = { type: "expect-log", pattern: "x" };
    assert.throws(
        () => validateScenario({ ...valid(), requires: ["mysql"], steps: [notRequired, expectStep] }, "b", dir),
        /uses service 'postgres' but requires does not list it/
    );
});
