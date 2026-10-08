const assert = require("node:assert/strict");
const test = require("node:test");

const { LanguageClientLifecycle } = require("../.test-dist/languageClientLifecycle");

function client(name, events) {
    return {
        async start() {
            events.push(`start:${name}`);
        },
        async stop() {
            events.push(`stop:${name}`);
        },
    };
}

test("replaces the existing language client before starting a new one", async () => {
    const events = [];
    const lifecycle = new LanguageClientLifecycle();

    await lifecycle.initialize(() => client("first", events));
    await lifecycle.initialize(() => client("second", events));

    assert.deepEqual(events, ["start:first", "stop:first", "start:second"]);
});

test("shares concurrent initialization and stops the active client on dispose", async () => {
    const events = [];
    const lifecycle = new LanguageClientLifecycle();

    await Promise.all([
        lifecycle.initialize(() => client("only", events)),
        lifecycle.initialize(() => client("unexpected", events)),
    ]);
    await lifecycle.dispose();

    assert.deepEqual(events, ["start:only", "stop:only"]);
});
