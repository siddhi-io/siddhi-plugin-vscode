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

const { containerName, requiredServices } = require("../../.e2e-dist/e2e/src/infra");

test("containerName joins the prefix and the service", () => {
    assert.equal(containerName({ prefix: "si-e2e" }, "kafka"), "si-e2e-kafka");
    assert.equal(containerName({ prefix: "si-test" }, "mysql"), "si-test-mysql");
    assert.equal(containerName({ prefix: "si-test" }, "postgres"), "si-test-postgres");
});

test("requiredServices unions scenario requirements and extras, sorted and unique", () => {
    assert.deepEqual(requiredServices([{ requires: ["mysql"] }, { requires: ["kafka", "mysql"] }]), ["kafka", "mysql"]);
    assert.deepEqual(requiredServices([{ requires: [] }], ["mysql"]), ["mysql"]);
    assert.deepEqual(requiredServices([]), []);
});
