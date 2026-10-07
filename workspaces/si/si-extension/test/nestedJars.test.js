const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { parseManifestHeader, syncKafkaClientJar } = require("../.test-dist/nestedJars");
const { buildRuntimeClassPath } = require("../.test-dist/runtimeClassPath");

function makeJar(jarPath, files) {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nested-jar-src-"));
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(staging, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
    fs.rmSync(jarPath, { force: true, recursive: true });
    execFileSync("zip", ["-q", "-r", jarPath, "."], { cwd: staging });
    fs.rmSync(staging, { recursive: true, force: true });
}

function makeWrapper(libDir, wrapperName, nested, symbolicName = path.basename(wrapperName, ".jar")) {
    const files = {
        "META-INF/MANIFEST.MF": [
            "Manifest-Version: 1.0",
            `Bundle-SymbolicName: ${symbolicName}`,
            `Bundle-ClassPath: .,${Object.keys(nested).join(",")}`,
            "",
        ].join("\n"),
    };
    Object.assign(files, nested);
    makeJar(path.join(libDir, wrapperName), files);
}

function setUpDirs() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kafka-client-jar-"));
    const libDir = path.join(root, "lib");
    fs.mkdirSync(libDir);
    return { root, libDir, cacheDir: path.join(root, "cache") };
}

test("reads a folded manifest header", () => {
    const manifest =
        "Manifest-Version: 1.0\r\nBundle-SymbolicName: kafka_clients_3.9.2\r\n" +
        "Bundle-ClassPath: .,kafka-clients-3.9.2.j\r\n ar\r\n";

    assert.equal(parseManifestHeader(manifest, "Bundle-SymbolicName"), "kafka_clients_3.9.2");
    assert.equal(parseManifestHeader(manifest, "Bundle-ClassPath"), ".,kafka-clients-3.9.2.jar");
});

test("extracts only the Kafka client from the Kafka wrapper", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(libDir, "kafka_clients_3.9.2_1.0.0.jar", {
        "kafka-clients-3.9.2.jar": "kafka",
    });
    makeWrapper(libDir, "zookeeper_3.9.2_1.0.0.jar", {
        "zookeeper-3.9.2.jar": "zookeeper",
    });
    const expected = path.join(cacheDir, "kafka_clients_3.9.2_1.0.0__kafka-clients-3.9.2.jar");

    assert.deepEqual(await syncKafkaClientJar(libDir, cacheDir), [expected]);
    assert.deepEqual(
        fs.readdirSync(cacheDir).filter((name) => name.endsWith(".jar")),
        [path.basename(expected)]
    );
    assert.equal(fs.readFileSync(expected, "utf8"), "kafka");
});

test("leaves the classpath unchanged when no Kafka wrapper exists", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(libDir, "zookeeper_3.9.2_1.0.0.jar", {
        "zookeeper-3.9.2.jar": "zookeeper",
    });

    assert.deepEqual(await syncKafkaClientJar(libDir, cacheDir), []);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
});

test("ignores a corrupt unrelated jar", async () => {
    const { libDir, cacheDir } = setUpDirs();
    fs.writeFileSync(path.join(libDir, "user-library.jar"), "not a zip");
    makeWrapper(libDir, "kafka_clients_3.9.2_1.0.0.jar", {
        "kafka-clients-3.9.2.jar": "kafka",
    });

    const result = await syncKafkaClientJar(libDir, cacheDir);

    assert.equal(result.length, 1);
    assert.equal(fs.readFileSync(result[0], "utf8"), "kafka");
});

test("rejects multiple Kafka wrappers", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(libDir, "kafka_clients_3.8.0_1.0.0.jar", { "kafka-clients-3.8.0.jar": "old" });
    makeWrapper(libDir, "kafka_clients_3.9.2_1.0.0.jar", { "kafka-clients-3.9.2.jar": "new" });

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir), /Multiple Kafka client wrappers/);
});

test("rejects an unreadable Kafka wrapper", async () => {
    const { libDir, cacheDir } = setUpDirs();
    fs.writeFileSync(path.join(libDir, "kafka_clients_broken.jar"), "not a zip");

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir), /Could not read Kafka client wrapper/);
});

test("rejects a Kafka wrapper whose symbolic name does not match", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(
        libDir,
        "kafka_clients_3.9.2_1.0.0.jar",
        { "kafka-clients-3.9.2.jar": "kafka" },
        "not_kafka"
    );

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir), /Unexpected Bundle-SymbolicName/);
});

test("rejects a Kafka wrapper with no declared nested client", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(libDir, "kafka_clients_3.9.2_1.0.0.jar", { "README.txt": "missing" });

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir), /exactly one nested kafka-clients JAR/);
});

