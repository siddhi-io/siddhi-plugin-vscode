const assert = require("node:assert/strict");
const test = require("node:test");

const {
    compareVersions,
    evaluateJavaCompatibility,
    getReleaseVersionFromUrl,
    getRuntimeCompatibility,
    selectCachedSIPack,
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

test("configures the SI 4.4.1 GA distribution and GitHub release URLs", () => {
    assert.deepEqual(manifest.supportedVersions["4.4.1"].downloadUrls, [
        "https://si-distribution.wso2.com/4.4.1/wso2si-4.4.1.zip",
        "https://github.com/wso2/product-integrator-si/releases/download/v4.4.1/wso2si-4.4.1.zip",
    ]);
});

test("accepts an unknown future SI runtime with a compatibility warning", () => {
    assert.deepEqual(getRuntimeCompatibility("4.5.0", profiles), {
        status: "valid-with-warning",
        message: "WSO2 Integrator: SI 4.5.0 was detected. Compatibility is not guaranteed.",
    });
});

test("treats a pre-release SI pack as its base version", () => {
    assert.deepEqual(getRuntimeCompatibility("4.4.1-beta", profiles), { status: "valid" });
    assert.deepEqual(evaluateJavaCompatibility("4.4.1-beta", 25, profiles), { status: "valid" });
    assert.deepEqual(evaluateJavaCompatibility("4.4.1-beta", 11, profiles), {
        status: "not-valid",
        message: "WSO2 Integrator: SI 4.4.1-beta requires Java 17 or later.",
    });
});

test("compares every numeric part of a version and ignores pre-release suffixes", () => {
    assert.equal(compareVersions("4.4.1", "4.4.1-beta"), 0);
    assert.equal(compareVersions("4.4.1", "4.4.0"), 1);
    assert.equal(compareVersions("4.3.1", "4.4.0"), -1);
    assert.equal(compareVersions("12", "3"), 1);
});

test("reads the SI release version from a download URL", () => {
    assert.equal(
        getReleaseVersionFromUrl("https://github.com/wso2/product-integrator-si/releases/download/v4.4.1-beta/wso2si-4.4.1-beta.zip"),
        "4.4.1-beta",
    );
    assert.equal(getReleaseVersionFromUrl("https://si-distribution.wso2.com/4.4.1/wso2si-4.4.1.zip"), "4.4.1");
    assert.equal(getReleaseVersionFromUrl("https://example.com/pack.zip"), undefined);
});

test("selects the downloaded release when beta and GA packs are cached together", () => {
    const packs = [
        { path: "/cache/wso2si-4.4.0", version: "4.4.0", updateLevel: "0" },
        { path: "/cache/wso2si-4.4.1", version: "4.4.1", updateLevel: "0" },
        { path: "/cache/wso2si-4.4.1-beta", version: "4.4.1-beta", updateLevel: "0" },
    ];
    for (const order of [packs, [...packs].reverse()]) {
        assert.equal(selectCachedSIPack(order, "4.4.1")?.path, "/cache/wso2si-4.4.1");
        assert.equal(selectCachedSIPack(order, "4.4.1-beta")?.path, "/cache/wso2si-4.4.1-beta");
    }
});

test("selects the highest update level of the matching release", () => {
    const packs = [
        { path: "/cache/a", version: "4.4.1", updateLevel: "3" },
        { path: "/cache/b", version: "4.4.1", updateLevel: "12" },
    ];
    assert.equal(selectCachedSIPack(packs, "4.4.1")?.path, "/cache/b");
});

test("falls back to the numeric version when no cached pack matches the release exactly", () => {
    const packs = [
        { path: "/cache/wso2si-4.4.0", version: "4.4.0", updateLevel: "0" },
        { path: "/cache/wso2si-4.4.1-SNAPSHOT", version: "4.4.1-SNAPSHOT", updateLevel: "0" },
    ];
    assert.equal(selectCachedSIPack(packs, "4.4.1")?.path, "/cache/wso2si-4.4.1-SNAPSHOT");
    assert.equal(selectCachedSIPack(packs, "4.5.0"), undefined);
});
