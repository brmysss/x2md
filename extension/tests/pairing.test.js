const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { createTranslationCache, getTranslationRetryDelay, parseGrokTranslationResponseText } = require("../background_runtime.js");

test("translation cache persists results for one hour and expires them afterwards", async () => {
    let currentTime = 1_000;
    let stored = {};
    let translateCalls = 0;
    const storage = {
        async get() { return stored; },
        async set(value) { stored = structuredClone(value); },
    };
    const translate = async (text) => {
        translateCalls++;
        return `中:${text}:${translateCalls}`;
    };

    const firstCache = createTranslationCache({ storage, now: () => currentTime });
    assert.equal(await firstCache.getOrTranslate("hello", translate), "中:hello:1");
    assert.equal(await firstCache.getOrTranslate("hello", translate), "中:hello:1");

    const restoredCache = createTranslationCache({ storage, now: () => currentTime });
    assert.equal(await restoredCache.getOrTranslate("hello", translate), "中:hello:1");
    assert.equal(translateCalls, 1);

    currentTime += 60 * 60 * 1000;
    assert.equal(await restoredCache.getOrTranslate("hello", translate), "中:hello:2");
    assert.equal(translateCalls, 2);
});

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

test("Grok translation accepts a valid result followed by a second JSON line", () => {
    const responseText = [
        JSON.stringify({ result: { content_type: "POST", text: "译文" } }),
        JSON.stringify({ meta: { completed: true } }),
    ].join("\n");

    assert.deepEqual(parseGrokTranslationResponseText(responseText), {
        contentType: "POST",
        translatedText: "译文",
    });
});

test("Grok translation accepts single JSON and a result after metadata", () => {
    assert.equal(
        parseGrokTranslationResponseText(JSON.stringify({ result: { text: "单条译文" } })).translatedText,
        "单条译文",
    );
    assert.equal(parseGrokTranslationResponseText([
        JSON.stringify({ meta: { started: true } }),
        JSON.stringify({ result: { text: "后置译文" } }),
    ].join("\n")).translatedText, "后置译文");
});

test("Grok translation preserves empty and result-less response errors", () => {
    assert.throws(() => parseGrokTranslationResponseText(""), SyntaxError);
    assert.throws(
        () => parseGrokTranslationResponseText(JSON.stringify({ meta: { done: true } }, null, 2)),
        /empty translation/,
    );
    assert.throws(
        () => parseGrokTranslationResponseText(`${JSON.stringify({ meta: 1 })}\n${JSON.stringify({ done: true })}`),
        /empty translation/,
    );
});

test("Grok translation rejects a malformed trailing JSON line", () => {
    const responseText = `${JSON.stringify({ result: { text: "不完整译文" } })}\n{`;

    assert.throws(() => parseGrokTranslationResponseText(responseText), SyntaxError);
});

test("Grok translation rejects conflicting result lines", () => {
    const responseText = [
        JSON.stringify({ result: { text: "第一条译文" } }),
        JSON.stringify({ result: { text: "第二条译文" } }),
    ].join("\n");

    assert.throws(
        () => parseGrokTranslationResponseText(responseText),
        /multiple translation results/,
    );
});
