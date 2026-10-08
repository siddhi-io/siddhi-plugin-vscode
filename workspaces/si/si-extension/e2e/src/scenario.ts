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

export const STEP_FIELDS = {
    wait: ["ms"],
    "http-post": ["url", "body"],
    "kafka-create-topic": ["topic"],
    "kafka-produce": ["topic", "messages"],
    sql: ["statement"],
    "expect-log": ["pattern"],
    "expect-no-log": ["pattern", "afterMs"],
    "expect-kafka-topic": ["topic", "contains"],
    "expect-sql": ["statement", "equals"],
} as const;

export type StepType = keyof typeof STEP_FIELDS;

export interface Step {
    type: StepType;
    name?: string;
    app?: string;
    ms?: number;
    url?: string;
    body?: unknown;
    expectStatus?: number;
    topic?: string;
    messages?: string[];
    statement?: string;
    pattern?: string;
    timeoutMs?: number;
    afterMs?: number;
    contains?: string[];
    notContains?: string[];
    equals?: string;
}

export const SERVICE_NAMES = ["kafka", "mysql"] as const;
export type Service = (typeof SERVICE_NAMES)[number];

export interface ScenarioFile {
    description: string;
    requires: Service[];
    extensions: string[];
    ports: number[];
    apps: string[];
    allow: string[];
    setup: Step[];
    steps: Step[];
}

export interface Scenario extends ScenarioFile {
    id: string;
    area: string;
    dir: string;
    appPaths: string[];
}

const problem = (id: string, message: string): Error => new Error(`Scenario '${id}': ${message}`);

function assertRegex(id: string, where: string, pattern: unknown): void {
    try {
        new RegExp(String(pattern));
    } catch {
        throw problem(id, `${where} has an invalid regular expression '${String(pattern)}'`);
    }
}

function validateStep(raw: any, where: string, apps: string[], id: string): Step {
    if (typeof raw !== "object" || raw === null || !(raw.type in STEP_FIELDS)) {
        throw problem(id, `${where} has unknown step type '${raw && raw.type}'`);
    }
    for (const field of STEP_FIELDS[raw.type as StepType]) {
        if (raw[field] === undefined) {
            throw problem(id, `${where} (${raw.type}) requires '${field}'`);
        }
    }
    if (raw.type === "expect-kafka-topic" && Array.isArray(raw.contains) && raw.contains.length === 0) {
        throw problem(id, `${where} (${raw.type}) contains must not be empty`);
    }
    if (raw.pattern !== undefined) {
        assertRegex(id, where, raw.pattern);
    }
    if (raw.app !== undefined && !apps.includes(raw.app)) {
        throw problem(id, `${where} app '${raw.app}' is not listed in apps`);
    }
    return raw as Step;
}

export function validateScenario(raw: any, id: string, dir: string): ScenarioFile {
    if (typeof raw !== "object" || raw === null) {
        throw problem(id, "scenario.json must contain an object");
    }
    if (typeof raw.description !== "string" || raw.description === "") {
        throw problem(id, "description is required");
    }
    const requires: string[] = raw.requires ?? [];
    for (const service of requires) {
        if (!(SERVICE_NAMES as readonly string[]).includes(service)) {
            throw problem(id, `unknown service '${service}' in requires`);
        }
    }
    if (!Array.isArray(raw.apps) || raw.apps.length === 0) {
        throw problem(id, "apps must list at least one .siddhi file");
    }
    for (const app of raw.apps) {
        if (!fs.existsSync(path.join(dir, app))) {
            throw problem(id, `app file '${app}' not found in ${dir}`);
        }
    }
    const allow: string[] = raw.allow ?? [];
    allow.forEach((pattern, index) => assertRegex(id, `allow[${index}]`, pattern));
    const setup: any[] = raw.setup ?? [];
    const steps: any[] = raw.steps ?? [];
    if (!Array.isArray(setup)) {
        throw problem(id, "setup must be an array");
    }
    if (!Array.isArray(steps) || steps.length === 0) {
        throw problem(id, "steps must be a non-empty array");
    }
    const validatedSteps = steps.map((step, index) => validateStep(step, `steps[${index}]`, raw.apps, id));
    if (!validatedSteps.some((step) => step.type.startsWith("expect-"))) {
        throw problem(id, "steps must contain at least one expect-* step");
    }
    return {
        description: raw.description,
        requires: requires as Service[],
        extensions: raw.extensions ?? [],
        ports: raw.ports ?? [],
        apps: raw.apps,
        allow,
        setup: setup.map((step, index) => validateStep(step, `setup[${index}]`, raw.apps, id)),
        steps: validatedSteps,
    };
}

export function loadScenarios(root: string, only: string[] = []): Scenario[] {
    const scenarios: Scenario[] = [];
    for (const area of fs.readdirSync(root).sort()) {
        const areaDir = path.join(root, area);
        if (!fs.statSync(areaDir).isDirectory()) {
            continue;
        }
        for (const id of fs.readdirSync(areaDir).sort()) {
            const dir = path.join(areaDir, id);
            const file = path.join(dir, "scenario.json");
            if (!fs.existsSync(file)) {
                continue;
            }
            if (scenarios.some((existing) => existing.id === id)) {
                throw new Error(`Duplicate scenario id '${id}'`);
            }
            const parsed = validateScenario(JSON.parse(fs.readFileSync(file, "utf8")), id, dir);
            scenarios.push({ ...parsed, id, area, dir, appPaths: parsed.apps.map((app) => path.join(dir, app)) });
        }
    }
    const unknown = only.filter((id) => !scenarios.some((scenario) => scenario.id === id));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown scenario(s): ${unknown.join(", ")}. Available: ${scenarios.map((scenario) => scenario.id).join(", ")}`
        );
    }
    return only.length === 0 ? scenarios : scenarios.filter((scenario) => only.includes(scenario.id));
}

export function renderTemplate<T>(value: T, vars: Record<string, string>): T {
    const text = JSON.stringify(value).replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        if (!(key in vars)) {
            throw new Error(`Unknown template variable {{${key}}}`);
        }
        return vars[key];
    });
    return JSON.parse(text) as T;
}
