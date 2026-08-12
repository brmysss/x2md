const test = require("node:test");
const assert = require("node:assert/strict");

// The module's runtime-only Chrome dependencies are referenced lazily by enrich modes.
Object.assign(global, require("../media_helpers.js"));
Object.assign(global, require("../twitter_graphql.js"));
require("../x-enrichment.js");
const { orchestrateTweetFallback, enrich, formatExpandedUrlMarkdown, applyMentionEntities, parseLegacyTweet, shouldPreferApiArticleContent } = global.X2MDXEnrichment;

test("article enrichment keeps DOM content when it contains an inline quote", () => {
    const domContent = "没看过上一篇的，可以从这里进：\n\n> [!quote] 引用推文\n> 上一篇内容\n\n装过1.4的不用重下完整包。";
    const apiContent = `${"更完整的接口正文。".repeat(80)}\n\n装过1.4的不用重下完整包。`;

    assert.equal(shouldPreferApiArticleContent(domContent, apiContent), false);
});

test("GraphQL tweet text decodes HTML entities before Markdown rendering", () => {
    const parsed = parseLegacyTweet({
        legacy: {
            full_text: "精度&gt;情绪 A&amp;B &quot;引用&quot; &#39;单引号&#39;",
            entities: {},
        },
    }, { name: "作者 &amp; 合作者", screen_name: "author" });

    assert.equal(parsed.text, "精度>情绪 A&B \"引用\" '单引号'");
    assert.equal(parsed.author, "作者 & 合作者");
});

test("expanded tweet links use the full URL as label while hiding the protocol", () => {
    assert.equal(
        formatExpandedUrlMarkdown("https://github.com/ai-zixun/humanizer-zh"),
        "[github.com/ai-zixun/humanizer-zh](https://github.com/ai-zixun/humanizer-zh)",
    );
});

test("tweet mentions keep their X profile links in Markdown", () => {
    assert.equal(
        applyMentionEntities("灵感来源 @ianneo_ai 的小黑！", [{ screen_name: "ianneo_ai" }]),
        "灵感来源 [@ianneo_ai](https://x.com/ianneo_ai) 的小黑！",
    );
});

test("tweet enrichment keeps only same-author reply-chain continuations", async () => {
    const originalChrome = global.chrome;
    const originalFetch = global.fetch;
    const author = { rest_id: "author-1", legacy: { name: "Alice", screen_name: "alice" } };
    const tweet = (id, text, parentId = "") => ({
        rest_id: id,
        legacy: { id_str: id, full_text: text, entities: {}, in_reply_to_status_id_str: parentId || undefined },
        core: { user_results: { result: author } },
    });
    const main = tweet("200", "main");
    const unrelatedReply = tweet("201", "replying elsewhere", "999");
    const continuation = tweet("202", "thread continuation", "200");
    const secondContinuation = tweet("203", "second continuation", "202");
    const cyclicDuplicate = tweet("200", "cyclic duplicate", "203");
    const malformedId = tweet("not-a-number", "malformed", "203");
    const entries = [main, unrelatedReply, secondContinuation, cyclicDuplicate, malformedId, continuation].map((result) => ({
        entryId: `tweet-${result.rest_id}`,
        content: { itemContent: { tweet_results: { result } } },
    }));

    global.chrome = {
        cookies: { getAll: async () => [{ value: "csrf" }] },
        storage: { local: { get: (_key, callback) => callback({}), set: (_value, callback) => callback?.() } },
        runtime: { lastError: null },
    };
    global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            data: { threaded_conversation_with_injections_v2: { instructions: [{ type: "TimelineAddEntries", entries }] } },
        }),
    });

    try {
        const result = await enrich("tweet", {
            url: "https://x.com/alice/status/200",
            text: "dom",
            images: [],
            graphql_operation_ids: { TweetDetail: ["test-operation"] },
        });
        assert.deepEqual(result.thread_tweets.map((item) => item.text), ["thread continuation", "second continuation"]);
    } finally {
        global.chrome = originalChrome;
        global.fetch = originalFetch;
    }
});

test("tweet enrichment uses GraphQL before every fallback", async () => {
    const calls = [];
    const result = await orchestrateTweetFallback({ url: "https://x.com/u/status/42", text: "dom", images: ["dom"] }, {
        graphql: async (id) => { calls.push(`graphql:${id}`); return { text: "api", images: ["api"], poll_data: { options: [] } }; },
        oembed: async () => { calls.push("oembed"); return null; },
    });
    assert.deepEqual(calls, ["graphql:42"]);
    assert.equal(result.source, "graphql");
    assert.equal(result.data.text, "api");
    assert.deepEqual(result.data.images, ["api", "dom"]);
    assert.deepEqual(result.data.poll_data, { options: [] });
});

test("an empty GraphQL reply chain clears an unreliable DOM thread", async () => {
    const result = await orchestrateTweetFallback({
        url: "https://x.com/u/status/42",
        text: "dom",
        images: [],
        thread_tweets: [{ text: "unrelated same-author reply" }],
    }, {
        graphql: async () => ({ text: "api", images: [], thread_tweets: [] }),
        oembed: async () => null,
    });

    assert.deepEqual(result.data.thread_tweets, []);
});

test("tweet enrichment falls back GraphQL -> oEmbed -> DOM", async () => {
    const calls = [];
    const input = { url: "https://x.com/u/status/42", text: "dom", images: [] };
    const oembed = await orchestrateTweetFallback(input, {
        graphql: async () => { calls.push("graphql"); return null; },
        oembed: async () => { calls.push("oembed"); return { text: "public", images: [] }; },
    });
    assert.deepEqual(calls, ["graphql", "oembed"]);
    assert.equal(oembed.source, "oembed");
    assert.equal(oembed.data.text, "public");

    calls.length = 0;
    const dom = await orchestrateTweetFallback(input, {
        graphql: async (_id, options) => { calls.push("graphql"); options.errorSink.code = "RATE_LIMITED"; options.errorSink.message = "rate limited"; return null; },
        oembed: async () => { calls.push("oembed"); return null; },
    });
    assert.deepEqual(calls, ["graphql", "oembed"]);
    assert.equal(dom.source, "dom");
    assert.equal(dom.data.text, "dom");
    assert.equal(dom.data._x2md_warning_code, "RATE_LIMITED");
});

test("non-status data remains a DOM capture without network calls", async () => {
    const input = { url: "https://x.com/home", text: "dom" };
    const result = await orchestrateTweetFallback(input, {
        graphql: async () => assert.fail("unexpected GraphQL"),
        oembed: async () => assert.fail("unexpected oEmbed"),
    });
    assert.equal(result.source, "dom");
    assert.equal(result.data, input);
});

test("unknown enrich modes fail with a stable programming error", async () => {
    await assert.rejects(() => enrich("missing", {}), /Unknown X enrichment kind: missing/);
});
