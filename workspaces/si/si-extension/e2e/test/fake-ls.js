/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

let buffer = Buffer.alloc(0);

function send(message) {
    const body = JSON.stringify(message);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function handle(message) {
    if (message.method === "initialize") {
        send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } });
    } else if (message.method === "textDocument/didOpen" || message.method === "textDocument/didChange") {
        const uri = message.params.textDocument.uri;
        const text =
            message.method === "textDocument/didOpen"
                ? message.params.textDocument.text
                : message.params.contentChanges[0].text;
        const diagnostics = text.includes("BROKEN") ? [{ message: "broken app", severity: 1 }] : [];
        process.stdout.write("noise between frames\n");
        send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
    } else if (message.method === "shutdown") {
        send({ jsonrpc: "2.0", id: message.id, result: {} });
    } else if (message.method === "exit") {
        process.exit(0);
    } else if (message.method === "custom/echo") {
        send({ jsonrpc: "2.0", id: message.id, result: message.params });
    } else if (message.id !== undefined) {
        send({ jsonrpc: "2.0", id: message.id, result: null });
    }
}

process.stdout.write("noise before the first frame\n");
process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
        const match = /Content-Length: (\d+)\r\n\r\n/.exec(buffer.toString("latin1"));
        if (!match) {
            return;
        }
        const start = match.index + match[0].length;
        const length = Number(match[1]);
        if (buffer.length < start + length) {
            return;
        }
        const message = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
        buffer = buffer.subarray(start + length);
        handle(message);
    }
});
