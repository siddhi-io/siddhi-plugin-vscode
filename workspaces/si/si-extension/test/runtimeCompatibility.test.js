const assert = require("node:assert/strict");
const test = require("node:test");

const {
    evaluateJavaCompatibility,
    getRuntimeCompatibility,
} = require("../.test-dist/runtimeCompatibility");

const profiles = {
    "4.4.1": { minimumJavaVersion: 17, recommendedJavaVersion: 25, testedJavaVersion: 25 },
    "4.4.0": { minimumJavaVersion: 11, recommendedJavaVersion: 21, testedJavaVersion: 25 },
    "4.3.1": { minimumJavaVersion: 11, recommendedJavaVersion: 21, testedJavaVersion: 21 },
};

const manifest = require("../src/config/versions.json");

test("accepts SI 4.4.1 on each tested Java version", () => {
    for (const javaVersion of [17, 21, 25]) {
        assert.deepEqual(evaluateJavaCompatibility("4.4.1", javaVersion, profiles), { status: "valid" });
    }
});

test("rejects Java versions below SI 4.4.1's minimum", () => {
    assert.deepEqual(evaluateJavaCompatibility("4.4.1", 16, profiles), {
        status: "not-valid",
        message: "WSO2 Integrator: SI 4.4.1 requires Java 17 or later.",
    });
});

test("warns but accepts Java versions newer than SI 4.4.1's tested range", () => {
    assert.deepEqual(evaluateJavaCompatibility("4.4.1", 26, profiles), {
        status: "valid-with-warning",
        message: "Java 26 has not been tested with WSO2 Integrator: SI 4.4.1. Continue at your own discretion.",
    });
});

test("uses the selected SI runtime's Java range instead of the latest profile", () => {
    assert.deepEqual(evaluateJavaCompatibility("4.3.1", 25, profiles), {
        status: "valid-with-warning",
        message: "Java 25 has not been tested with WSO2 Integrator: SI 4.3.1. Continue at your own discretion.",
    });
    assert.deepEqual(evaluateJavaCompatibility("4.4.0", 25, profiles), { status: "valid" });
});

test("preserves the configured Java ranges for SI 4.4.0 and 4.3.1", () => {
    assert.deepEqual(manifest.supportedVersions["4.4.0"].java, {
        minimumJavaVersion: 11,
        recommendedJavaVersion: 21,
        testedJavaVersion: 25,
    });
    assert.deepEqual(manifest.supportedVersions["4.3.1"].java, {
        minimumJavaVersion: 11,
        recommendedJavaVersion: 21,
        testedJavaVersion: 21,
    });
});

test("sets SI 4.4.1 and Java 25 as the bundled defaults", () => {
    assert.equal(manifest.latestSIVersion, "4.4.1");
    assert.equal(manifest.supportedVersions["4.4.1"].java.recommendedJavaVersion, 25);
});

test("uses the canonical SI GitHub release URL convention", () => {
    assert.equal(
        manifest.supportedVersions["4.4.1"].downloadUrls[1],
        "https://github.com/wso2/product-integrator-si/releases/download/v4.4.1/wso2si-4.4.1.zip",
    );
});

test("accepts an unknown future SI runtime with a compatibility warning", () => {
    assert.deepEqual(getRuntimeCompatibility("4.5.0", profiles), {
        status: "valid-with-warning",
        message: "WSO2 Integrator: SI 4.5.0 was detected. Compatibility is not guaranteed.",
    });
});
