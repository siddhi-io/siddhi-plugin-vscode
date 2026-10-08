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

const { fileHash, run } = require("../../.e2e-dist/e2e/src/exec");
const {
    PACK_LAYOUT,
    diffSnapshots,
    extractPack,
    findPackHome,
    isUrl,
    resolveZip,
    snapshotJars,
    zipNameFrom,
} = require("../../.e2e-dist/e2e/src/pack");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "e2e-pack-"));

function writeLayout(home) {
    for (const rel of PACK_LAYOUT) {
        const target = path.join(home, rel);
        if (rel.endsWith(".jks")) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, "x");
        } else {
            fs.mkdirSync(target, { recursive: true });
        }
    }
}

function zipDir(parent, name, zipPath) {
    const result = run("zip", ["-qr", zipPath, name], { cwd: parent });
    assert.equal(result.status, 0, result.stderr);
}

test("isUrl and zipNameFrom", () => {
    assert.equal(isUrl("https://github.com/o/r/releases/download/v1/wso2si-4.4.1.zip"), true);
    assert.equal(isUrl("/tmp/pack.zip"), false);
    assert.equal(zipNameFrom("https://x.test/a/pack.zip?token=1"), "pack.zip");
    assert.equal(zipNameFrom("/tmp/dir/pack.zip"), "pack.zip");
});

test("resolveZip rejects names that are not .zip, including extracted directories", () => {
    const dir = tempDir();
    assert.throws(() => resolveZip(dir, dir), /must be a \.zip file/);
    assert.throws(() => resolveZip("https://x.test/pack.tar.gz", dir), /must be a \.zip file/);
});

test("resolveZip rejects a missing local file and accepts an existing one", () => {
    const dir = tempDir();
    assert.throws(() => resolveZip(path.join(dir, "none.zip"), dir), /not found/);
    const zip = path.join(dir, "p.zip");
    fs.writeFileSync(zip, "x");
    assert.equal(resolveZip(zip, dir), zip);
});

test("extractPack extracts a pack one level down into a fresh work directory", () => {
    const parent = tempDir();
    writeLayout(path.join(parent, "wso2si-9.9.9"));
    const zip = path.join(parent, "p.zip");
    zipDir(parent, "wso2si-9.9.9", zip);
    const workDir = path.join(tempDir(), "work");
    const { home, zipSha256 } = extractPack(zip, workDir);
    assert.equal(path.basename(home), "wso2si-9.9.9");
    assert.ok(fs.existsSync(path.join(home, "bin", "tools")));
    assert.equal(zipSha256, fileHash(zip, "sha256"));
});

test("extractPack accepts a pack at the zip root", () => {
    const parent = tempDir();
    const home = path.join(parent, "root-pack");
    writeLayout(home);
    const zip = path.join(parent, "p.zip");
    const result = run("zip", ["-qr", zip, "."], { cwd: home });
    assert.equal(result.status, 0, result.stderr);
    const extracted = extractPack(zip, path.join(tempDir(), "work"));
    assert.equal(path.basename(extracted.home), "pack");
});

test("extractPack never reuses an existing work directory", () => {
    const parent = tempDir();
    writeLayout(path.join(parent, "p"));
    const zip = path.join(parent, "p.zip");
    zipDir(parent, "p", zip);
    const workDir = tempDir();
    assert.throws(() => extractPack(zip, workDir), /already exists/);
});

test("extractPack rejects a corrupt zip", () => {
    const parent = tempDir();
    const zip = path.join(parent, "p.zip");
    fs.writeFileSync(zip, "this is not a zip");
    assert.throws(() => extractPack(zip, path.join(tempDir(), "work")), /corrupt or unreadable/);
});

test("extractPack rejects a zip that is not an SI pack and names what is missing", () => {
    const parent = tempDir();
    fs.mkdirSync(path.join(parent, "other"));
    fs.writeFileSync(path.join(parent, "other", "readme.txt"), "x");
    const zip = path.join(parent, "p.zip");
    zipDir(parent, "other", zip);
    assert.throws(() => extractPack(zip, path.join(tempDir(), "work")), /does not contain an SI pack.*bin\/tools/s);
});

test("findPackHome throws when the layout is incomplete", () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, "lib"));
    assert.throws(() => findPackHome(dir), /does not contain an SI pack/);
});

test("snapshotJars lists files in lib, _lib and .jars, and diffSnapshots reports changes", () => {
    const home = tempDir();
    fs.mkdirSync(path.join(home, "lib"));
    fs.mkdirSync(path.join(home, ".jars"));
    fs.writeFileSync(path.join(home, "lib", "a-1.jar"), "x");
    fs.writeFileSync(path.join(home, ".jars", "README.txt"), "x");
    const before = snapshotJars(home);
    assert.deepEqual(before, [".jars/README.txt", "lib/a-1.jar"]);
    fs.mkdirSync(path.join(home, "_lib"));
    fs.writeFileSync(path.join(home, "_lib", "a-1.jar"), "x");
    fs.rmSync(path.join(home, "lib", "a-1.jar"));
    fs.writeFileSync(path.join(home, "lib", "a-2.jar"), "x");
    assert.deepEqual(diffSnapshots(before, snapshotJars(home)), ["+ _lib/a-1.jar", "+ lib/a-2.jar", "- lib/a-1.jar"]);
});
