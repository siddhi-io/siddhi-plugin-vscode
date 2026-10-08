/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

test("tsconfig.json excludes e2e directories", () => {
	const tsconfigPath = path.join(__dirname, "..", "..", "tsconfig.json");
	const content = fs.readFileSync(tsconfigPath, "utf8");

	const excludeMatch = content.match(/"exclude"\s*:\s*\[([^\]]*)\]/);
	assert(excludeMatch, "exclude block not found in tsconfig.json");

	const excludeBlock = excludeMatch[1];
	assert(excludeBlock.includes("./e2e"), 'exclude block missing "./e2e"');
	assert(excludeBlock.includes("./.e2e-dist"), 'exclude block missing "./.e2e-dist"');
	assert(excludeBlock.includes("./e2e-results"), 'exclude block missing "./e2e-results"');
});
