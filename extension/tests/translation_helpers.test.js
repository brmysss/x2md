const test = require("node:test");
const assert = require("node:assert/strict");

const {
    applyTranslationOverrideToData,
    buildArticleTranslationSource,
    cleanupTwitterDisplayUrlLineBreaks,
    isExpandableTweetTextControl,
    isProbablySimplifiedChinese,
    restoreTranslatedLinks,
    stripXArticleLinksFromText,
    translateArticleTextSegments,
} = require("../translation_helpers.js");

test("restoreTranslatedLinks preserves all original anchors and removes split synthetic protocols", () => {
    const result = restoreTranslatedLinks("源码：\nhttps://\ngithub.com/WinterArc21/HQ 流量……\n尝试一下：\n\nhttps://\nhqflow.vercel.app", [
        {
            type: "url",
            displayText: "github.com/WinterArc21/HQ…",
            html: '<a href="https://t.co/github">github.com/WinterArc21/HQ…</a>',
            href: "https://t.co/github",
            candidates: ["https://t.co/github", "github.com/WinterArc21/HQ…"],
        },
        {
            type: "url",
            displayText: "hqflow.vercel.app",
            html: '<a href="https://t.co/example">hqflow.vercel.app</a>',
            href: "https://t.co/example",
            candidates: ["https://t.co/example", "hqflow.vercel.app"],
        },
    ]);

    assert.deepEqual(result, {
        text: "源码：\ngithub.com/WinterArc21/HQ… 流量……\n尝试一下：\n\nhqflow.vercel.app",
        html: '源码：<br><a href="https://t.co/github">github.com/WinterArc21/HQ…</a> 流量……<br>尝试一下：<br><br><a href="https://t.co/example">hqflow.vercel.app</a>',
        markdown: "源码：\n[github.com/WinterArc21/HQ…](https://t.co/github) 流量……\n尝试一下：\n\n[hqflow.vercel.app](https://t.co/example)",
    });
});

test("restoreTranslatedLinks appends an original URL omitted by the translation provider", () => {
    const result = restoreTranslatedLinks("译文 https://t.co/provider 试用地址：", [{
        type: "url",
        displayText: "hqflow.vercel.app",
        html: '<a href="https://t.co/example">hqflow.vercel.app</a>',
        href: "https://t.co/example",
        candidates: ["https://t.co/example", "hqflow.vercel.app"],
    }]);

    assert.deepEqual(result, {
        text: "译文 试用地址： hqflow.vercel.app",
        html: '译文 试用地址： <a href="https://t.co/example">hqflow.vercel.app</a>',
        markdown: "译文 试用地址： [hqflow.vercel.app](https://t.co/example)",
    });
});

test("restoreTranslatedLinks binds repeated labels to their original hrefs one at a time", () => {
    const result = restoreTranslatedLinks("same.example 然后 same.example", [
        {
            type: "url",
            displayText: "same.example",
            href: "https://t.co/a",
            html: '<a href="https://t.co/a">same.example</a>',
            candidates: ["same.example"],
        },
        {
            type: "url",
            displayText: "same.example",
            href: "https://t.co/b",
            html: '<a href="https://t.co/b">same.example</a>',
            candidates: ["same.example"],
        },
    ]);

    assert.equal(result.html, '<a href="https://t.co/a">same.example</a> 然后 <a href="https://t.co/b">same.example</a>');
    assert.equal(result.markdown, "[same.example](https://t.co/a) 然后 [same.example](https://t.co/b)");
});

test("restoreTranslatedLinks enforces URL boundaries and safely removes only bare t.co links", () => {
    const descriptor = {
        type: "url",
        displayText: "example.com/a…",
        href: "https://t.co/a",
        html: '<a href="https://t.co/a">example.com/a…</a>',
        candidates: ["example.com/a…"],
    };
    const result = restoreTranslatedLinks(
        "notexample.com/a example.com/abc example.com/a…-flow https://not.co/abc t.co/abc-def t.co/a_b example.com/a",
        [descriptor],
    );

    assert.equal(result.html, 'notexample.com/a example.com/abc example.com/a…-flow https://not.co/abc <a href="https://t.co/a">example.com/a…</a>');
    assert.equal(result.markdown, 'notexample.com/a example.com/abc example.com/a…-flow https://not.co/abc [example.com/a…](https://t.co/a)');
});

