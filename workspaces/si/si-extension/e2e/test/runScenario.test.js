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

const { extensionSkipReason } = require("../../.e2e-dist/e2e/src/runScenario");

test("extensionSkipReason is undefined when no required extension failed", () => {
    assert.equal(extensionSkipReason(["kafka"], {}), undefined);
    assert.equal(extensionSkipReason(["kafka"], { prometheus: "manuallyInstall" }), undefined);
    assert.equal(extensionSkipReason([], { prometheus: "manuallyInstall" }), undefined);
});

test("extensionSkipReason names every affected extension with its message", () => {
    assert.equal(
        extensionSkipReason(["prometheus"], { prometheus: "manuallyInstall" }),
        "extension 'prometheus' could not be installed: manuallyInstall"
    );
    assert.equal(
        extensionSkipReason(["kafka", "prometheus", "tcp"], { prometheus: "a", tcp: "b", other: "c" }),
        "extension 'prometheus' could not be installed: a; extension 'tcp' could not be installed: b"
    );
});

test("extensionSkipReason ignores inherited object keys", () => {
    assert.equal(extensionSkipReason(["constructor", "toString"], {}), undefined);
});
