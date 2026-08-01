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

test("automatic article title translation does not replace saved article content", () => {
    const automaticTitle = {
        type: "article",
        article_title: "中文标题",
        article_content: "",
        text: "中文标题",
        source: "article_title_auto",
    };
    const scope = {
        __x2md_translation_override: automaticTitle,
        querySelector() { return null; },
    };
    const original = {
        type: "article",
        article_title: "Original title",
        article_content: "Original paragraph one.\n\nOriginal paragraph two.",
    };

    assert.deepEqual(translationUi.applyVisibleTranslationOverride(original, scope), original);
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
    assert.match(source, /requestBackgroundTextTranslation[\s\S]{0,1800}replaceElementTextWithTranslation\(bodyBlocks\[paragraphIndex\], translatedText/);
    assert.doesNotMatch(source, /replaceElementTextWithTranslation\(block, translated\.translatedParagraphs\[index\]/);
    assert.match(source, /querySelectorAll\('article\[data-testid=\"tweet\"\]'\)/);
    assert.doesNotMatch(source, /isTwitterArticleTranslationScope\(document\)[\s\S]{0,250}document\.querySelector\(X_GROK_BUTTON_SELECTORS\)/);
    assert.match(source, /excludedAncestor && bodyEl\.contains\(excludedAncestor\)/);
    assert.match(source, /if \(target\.kind === "article"\) \{\s*const mainRendered = await translateArticleInPlace\(target\);\s*return mainRendered \? "translated" : "missing";/);
});

test("article toolbar buttons mount beside native controls without a floating fallback", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    assert.match(source, /function findTwitterArticleToolbarReference\s*\(/);
    assert.match(source, /querySelector\?\.\('\[data-testid="caret"\]'\)/);
    assert.match(source, /if \(caretIndex > 0\) return buttons\[caretIndex - 1\]/);
    assert.match(source, /copyButton\.nextElementSibling !== translateButton \|\| translateButton\.nextElementSibling !== referenceButton/);
    assert.match(source, /parent\.insertBefore\(copyButton, referenceButton\)/);
    assert.match(source, /parent\.insertBefore\(translateButton, referenceButton\)/);
    assert.match(source, /isTwitterArticleTranslationScope\(article\)[\s\S]{0,180}findTwitterArticleToolbarReference\(article\)/);
    assert.doesNotMatch(source, /position:\s*"fixed"[\s\S]{0,500}X_INLINE_ACTIONS_CONTAINER_CLASS/);
});

test("non-simplified X article titles auto translate through the shared config", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-translation-ui.js"), "utf8");
    const runtime = fs.readFileSync(path.join(__dirname, "..", "content_runtime.js"), "utf8");
    assert.match(source, /auto_translate_x_article_title === false/);
    assert.match(source, /isProbablySimplifiedChinese\(titleText\)/);
    assert.match(source, /source:\s*"article_title_auto"/);
    assert.match(source, /xArticleTitleAutoTranslateKeys\.delete\(key\)/);
    assert.match(source, /elementOverride\.source === "article_title_auto" \? null : elementOverride/);
    assert.match(source, /scheduleArticleTitleAutoTranslation\(\)/);
    assert.match(runtime, /X2MDXTranslationUI\?\.schedule\?\.\(\)/);
    assert.match(runtime, /runtimeConfig = resp\?\.success \? \(resp\.config \|\| \{\}\) : null/);
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
