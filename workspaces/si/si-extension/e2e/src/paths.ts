/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import * as path from "path";

export const E2E_ROOT = path.resolve(__dirname, "..", "..", "..", "e2e");
export const PACKAGE_ROOT = path.resolve(E2E_ROOT, "..");
export const SCENARIOS_ROOT = path.join(E2E_ROOT, "scenarios");
export const LS_FIXTURES_ROOT = path.join(E2E_ROOT, "ls-fixtures");
export const KNOWN_ISSUES_FILE = path.join(E2E_ROOT, "known-issues.json");
export const COMPOSE_FILE = path.join(E2E_ROOT, "infra", "docker-compose.yml");
