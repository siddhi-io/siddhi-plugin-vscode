/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

const readline = require("readline");

console.log("[2026-01-01 00:00:00,000]  INFO {fake} - booted");
console.error("WARNING: fake jvm warning");

readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const request = JSON.parse(line);
    if (request.method === "runtime/start") {
        console.log(`[2026-01-01 00:00:01,000]  INFO {fake} - started ${request.params.path}`);
        console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "Siddhi app started" }));
    } else if (request.method === "runtime/stop") {
        console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "Siddhi app stopped" }));
    } else if (request.method === "boom") {
        console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { message: "boom" } }));
    }
});

setInterval(() => {}, 1000);