test("rejects a Kafka wrapper whose declared client is absent", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeJar(path.join(libDir, "kafka_clients_3.9.2_1.0.0.jar"), {
        "META-INF/MANIFEST.MF": [
            "Manifest-Version: 1.0",
            "Bundle-SymbolicName: kafka_clients_3.9.2",
            "Bundle-ClassPath: .,kafka-clients-3.9.2.jar",
            "",
        ].join("\n"),
    });

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir), /does not contain declared entry/);
});

test("reuses the cached client while the wrapper is unchanged", async () => {
    const { libDir, cacheDir } = setUpDirs();
    const wrapper = path.join(libDir, "kafka_clients_3.9.2_1.0.0.jar");
    makeWrapper(libDir, path.basename(wrapper), { "kafka-clients-3.9.2.jar": "kafka" });
    const [target] = await syncKafkaClientJar(libDir, cacheDir);
    fs.writeFileSync(target, "marker");
    const wrapperMtime = fs.statSync(wrapper).mtime;
    fs.utimesSync(target, wrapperMtime, wrapperMtime);

    assert.deepEqual(await syncKafkaClientJar(libDir, cacheDir), [target]);
    assert.equal(fs.readFileSync(target, "utf8"), "marker");
});

test("replaces the cached client when the wrapper changes", async () => {
    const { libDir, cacheDir } = setUpDirs();
    const wrapperName = "kafka_clients_3.9.2_1.0.0.jar";
    makeWrapper(libDir, wrapperName, { "kafka-clients-3.9.2.jar": "old" });
    const [target] = await syncKafkaClientJar(libDir, cacheDir);
    makeWrapper(libDir, wrapperName, { "kafka-clients-3.9.2.jar": "new" });
    const later = new Date(Date.now() + 60000);
    fs.utimesSync(path.join(libDir, wrapperName), later, later);

    assert.deepEqual(await syncKafkaClientJar(libDir, cacheDir), [target]);
    assert.equal(fs.readFileSync(target, "utf8"), "new");
});

test("serializes concurrent extraction into the same cache directory", async () => {
    const { libDir, cacheDir } = setUpDirs();
    makeWrapper(libDir, "kafka_clients_3.9.2_1.0.0.jar", {
        "kafka-clients-3.9.2.jar": "kafka",
    });
    const expected = path.join(cacheDir, "kafka_clients_3.9.2_1.0.0__kafka-clients-3.9.2.jar");
    const originalNow = Date.now;
    Date.now = () => 42;

    try {
        const results = await Promise.all([
            syncKafkaClientJar(libDir, cacheDir),
            syncKafkaClientJar(libDir, cacheDir),
        ]);
        assert.deepEqual(results, [[expected], [expected]]);
        assert.equal(fs.readFileSync(expected, "utf8"), "kafka");
    } finally {
        Date.now = originalNow;
    }
});

test("removes stale cache files when the wrapper disappears", async () => {
    const { libDir, cacheDir } = setUpDirs();
    const wrapper = path.join(libDir, "kafka_clients_3.9.2_1.0.0.jar");
    makeWrapper(libDir, path.basename(wrapper), { "kafka-clients-3.9.2.jar": "kafka" });
    await syncKafkaClientJar(libDir, cacheDir);
    fs.rmSync(wrapper);

    assert.deepEqual(await syncKafkaClientJar(libDir, cacheDir), []);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
});

test("does not leave a temporary jar after extraction fails", async () => {
    const { libDir, cacheDir } = setUpDirs();
    const wrapperName = "kafka_clients_3.9.2_1.0.0.jar";
    const targetName = "kafka_clients_3.9.2_1.0.0__kafka-clients-3.9.2.jar";
    makeWrapper(libDir, wrapperName, { "kafka-clients-3.9.2.jar": "kafka" });
    fs.mkdirSync(cacheDir);
    fs.mkdirSync(path.join(cacheDir, targetName));

    await assert.rejects(syncKafkaClientJar(libDir, cacheDir));
    assert.deepEqual(fs.readdirSync(cacheDir).filter((name) => name.includes(".tmp-")), []);
});

test("puts the extracted Kafka client before language-server and SI jars", () => {
    assert.deepEqual(
        buildRuntimeClassPath("/opt/wso2si", "/extension/ls/*", ["/cache/kafka-clients-3.9.2.jar"], ":"),
        [
            "-cp",
            "/cache/kafka-clients-3.9.2.jar:/extension/ls/*:/opt/wso2si/lib/*:/opt/wso2si/wso2/lib/plugins/*",
        ]
    );
});

test("uses a Windows classpath delimiter without changing precedence", () => {
    assert.deepEqual(
        buildRuntimeClassPath("C:\\wso2si", "C:\\extension\\ls\\*", ["C:\\cache\\kafka-clients.jar"], ";"),
        [
            "-cp",
            "C:\\cache\\kafka-clients.jar;C:\\extension\\ls\\*;C:\\wso2si/lib/*;C:\\wso2si/wso2/lib/plugins/*",
        ]
    );
});
