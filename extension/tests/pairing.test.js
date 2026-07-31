const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { getTranslationRetryDelay } = require("../background_runtime.js");

test("background pairs once and authenticates every local request from stored token", () => {
    const source = readFileSync("extension/background.js", "utf8");
    const runtime = readFileSync("extension/background_runtime.js", "utf8");
    const dispatcher = readFileSync("extension/message_dispatcher.js", "utf8");
    const client = readFileSync("extension/local_client.js", "utf8");
    assert.match(source, /X2MDBackgroundRuntime\.start\(\)/);
    assert.match(runtime, /X2MDLocalClient\.createLocalClient\(\)/);
    assert.match(dispatcher, /pair: async \(message\)/);
    assert.match(runtime, /pair: \(code\) => localClient\.pair\(code\)/);
    assert.match(client, /storage\.get\(TOKEN_KEY\)/);
    assert.match(client, /Authorization: `Bearer \$\{savedToken\}`/);
    assert.match(client, /storage\?\.set\?\.\(\{ \[TOKEN_KEY\]: data\.token \}\)/);
    assert.match(runtime, /TRANSLATION_MAX_ATTEMPTS\s*=\s*3/);
    assert.match(runtime, /TRANSLATION_MIN_INTERVAL_MS\s*=\s*800/);
    assert.match(runtime, /waitForTranslationRequestSlot/);
    assert.match(runtime, /fetchTranslationWithBackoff/);
    assert.match(runtime, /TRANSLATION_RETRYABLE_STATUS/);
    for (const route of ["config", "history", "save", "profile-capture", "autostart"]) {
        assert.ok(!runtime.includes("fetch(`" + route));
    }
});

test("translation retry delay backs off when Retry-After is absent and respects bounded headers", () => {
    const noHeader = { headers: { get: () => null } };
    assert.equal(getTranslationRetryDelay(noHeader, 0), 1200);
    assert.equal(getTranslationRetryDelay(noHeader, 1), 2400);
    assert.equal(getTranslationRetryDelay({ headers: { get: () => "3" } }, 0), 3000);
    assert.equal(getTranslationRetryDelay({ headers: { get: () => "99" } }, 0), 10000);
});
