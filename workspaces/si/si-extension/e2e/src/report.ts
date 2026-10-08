/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { CheckResult, ScenarioResult, Status } from "./results";

export interface RunSummary {
    startedAt: string;
    durationSeconds: number;
    packSource: string;
    packSha256: string;
    vsixVersion: string;
    lsJarSha1: Record<string, string>;
    javaHome: string;
    javaMajor: number | null;
    installerChanges: string[];
    failedExtensions?: Record<string, string>;
    ls: CheckResult[];
    scenarios: ScenarioResult[];
    ideRun: boolean;
}

const ICON: Record<Status, string> = {
    pass: "✅ pass",
    fail: "❌ fail",
    skip: "⏭️ skip",
    "known-issue": "⚠️ known issue",
};

export function overallExitCode(summary: RunSummary): number {
    if (Object.keys(summary.failedExtensions ?? {}).length > 0) {
        return 1;
    }
    if (summary.scenarios.some((scenario) => scenario.status === "fail")) {
        return 1;
    }
    if (summary.ls.some((check) => check.status === "fail")) {
        return 1;
    }
    if (summary.scenarios.length > 0 && !summary.scenarios.some((scenario) => scenario.status === "pass")) {
        return 1;
    }
    return 0;
}

const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);

function checkRows(checks: CheckResult[]): string[] {
    return checks.map((check) => `| ${cell(check.name)} | ${ICON[check.status]} | ${cell(check.detail)} |`);
}

export function renderMarkdown(summary: RunSummary): string {
    const lines: string[] = [];
    lines.push("# Integrator E2E report", "");
    lines.push(`- Started: ${summary.startedAt} (${summary.durationSeconds} s)`);
    lines.push(`- Pack: ${summary.packSource} (sha256 ${summary.packSha256})`);
    lines.push(`- VSIX version: ${summary.vsixVersion}`);
    lines.push(`- Java: ${summary.javaHome} (${summary.javaMajor ?? "unknown"})`);
    lines.push(
        `- Language server jars: ${Object.entries(summary.lsJarSha1)
            .map(([name, sha]) => `${name} ${sha.slice(0, 8)}`)
            .join(", ")}`,
        ""
    );

    const count = (status: Status): number => summary.scenarios.filter((scenario) => scenario.status === status).length;
    lines.push(
        `**Scenarios:** ${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped, of ${summary.scenarios.length}.`,
        ""
    );

    lines.push("## Language server checks", "", "| Check | Result | Detail |", "|---|---|---|", ...checkRows(summary.ls), "");

    lines.push("## Scenarios", "", "| Area | Scenario | Result | Notes |", "|---|---|---|---|");
    for (const scenario of summary.scenarios) {
        const failed = scenario.checks.filter((check) => check.status === "fail" || check.status === "skip");
        const findingsCount = scenario.findingsTotal ?? scenario.findings.length;
        const notes = [...failed.map((check) => `${check.name}: ${check.detail}`), ...(findingsCount > 0 ? [`${findingsCount} error-log finding(s)`] : [])];
        lines.push(`| ${scenario.area} | ${scenario.id} | ${ICON[scenario.status]} | ${cell(notes.join("; "))} |`);
    }
    lines.push("");

    const known = [...summary.ls, ...summary.scenarios.flatMap((scenario) => scenario.checks)].filter(
        (check) => check.status === "known-issue"
    );
    if (known.length > 0) {
        lines.push("## Known issues", "", "| Check | Result | Detail |", "|---|---|---|", ...checkRows(known), "");
    }

    const withFindings = summary.scenarios.filter((scenario) => (scenario.findingsTotal ?? scenario.findings.length) > 0);
    if (withFindings.length > 0) {
        lines.push("## Error-log findings", "");
        for (const scenario of withFindings) {
            lines.push(`### ${scenario.id}`, "");
            for (const finding of scenario.findings.slice(0, 20)) {
                lines.push(`- \`${finding.pattern}\`: ${cell(finding.line)}`);
            }
            const findingsCount = scenario.findingsTotal ?? scenario.findings.length;
            if (findingsCount > 20) {
                lines.push(`- ... and ${findingsCount - 20} more (see report.json and the logs)`);
            }
            lines.push("");
        }
    }

    const failedExtensions = Object.entries(summary.failedExtensions ?? {});
    if (failedExtensions.length > 0) {
        lines.push("## Extension installation problems", "");
        lines.push(...failedExtensions.map(([extension, message]) => `- ${extension}: ${cell(message)}`), "");
    }

    lines.push("## Installer changes", "", "<details><summary>Files added or removed in lib/, _lib/ and .jars/</summary>", "");
    lines.push(...(summary.installerChanges.length > 0 ? summary.installerChanges.map((change) => `- ${change}`) : ["- none"]));
    lines.push("", "</details>", "");

    lines.push("## IDE smoke test", "", summary.ideRun ? "Run." : "IDE smoke test: not run (phase 2).", "");
    return lines.join("\n");
}
