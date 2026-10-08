/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as fs from "fs";
import { CheckResult } from "./results";

export interface KnownIssue {
    id: string;
    check: string;
    note: string;
    fixedIn: string;
}

export function loadKnownIssues(file: string): KnownIssue[] {
    return JSON.parse(fs.readFileSync(file, "utf8")) as KnownIssue[];
}

export function applyKnownIssues(checks: CheckResult[], issues: KnownIssue[]): CheckResult[] {
    return checks.map((check) => {
        const issue = issues.find((candidate) => candidate.check === check.name);
        if (!issue) {
            return check;
        }
        if (check.status === "fail") {
            return {
                ...check,
                status: "known-issue",
                knownIssueId: issue.id,
                detail: `${check.detail} (known issue ${issue.id}: ${issue.note}; fixed in ${issue.fixedIn})`,
            };
        }
        if (check.status === "pass") {
            return {
                ...check,
                detail: `${check.detail} (${issue.id} appears fixed: remove it from known-issues.json)`,
            };
        }
        return check;
    });
}
