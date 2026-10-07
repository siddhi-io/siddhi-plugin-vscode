const assert = require("node:assert/strict");
const test = require("node:test");

const { buildRuntimeClassPath } = require("../.test-dist/runtimeClassPath");

test("puts installed jars after SI lib jars so extension-embedded classes win", () => {
    assert.deepEqual(
        buildRuntimeClassPath("/opt/wso2si", "/extension/ls/*", ":"),
        [
            "-cp",
            "/extension/ls/*:/opt/wso2si/lib/*:/opt/wso2si/.jars/*:/opt/wso2si/wso2/lib/plugins/*",
        ]
    );
});

test("uses a Windows classpath delimiter without changing precedence", () => {
    assert.deepEqual(
        buildRuntimeClassPath("C:\\wso2si", "C:\\extension\\ls\\*", ";"),
        [
            "-cp",
            "C:\\extension\\ls\\*;C:\\wso2si/lib/*;C:\\wso2si/.jars/*;C:\\wso2si/wso2/lib/plugins/*",
        ]
    );
});
