/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as path from "path";
import { describeError, isPortInUse } from "./exec";
import { Services } from "./infra";
import { runnerLaunch } from "./launch";
import { CheckResult, Finding, ScenarioResult, fail, pass, scenarioStatus, skip } from "./results";
import { Runner } from "./runnerDriver";
import { Scenario, Service, Step, renderTemplate } from "./scenario";
import { scanLines } from "./scanners";
import { StepContext, executeStep } from "./steps";
import { LsJars } from "./vsix";

export interface ScenarioEnvironment {
    java: { home: string; major: number | null };
    packHome: string;
    ls: LsJars;
    services: Services;
    runId: string;
    logDir: string;
    availableServices: Service[];
}

export async function runScenario(scenario: Scenario, env: ScenarioEnvironment): Promise<ScenarioResult> {
    const result: ScenarioResult = {
        id: scenario.id,
        area: scenario.area,
        status: "pass",
        checks: [],
        findings: [],
        logPaths: [],
        commandLines: [],
        openJars: [],
    };
    const skipped = (detail: string): ScenarioResult => ({ ...result, status: "skip", checks: [skip("environment", detail)] });

    const missing = scenario.requires.filter((service) => !env.availableServices.includes(service));
    if (missing.length > 0) {
        return skipped(`services not running: ${missing.join(", ")}`);
    }
    const busy: number[] = [];
    for (const port of scenario.ports) {
        if (await isPortInUse(port)) {
            busy.push(port);
        }
    }
    if (busy.length > 0) {
        return skipped(`ports already in use: ${busy.join(", ")}`);
    }

    const vars = { runId: env.runId };
    const checks: CheckResult[] = [];
    const started: Array<{ app: string; runner: Runner }> = [];
    const context: StepContext = { runners: new Map(), defaultApp: scenario.apps[0], services: env.services };
    const allow = scenario.allow.map((pattern) => new RegExp(pattern));

    const execute = async (steps: Step[]): Promise<void> => {
        for (const step of renderTemplate(steps, vars)) {
            const outcome = await executeStep(step, context);
            if (outcome) {
                checks.push(outcome);
            }
        }
    };

    try {
        await execute(scenario.setup);
        let allStarted = true;
        for (const [index, appPath] of scenario.appPaths.entries()) {
            const app = scenario.apps[index];
            const logPath = path.join(env.logDir, `${scenario.id}-${path.basename(app, ".siddhi")}.log`);
            const runner = Runner.spawn(
                runnerLaunch(
                    { javaHome: env.java.home, javaMajor: env.java.major, packHome: env.packHome, ls: env.ls },
                    appPath
                ),
                logPath
            );
            started.push({ app, runner });
            context.runners.set(app, runner);
            result.logPaths.push(logPath);
            try {
                checks.push(pass(`${app} starts`, await runner.start(appPath)));
            } catch (error) {
                checks.push(fail(`${app} starts`, describeError(error)));
                allStarted = false;
                break;
            }
        }
        if (allStarted) {
            await execute(scenario.steps);
        }
    } catch (error) {
        checks.push(fail("scenario", describeError(error)));
    } finally {
        for (const { app, runner } of started) {
            const snapshot = runner.snapshot();
            result.commandLines.push(snapshot.commandLine);
            result.openJars.push(...snapshot.openJars);
            const stopped = await runner.stop();
            checks.push(stopped.clean ? pass(`${app} stops cleanly`, stopped.detail) : fail(`${app} stops cleanly`, stopped.detail));
        }
    }

    const findings: Finding[] = started.flatMap(({ runner }) => scanLines(runner.lines, allow));
    result.openJars = Array.from(new Set(result.openJars)).sort();
    result.checks = checks;
    result.findings = findings;
    result.status = scenarioStatus(checks, findings);
    return result;
}
