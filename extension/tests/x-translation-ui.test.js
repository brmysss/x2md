const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const translationUi = require("../x-translation-ui.js");

test("exports a narrow mount, schedule, and capture-override interface", () => {
    assert.equal(typeof translationUi.mount, "function");
    assert.equal(typeof translationUi.schedule, "function");
    assert.equal(typeof translationUi.applyVisibleTranslationOverride, "function");
});

test("applies an in-memory translation override without persistence", () => {
    const translated = { type: "tweet", text: "译文" };
    const scope = {
        __x2md_translation_override: translated,
        querySelector() { return null; },
    };
    const original = { type: "tweet", text: "original", images: ["a.jpg"] };

    assert.deepEqual(translationUi.applyVisibleTranslationOverride(original, scope), {
        ...original,
        text: "译文",
        prefer_translated_content: true,
        translation_override: translated,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(scope, "storage"), false);
});

test("normalizes translated copy content as HTML and plain text", () => {
    assert.deepEqual(translationUi.normalizeRemoteCopyContent({
        markdown: "**Bold** [link](https://example.com)",
        source: "graphql",
    }), {
        text: "**Bold** link",
        html: "<p><strong>Bold</strong> <a href=\"https://example.com\">link</a></p>",
        source: "graphql",
    });
});

test("content entry delegates X translation UI and contains no DOM translation algorithms", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
    const runtime = fs.readFileSync(path.join(__dirname, "..", "content_runtime.js"), "utf8");
    assert.match(source, /X2MDContentRuntime\.start\(\)/);
    assert.match(runtime, /X2MDXTranslationUI\.mount\(\)/);
    assert.match(runtime, /X2MDXTranslationUI\.schedule\(\)/);
    assert.match(runtime, /X2MDXTranslationUI\.applyVisibleTranslationOverride/);
    for (const implementation of [
        "translateArticleInPlace",
        "replaceElementTextWithTranslation",
        "copyContentToClipboard",
        "requestBackgroundTextTranslation",
        "xAutoTranslateQueue",
    ]) {
        assert.doesNotMatch(source, new RegExp(`function\\s+${implementation}|(?:const|let)\\s+${implementation}`));
    }
    assert.doesNotMatch(source, /action:\s*["']translate_(?:tweet|text)["']/);
    assert.doesNotMatch(source, /navigator\.clipboard|execCommand\(["']copy["']\)/);
});

test("translation UI uses extension messages rather than direct fetch or storage", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /chrome\.storage|localStorage|sessionStorage/);
    assert.match(source, /chrome\.runtime\.sendMessage/);
});

test("article-card save owns its status URL lookup instead of relying on capture globals", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    assert.match(source, /function findFirstStatusUrl\s*\(/);
});

test("article translation scopes its title, uses Draft blocks, and bypasses native tweet translation", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    assert.match(source, /twitterArticleReadView[^\n]+article\[data-testid=\"tweet\"\]/);
    assert.match(source, /querySelectorAll\?\.\('\[data-block=\"true\"\]'\)/);
    assert.match(source, /const isArticleScope = isTwitterArticleTranslationScope\(article\)/);
    assert.match(source, /if \(!isArticleScope\) \{\s*const nativeState = await toggleNativeTwitterTranslation\(article\)/);
    assert.match(source, /translateArticleTextSegments[\s\S]+bodyBlocks\.forEach/);
    assert.match(source, /if \(isTwitterArticleTranslationScope\(document\) && !document\.querySelector/);
    assert.match(source, /querySelectorAll\('article\[data-testid=\"tweet\"\]'\)/);
    assert.doesNotMatch(source, /isTwitterArticleTranslationScope\(document\)[\s\S]{0,250}document\.querySelector\(X_GROK_BUTTON_SELECTORS\)/);
    assert.match(source, /excludedAncestor && bodyEl\.contains\(excludedAncestor\)/);
    assert.match(source, /if \(target\.kind === "article"\) \{\s*const mainRendered = await translateArticleInPlace\(target\);\s*return mainRendered \? "translated" : "missing";/);
});

test("long-press auto translation owns its detail-page guard and pointer lifecycle", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    assert.match(source, /function isTwitterDetailOrArticlePage\s*\(/);
    assert.match(source, /setPointerCapture/);
    assert.match(source, /pointerdown[\s\S]{0,120}event\.isTrusted\s*===\s*false/);
    assert.match(source, /pointerleave/);
    assert.match(source, /已开启自动翻译：正在处理正文和已加载评论/);
    assert.match(source, /X_AUTO_TRANSLATE_MAX_CONCURRENCY\s*=\s*1/);
    assert.match(source, /X_AUTO_TRANSLATE_MIN_INTERVAL_MS\s*=\s*\d+/);
    assert.match(source, /xAutoTranslateDrainTimer/);
    assert.match(source, /scheduleAutoTranslateLoadedContent[\s\S]{0,500}isTwitterDetailOrArticlePage\(\)/);
    assert.doesNotMatch(source, /function enableAutoTranslateMode[\s\S]{0,400}isTwitterDetailOrArticlePage\(\)[\s\S]{0,400}findTwitterDetailOrArticlePage/);
});