test("restoreTranslatedLinks chooses placeholders that cannot collide with translated text", () => {
    const collision = "\uE000X2MD_LINK\uE001";
    const result = restoreTranslatedLinks(`${collision} example.com`, [{
        type: "url",
        displayText: "example.com",
        href: "https://t.co/example",
        html: '<a href="https://t.co/example">example.com</a>',
        candidates: ["example.com"],
    }]);

    assert.equal(result.text, `${collision} example.com`);
    assert.equal(result.html, `${collision} <a href="https://t.co/example">example.com</a>`);
});

test("restoreTranslatedLinks rejects unsafe Markdown targets and encodes parentheses", () => {
    const unsafe = restoreTranslatedLinks("@victim", [{
        type: "mention",
        displayText: "@victim",
        href: "javascript:alert(1)",
        html: "<a>@victim</a>",
        candidates: ["@victim"],
    }]);
    const dataUrl = restoreTranslatedLinks("example.com", [{
        type: "url",
        displayText: "example.com",
        href: "data:text/html,<script>alert(1)</script>",
        html: "<a>example.com</a>",
        candidates: ["example.com"],
    }]);
    const parentheses = restoreTranslatedLinks("example.com/a(b)", [{
        type: "url",
        displayText: "example.com/a(b)",
        href: "https://example.com/a(b)",
        html: '<a href="https://example.com/a(b)">example.com/a(b)</a>',
        candidates: ["example.com/a(b)"],
    }]);

    assert.equal(unsafe.markdown, "@victim");
    assert.equal(dataUrl.markdown, "example.com");
    assert.equal(parentheses.markdown, "[example.com/a(b)](https://example.com/a%28b%29)");
});

test("applyTranslationOverrideToData preserves translated tweet link targets as Markdown", () => {
    const result = applyTranslationOverrideToData({
        type: "tweet",
        text: "Original",
        prefer_translated_content: true,
        translation_override: {
            type: "tweet",
            text: "查看 example.com",
            markdown: "查看 [example.com](https://t.co/example)",
        },
    });

    assert.equal(result.text, "查看 [example.com](https://t.co/example)");
});

test("isProbablySimplifiedChinese distinguishes simplified, traditional, and non-Chinese titles", () => {
    assert.equal(isProbablySimplifiedChinese("教你搭建一个 AI 思考知识库"), true);
    assert.equal(isProbablySimplifiedChinese("教你搭建一個 AI 思考知識庫"), false);
    assert.equal(isProbablySimplifiedChinese("Getting the most out of GPT-5.6"), false);
    assert.equal(isProbablySimplifiedChinese("AIモデルを選ぶ方法"), false);
});

test("isExpandableTweetTextControl matches tweet truncation controls only", () => {
    assert.equal(isExpandableTweetTextControl("显示更多"), true);
    assert.equal(isExpandableTweetTextControl("Show more"), true);
    assert.equal(isExpandableTweetTextControl("Show More"), true);

    assert.equal(isExpandableTweetTextControl("显示更多回复"), false);
    assert.equal(isExpandableTweetTextControl("Show more replies"), false);
    assert.equal(isExpandableTweetTextControl("查看更多回复"), false);
    assert.equal(isExpandableTweetTextControl("Load more"), false);
});

test("buildArticleTranslationSource keeps article title and body explicit", () => {
    assert.deepEqual(
        buildArticleTranslationSource({
            title: "I'm Local AI Maxxing",
            body: "First paragraph.\n\nSecond paragraph.",
        }),
        {
            title: "I'm Local AI Maxxing",
            body: "First paragraph.\n\nSecond paragraph.",
            text: "I'm Local AI Maxxing\n\nFirst paragraph.\n\nSecond paragraph.",
        },
    );
});

