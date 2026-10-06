/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as fs from "fs";
import * as path from "path";
import { pipeline as pipelineCallback } from "stream";
import { promisify } from "util";
import * as unzipper from "unzipper";

const MANIFEST_PATH = "META-INF/MANIFEST.MF";
const KAFKA_WRAPPER_PATTERN = /^kafka_clients_.*\.jar$/i;
const KAFKA_SYMBOLIC_NAME_PATTERN = /^kafka_clients_/i;
const KAFKA_CLIENT_ENTRY_PATTERN = /^kafka-clients-.*\.jar$/i;
const CACHE_SEPARATOR = "__";
const CACHE_METADATA = ".kafka-client-source.json";
const pipeline = promisify(pipelineCallback);

type CacheMetadata = {
    wrapperName: string;
    wrapperSize: number;
    wrapperMtimeMs: number;
    targetName: string;
};

export function parseManifestHeader(manifest: string, name: string): string | undefined {
    const unfolded = manifest.replace(/\r\n/g, "\n").replace(/\n /g, "");
    const prefix = `${name}:`;
    const header = unfolded.split("\n").find((line) => line.startsWith(prefix));
    return header?.substring(prefix.length).trim();
}

export async function syncKafkaClientJar(libDir: string, cacheDir: string): Promise<string[]> {
    await fs.promises.mkdir(cacheDir, { recursive: true });

    const wrappers = (await fs.promises.readdir(libDir))
        .filter((file) => KAFKA_WRAPPER_PATTERN.test(file))
        .sort();

    if (wrappers.length === 0) {
        await clearCache(cacheDir);
        return [];
    }
    if (wrappers.length > 1) {
        throw new Error(`Multiple Kafka client wrappers found in ${libDir}: ${wrappers.join(", ")}`);
    }

    const wrapperName = wrappers[0];
    const wrapperPath = path.join(libDir, wrapperName);
    let directory: unzipper.CentralDirectory;
    try {
        directory = await unzipper.Open.file(wrapperPath);
    } catch (error) {
        throw new Error(`Could not read Kafka client wrapper ${wrapperPath}: ${error}`);
    }

    const manifestEntry = directory.files.find((entry) => entry.path === MANIFEST_PATH);
    if (!manifestEntry) {
        throw new Error(`Kafka client wrapper ${wrapperPath} does not contain ${MANIFEST_PATH}`);
    }

    const manifest = (await manifestEntry.buffer()).toString("utf8");
    const symbolicName = parseManifestHeader(manifest, "Bundle-SymbolicName")?.split(";")[0].trim();
    if (!symbolicName || !KAFKA_SYMBOLIC_NAME_PATTERN.test(symbolicName)) {
        throw new Error(`Unexpected Bundle-SymbolicName in Kafka client wrapper ${wrapperPath}: ${symbolicName ?? "missing"}`);
    }

    const bundleClassPath = parseManifestHeader(manifest, "Bundle-ClassPath") ?? "";
    const kafkaEntries = bundleClassPath
        .split(",")
        .map((entry) => entry.split(";")[0].trim())
        .filter((entry) => KAFKA_CLIENT_ENTRY_PATTERN.test(path.basename(entry)));
    if (kafkaEntries.length !== 1) {
        throw new Error(
            `Kafka client wrapper ${wrapperPath} must declare exactly one nested kafka-clients JAR; found ${kafkaEntries.length}`
        );
    }

    const nestedPath = kafkaEntries[0];
    const nestedEntry = directory.files.find((entry) => entry.path === nestedPath);
    if (!nestedEntry) {
        throw new Error(`Kafka client wrapper ${wrapperPath} does not contain declared entry ${nestedPath}`);
    }

    const wrapperStat = await fs.promises.stat(wrapperPath);
    const targetName = `${path.basename(wrapperName, ".jar")}${CACHE_SEPARATOR}${path.basename(nestedPath)}`;
    const target = path.join(cacheDir, targetName);
    const metadata: CacheMetadata = {
        wrapperName,
        wrapperSize: wrapperStat.size,
        wrapperMtimeMs: wrapperStat.mtimeMs,
        targetName,
    };

    if (await isCurrentCache(cacheDir, target, metadata)) {
        return [target];
    }

    const tempTarget = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
        await pipeline(nestedEntry.stream(), fs.createWriteStream(tempTarget));
        await fs.promises.rename(tempTarget, target);
        await fs.promises.utimes(target, wrapperStat.atime, wrapperStat.mtime);
        await writeMetadata(cacheDir, metadata);
    } finally {
        await unlinkIfPresent(tempTarget);
    }

    await removeStaleCacheEntries(cacheDir, new Set([targetName, CACHE_METADATA]));
    return [target];
}

async function isCurrentCache(cacheDir: string, target: string, expected: CacheMetadata): Promise<boolean> {
    try {
        const raw = await fs.promises.readFile(path.join(cacheDir, CACHE_METADATA), "utf8");
        const actual = JSON.parse(raw) as CacheMetadata;
        const targetStat = await fs.promises.stat(target);
        return targetStat.isFile()
            && actual.wrapperName === expected.wrapperName
            && actual.wrapperSize === expected.wrapperSize
            && actual.wrapperMtimeMs === expected.wrapperMtimeMs
            && actual.targetName === expected.targetName;
    } catch {
        return false;
    }
}

async function writeMetadata(cacheDir: string, metadata: CacheMetadata): Promise<void> {
    const metadataPath = path.join(cacheDir, CACHE_METADATA);
    const tempMetadata = `${metadataPath}.tmp-${process.pid}-${Date.now()}`;
    try {
        await fs.promises.writeFile(tempMetadata, JSON.stringify(metadata), "utf8");
        await fs.promises.rename(tempMetadata, metadataPath);
    } finally {
        await unlinkIfPresent(tempMetadata);
    }
}

async function clearCache(cacheDir: string): Promise<void> {
    await removeStaleCacheEntries(cacheDir, new Set());
}

async function removeStaleCacheEntries(cacheDir: string, expected: Set<string>): Promise<void> {
    for (const file of await fs.promises.readdir(cacheDir)) {
        if (!expected.has(file)) {
            const stalePath = path.join(cacheDir, file);
            const stat = await fs.promises.lstat(stalePath);
            if (stat.isDirectory()) {
                await fs.promises.rmdir(stalePath, { recursive: true });
            } else {
                await fs.promises.unlink(stalePath);
            }
        }
    }
}

async function unlinkIfPresent(file: string): Promise<void> {
    try {
        await fs.promises.unlink(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
}
