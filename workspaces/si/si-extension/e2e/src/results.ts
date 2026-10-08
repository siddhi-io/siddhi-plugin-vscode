/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

export type Status = "pass" | "fail" | "skip" | "known-issue";

export interface CheckResult {
    name: string;
    status: Status;
    detail: string;
    knownIssueId?: string;
}

export interface Finding {
    pattern: string;
    line: string;
}

export interface ScenarioResult {
    id: string;
    area: string;
    status: Status;
    checks: CheckResult[];
    findings: Finding[];
    logPaths: string[];
    commandLines: string[];
    openJars: string[];
}

export const pass = (name: string, detail = ""): CheckResult => ({ name, status: "pass", detail });
export const fail = (name: string, detail: string): CheckResult => ({ name, status: "fail", detail });
export const skip = (name: string, detail: string): CheckResult => ({ name, status: "skip", detail });

export function scenarioStatus(checks: CheckResult[], findings: Finding[]): Status {
    if (findings.length > 0 || checks.some((check) => check.status === "fail")) {
        return "fail";
    }
    if (checks.length > 0 && checks.every((check) => check.status === "skip")) {
        return "skip";
    }
    return "pass";
}