test("translateArticleTextSegments translates an article one segment at a time", async () => {
    const calls = [];
    const result = await translateArticleTextSegments({
        title: "Article title",
        paragraphs: ["First paragraph.", "Second paragraph."],
    }, async (text, segment) => {
        calls.push({ text, ...segment });
        return `中:${text}`;
    });

    assert.deepEqual(calls, [
        { text: "Article title", kind: "title", completed: 0, total: 3 },
        { text: "First paragraph.", kind: "paragraph", completed: 1, total: 3 },
        { text: "Second paragraph.", kind: "paragraph", completed: 2, total: 3 },
    ]);
    assert.deepEqual(result, {
        translatedTitle: "中:Article title",
        translatedParagraphs: ["中:First paragraph.", "中:Second paragraph."],
        translatedBody: "中:First paragraph.\n\n中:Second paragraph.",
        translatedText: "中:Article title\n\n中:First paragraph.\n\n中:Second paragraph.",
    });
});

test("translateArticleTextSegments rejects an empty segment instead of returning a partial article", async () => {
    await assert.rejects(
        translateArticleTextSegments({ paragraphs: ["First", "Second"] }, async (text) => text === "First" ? "第一" : ""),
        /empty article paragraph translation/,
    );
});

test("applyTranslationOverrideToData prefers translated tweet text while preserving media", () => {
    const result = applyTranslationOverrideToData({
        type: "tweet",
        text: "Original text",
        url: "https://x.com/a/status/1",
        images: ["https://pbs.twimg.com/media/a.jpg"],
        prefer_translated_content: true,
        translation_override: {
            type: "tweet",
            text: "译文正文",
        },
    });

    assert.equal(result.text, "译文正文");
    assert.deepEqual(result.images, ["https://pbs.twimg.com/media/a.jpg"]);
    assert.equal(result.url, "https://x.com/a/status/1");
});

test("applyTranslationOverrideToData cleans split X display links in translated tweets", () => {
    const result = applyTranslationOverrideToData({
        type: "tweet",
        text: "Original text",
        prefer_translated_content: true,
        translation_override: {
            type: "tweet",
            text: "实用应用、网站、资源\n\n- http://\nmake.design - AI 设计\n- https://\nAside.com - AI 浏览器",
        },
    });

    assert.equal(
        result.text,
        "实用应用、网站、资源\n\n- make.design - AI 设计\n- Aside.com - AI 浏览器",
    );
});

test("cleanupTwitterDisplayUrlLineBreaks leaves normal text untouched", () => {
    assert.equal(cleanupTwitterDisplayUrlLineBreaks("访问 https://example.com/path"), "访问 https://example.com/path");
});

test("stripXArticleLinksFromText removes feed article card links only", () => {
    assert.equal(
        stripXArticleLinksFromText(
            "[x.com/i/article/2070348535829262571](https://x.com/i/article/2070348535829262571) x上关于内容创作skill推荐的帖子很多",
            "https://x.com/Jackywxsz/status/2070348535829262571",
        ),
        "x上关于内容创作skill推荐的帖子很多",
    );
    assert.equal(
        stripXArticleLinksFromText("https://x.com/i/article/2070348535829262571", "https://x.com/Jackywxsz/article/2070348535829262571"),
        "",
    );
});

test("applyTranslationOverrideToData prefers translated article title and content", () => {
    const result = applyTranslationOverrideToData({
        type: "article",
        article_title: "Original title",
        article_content: "Original body",
        prefer_translated_content: true,
        translation_override: {
            type: "article",
            article_title: "译文标题",
            article_content: "译文第一段\n\n译文第二段",
        },
    });

    assert.equal(result.article_title, "译文标题");
    assert.equal(result.article_content, "译文第一段\n\n译文第二段");
});

test("clipboard formatting helpers remain pure and preserve HTML/plain variants", () => {
    const {
        markdownToClipboardHtml,
        markdownToClipboardPlainText,
        plainTextToClipboardHtml,
    } = require("../translation_helpers.js");

    assert.equal(markdownToClipboardPlainText("## Title\n\n[Link](https://example.com)"), "Title\n\nLink");
    assert.equal(markdownToClipboardHtml("**Bold**"), "<p><strong>Bold</strong></p>");
    assert.equal(plainTextToClipboardHtml("one\n\ntwo"), "<p>one</p>\n<p>two</p>");
});
