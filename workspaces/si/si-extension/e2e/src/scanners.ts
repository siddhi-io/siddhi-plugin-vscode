/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { Finding } from "./results";

export const PATTERNS: ReadonlyArray<{ id: string; regex: RegExp }> = [
    { id: "NoClassDefFoundError", regex: /NoClassDefFoundError/ },
    { id: "ClassNotFoundException", regex: /ClassNotFoundException/ },
    { id: "NoSuchMethodError", regex: /NoSuchMethodError/ },
    { id: "NoSuchFieldError", regex: /NoSuchFieldError/ },
    { id: "LinkageError", regex: /LinkageError/ },
    { id: "VerifyError", regex: /VerifyError/ },
    { id: "ServiceConfigurationError", regex: /ServiceConfigurationError/ },
    { id: "NoSuitableDriver", regex: /No suitable driver/ },
    { id: "SunMiscUnsafe", regex: /sun\.misc\.Unsafe/ },
    { id: "RestrictedMethod", regex: /restricted method|terminally deprecated/i },
    { id: "ExtensionNotFound", regex: /extension not found|No extension exist for/i },
    { id: "JvmWarning", regex: /^WARNING:/ },
    { id: "LogError", regex: /^\[[^\]]+\]\s+ERROR\b/ },
    { id: "LogWarn", regex: /^\[[^\]]+\]\s+WARN\b/ },
];

export function scanLines(lines: string[], allow: RegExp[] = []): Finding[] {
    const findings: Finding[] = [];
    for (const line of lines) {
        if (allow.some((pattern) => pattern.test(line))) {
            continue;
        }
        const hit = PATTERNS.find((candidate) => candidate.regex.test(line));
        if (hit) {
            findings.push({ pattern: hit.id, line });
        }
    }
    return findings;
}
