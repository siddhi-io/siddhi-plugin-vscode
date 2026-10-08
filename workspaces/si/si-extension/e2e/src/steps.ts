/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { describeError, sleep } from "./exec";
import { Services, kafkaExec, mysqlQuery, postgresQuery } from "./infra";
import { CheckResult, fail, pass } from "./results";
import { Runner } from "./runnerDriver";
import { Step } from "./scenario";

export interface StepContext {
    runners: Map<string, Runner>;
    defaultApp: string;
    services: Services;
}

const sqlQuery = (step: Step, context: StepContext, statement: string): string =>
    step.service === "postgres" ? postgresQuery(context.services, statement) : mysqlQuery(context.services, statement);

const BOOTSTRAP = "localhost:9092";

function need<T>(value: T | undefined, field: string): T {
    if (value === undefined) {
        throw new Error(`step is missing '${field}'`);
    }
    return value;
}

function runnerFor(step: Step, context: StepContext): Runner {
    const app = step.app ?? context.defaultApp;
    const runner = context.runners.get(app);
    if (!runner) {
        throw new Error(`no runner for app '${app}'`);
    }
    return runner;
}

async function consumeTopic(step: Step, context: StepContext): Promise<string> {
    return kafkaExec(context.services, [
        "kafka-console-consumer",
        "--bootstrap-server",
        BOOTSTRAP,
        "--topic",
        need(step.topic, "topic"),
        "--from-beginning",
        "--timeout-ms",
        "8000",
    ]);
}

export async function executeStep(step: Step, context: StepContext): Promise<CheckResult | undefined> {
    const label = step.name ?? step.type;
    try {
        switch (step.type) {
            case "wait":
                await sleep(need(step.ms, "ms"));
                return undefined;
            case "http-post": {
                const url = need(step.url, "url");
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(step.body),
                    signal: AbortSignal.timeout(15000),
                });
                const expected = step.expectStatus ?? 200;
                if (response.status !== expected) {
                    return fail(step.name ?? `POST ${url}`, `POST ${url} returned ${response.status}, expected ${expected}`);
                }
                return undefined;
            }
            case "kafka-create-topic":
                kafkaExec(context.services, [
                    "kafka-topics",
                    "--bootstrap-server",
                    BOOTSTRAP,
                    "--create",
                    "--if-not-exists",
                    "--topic",
                    need(step.topic, "topic"),
                    "--partitions",
                    "1",
                    "--replication-factor",
                    "1",
                ]);
                return undefined;
            case "kafka-produce":
                kafkaExec(
                    context.services,
                    ["kafka-console-producer", "--bootstrap-server", BOOTSTRAP, "--topic", need(step.topic, "topic")],
                    `${need(step.messages, "messages").join("\n")}\n`
                );
                return undefined;
            case "sql":
                sqlQuery(step, context, need(step.statement, "statement"));
                return undefined;
            case "expect-log": {
                const pattern = need(step.pattern, "pattern");
                const timeoutMs = step.timeoutMs ?? 20000;
                const name = step.name ?? `log contains /${pattern}/`;
                const hit = await runnerFor(step, context).waitForLog(new RegExp(pattern), timeoutMs);
                return hit === undefined ? fail(name, `not seen within ${timeoutMs} ms`) : pass(name, hit.slice(0, 300));
            }
            case "expect-no-log": {
                const pattern = need(step.pattern, "pattern");
                const name = step.name ?? `log has no /${pattern}/`;
                await sleep(need(step.afterMs, "afterMs"));
                const hit = runnerFor(step, context).lines.find((line) => new RegExp(pattern).test(line));
                return hit === undefined ? pass(name) : fail(name, `unexpected line: ${hit.slice(0, 300)}`);
            }
            case "expect-kafka-topic": {
                const contains = need(step.contains, "contains");
                const name = step.name ?? `topic ${step.topic} contains ${contains.join(", ")}`;
                const deadline = Date.now() + (step.timeoutMs ?? 40000);
                let output = "";
                for (;;) {
                    output = await consumeTopic(step, context);
                    if (contains.every((text) => output.includes(text)) || Date.now() >= deadline) {
                        break;
                    }
                }
                const missing = contains.filter((text) => !output.includes(text));
                if (missing.length > 0) {
                    return fail(name, `missing from the topic: ${missing.join(", ")}`);
                }
                const unexpected = (step.notContains ?? []).filter((text) => output.includes(text));
                return unexpected.length > 0 ? fail(name, `unexpected in the topic: ${unexpected.join(", ")}`) : pass(name);
            }
            case "expect-sql": {
                const statement = need(step.statement, "statement");
                const equals = need(step.equals, "equals");
                const name = step.name ?? `sql ${statement} = ${equals}`;
                const deadline = Date.now() + (step.timeoutMs ?? 20000);
                let actual = "";
                for (;;) {
                    actual = sqlQuery(step, context, statement);
                    if (actual === equals || Date.now() >= deadline) {
                        break;
                    }
                    await sleep(1000);
                }
                return actual === equals ? pass(name, actual) : fail(name, `expected '${equals}', got '${actual}'`);
            }
        }
    } catch (error) {
        return fail(label, describeError(error));
    }
}
