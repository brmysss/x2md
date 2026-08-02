(function (globalScope) {
    function cleanupTwitterDisplayUrlLineBreaks(text) {
        return String(text || "").replace(
            /(^|[^\w])https?:\/\/[ \t]*\n[ \t]*((?:www\.)?[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(?:\/[^\s]*)?)/g,
            "$1$2",
        );
    }

    function normalizeSpaces(text) {
        return cleanupTwitterDisplayUrlLineBreaks(String(text || "").replace(/\u00a0/g, " "))
            .replace(/[ \t]+\n/g, "\n")
            .trim();
    }

    function escapeRegExp(text) {
        return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function normalizeInlineLinkText(text) {
        return String(text || "").replace(/\s+/g, "");
    }

    function makeLooseInlineTextPattern(text) {
        const compact = normalizeInlineLinkText(text);
        if (!compact) return "";
        return compact
            .split("")
            .map((char) => escapeRegExp(char))
            .join("\\s*");
    }

    function normalizeHttpLinkTarget(value) {
        try {
            const parsed = new URL(String(value || ""));
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
            return parsed.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
        } catch (error) {
            return "";
        }
    }

    function restoreTranslatedLinks(text, descriptors = []) {
        let tokenizedText = String(text || "").replace(/\r\n/g, "\n").trim();
        const tokens = [];
        const tokenCorpus = [tokenizedText, ...descriptors.flatMap((descriptor) => [
            descriptor.html,
            descriptor.displayText,
            descriptor.href,
            ...(descriptor.candidates || []),
        ])].join("\n");
        let tokenPrefix = "\uE000X2MD_LINK\uE001";
        while (tokenCorpus.includes(tokenPrefix)) tokenPrefix += "\uE002";

        for (const descriptor of descriptors) {
            let matched = false;
            for (const candidate of descriptor.candidates || []) {
                const strippedCandidate = String(candidate).replace(/(?:\.\.\.|…)+$/g, "");
                const variants = descriptor.type === "url"
                    ? [{ text: candidate, truncated: false }, { text: strippedCandidate, truncated: strippedCandidate !== candidate }]
                    : [{ text: candidate, truncated: false }];
                for (const { text: variant, truncated } of variants) {
                    const loosePattern = descriptor.type === "mention" || descriptor.type === "url";
                    let pattern = loosePattern ? makeLooseInlineTextPattern(variant) : escapeRegExp(variant);
                    if (!pattern) continue;
                    if (descriptor.type === "url" && !/^https?:\/\//i.test(variant)) {
                        pattern = `(?:https?:\\/\\/\\s*)?${pattern}`;
                    }
                    if (descriptor.type === "url") {
                        if (truncated) pattern += "(?:\\.\\.\\.|…)?";
                        pattern = `(^|[^A-Za-z0-9@._/-])(${pattern})(?![-A-Za-z0-9._/…])`;
                    }
                    const token = `${tokenPrefix}${tokens.length}\uE003`;
                    const matcher = new RegExp(pattern, loosePattern ? "i" : "");
                    if (!matcher.test(tokenizedText)) continue;
                    tokenizedText = tokenizedText.replace(matcher, descriptor.type === "url" ? `$1${token}` : token);
                    tokens.push({
                        token,
                        html: descriptor.html,
                        text: descriptor.displayText,
                        href: descriptor.href,
                    });
                    matched = true;
                    break;
                }
                if (matched) break;
            }
            if (!matched && descriptor.type === "url") {
                const token = `${tokenPrefix}${tokens.length}\uE003`;
                const separator = tokenizedText && !/\s$/.test(tokenizedText) ? " " : "";
                tokenizedText += `${separator}${token}`;
                tokens.push({
                    token,
                    html: descriptor.html,
                    text: descriptor.displayText,
                    href: descriptor.href,
                });
            }
        }

        if (descriptors.some((descriptor) => descriptor.type === "url")) {
            tokenizedText = tokenizedText
                .replace(/(^|[^A-Za-z0-9.-])(?:https?:\/\/\s*)?t\.co\/[A-Za-z0-9_-]+/gi, "$1")
                .replace(/[ \t]{2,}/g, " ");
        }

        let html = escapeHtml(tokenizedText).replace(/\n/g, "<br>");
        for (const item of tokens) html = html.split(item.token).join(item.html);
        let restoredText = tokenizedText;
        let markdown = tokenizedText;
        for (const item of tokens) {
            restoredText = restoredText.split(item.token).join(item.text || "");
            const label = String(item.text || "").replace(/([\\\]])/g, "\\$1");
            const safeHref = normalizeHttpLinkTarget(item.href);
            const markdownLink = safeHref ? `[${label}](${safeHref})` : item.text || "";
            markdown = markdown.split(item.token).join(markdownLink);
        }
        return { text: restoredText.trim(), html, markdown: markdown.trim() };
    }

    function isExpandableTweetTextControl(text) {
        const value = normalizeSpaces(text).replace(/\s+/g, " ").toLowerCase();
        if (!value) return false;
        if (/reply|replies|回复|评论|load more|查看更多/.test(value)) return false;
        return value === "show more" || value === "显示更多";
    }

    function isProbablySimplifiedChinese(text) {
        const value = normalizeSpaces(text);
        if (!value || /[\u3040-\u30ff\uac00-\ud7af]/.test(value)) return false;
        if (/[這個們來時為與發會後裡說對國學實現開關標題翻譯網頁顯預設點擊進內容簡體還從將過無讓應該種麼於較並業專車門間長處問題]/.test(value)) return false;
        const hanCount = (value.match(/\p{Script=Han}/gu) || []).length;
        const latinCount = (value.match(/[A-Za-z]/g) || []).length;
        return hanCount >= 2 && hanCount >= latinCount;
    }

    function buildArticleTranslationSource(parts = {}) {
        const title = normalizeSpaces(parts.title || "");
        const body = normalizeSpaces(parts.body || "");
        return {
            title,
            body,
            text: [title, body].filter(Boolean).join("\n\n"),
        };
    }

    async function translateArticleTextSegments(parts = {}, translate) {
        if (typeof translate !== "function") throw new TypeError("translate must be a function");

        const title = normalizeSpaces(parts.title || "");
        const paragraphs = Array.from(parts.paragraphs || [])
            .map((paragraph) => normalizeSpaces(paragraph))
            .filter(Boolean);
        const total = paragraphs.length + (title ? 1 : 0);
        let completed = 0;
        let translatedTitle = "";

        if (title) {
            translatedTitle = normalizeSpaces(await translate(title, {
                kind: "title",
                completed,
                total,
            }));
            if (!translatedTitle) throw new Error("empty article title translation");
            completed++;
        }

        const translatedParagraphs = [];
        for (const paragraph of paragraphs) {
            const translated = normalizeSpaces(await translate(paragraph, {
                kind: "paragraph",
                completed,
                total,
            }));
            if (!translated) throw new Error("empty article paragraph translation");
            translatedParagraphs.push(translated);
            completed++;
        }

        const translatedBody = translatedParagraphs.join("\n\n");
        return {
            translatedTitle,
            translatedParagraphs,
            translatedBody,
            translatedText: [translatedTitle, translatedBody].filter(Boolean).join("\n\n"),
        };
    }



    function normalizeXArticleUrlForCompare(url) {
        const match = String(url || "").replace("twitter.com", "x.com").match(/(?:https?:\/\/)?(?:www\.)?x\.com\/(?:i\/article|[^/]+\/(?:article|status))\/(\d+)/i);
        return match ? match[1] : "";
    }

    function isSameXArticleUrl(left, right) {
        const leftId = normalizeXArticleUrlForCompare(left);
        const rightId = normalizeXArticleUrlForCompare(right);
        return !!leftId && leftId === rightId;
    }

    function stripXArticleLinksFromText(text, articleUrl) {
        if (!articleUrl) return normalizeSpaces(text || "");
        const articleLinkPattern = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/(?:i\/article|[^/\s)]+\/article)\/\d+(?:[^\s)]*)?/ig;
        let result = String(text || "");
        result = result.replace(/\[([^\]]*)\]\((https?:\/\/(?:x|twitter)\.com\/(?:i\/article|[^/)]+\/article)\/\d+[^)]*)\)/ig, (match, label, href) => {
            return isSameXArticleUrl(href, articleUrl) || isSameXArticleUrl(label, articleUrl) ? "" : match;
        });
        result = result.replace(articleLinkPattern, (match) => isSameXArticleUrl(match, articleUrl) ? "" : match);
        return normalizeSpaces(result).replace(/^[-–—:：|｜\s]+/, "").trim();
    }

    function hasInlineMarkdownLinks(text) {
        return /\[[^\]]+\]\(https?:\/\/[^)\s]+\)/.test(String(text || ""));
    }

    function markdownToClipboardPlainText(markdown) {
        return String(markdown || "")
            .replace(/!\[([^\]]*)\]\(https?:\/\/[^)\s]+\)/g, "$1")
            .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
            .replace(/^#{1,6}\s+/gm, "")
            .trim();
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function inlineMarkdownToHtml(text) {
        let html = escapeHtml(text);
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        return html;
    }

    function plainTextToClipboardHtml(text) {
        return String(text || "")
            .split(/\n{2,}/)
            .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
            .join("\n");
    }

    function markdownToClipboardHtml(markdown) {
        const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
        const html = [];
        let paragraph = [];
        let list = [];
        let quote = [];
        let inCode = false;
        let codeLines = [];

        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${inlineMarkdownToHtml(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
            paragraph = [];
        };
        const flushList = () => {
            if (!list.length) return;
            html.push(`<ul>${list.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ul>`);
            list = [];
        };
        const flushQuote = () => {
            if (!quote.length) return;
            html.push(`<blockquote>${quote.map((line) => `<p>${inlineMarkdownToHtml(line)}</p>`).join("")}</blockquote>`);
            quote = [];
        };
        const flushCode = () => {
            if (!codeLines.length) return;
            html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
            codeLines = [];
        };
        const flushAll = () => {
            flushParagraph();
            flushList();
            flushQuote();
        };

        for (const rawLine of lines) {
            const line = rawLine.trimEnd();
            if (line.startsWith("```")) {
                if (inCode) {
                    flushCode();
                    inCode = false;
                } else {
                    flushAll();
                    inCode = true;
                    codeLines = [];
                }
                continue;
            }
            if (inCode) {
                codeLines.push(rawLine);
                continue;
            }

            if (!line.trim()) {
                flushAll();
                continue;
            }

            const heading = line.match(/^(#{1,4})\s+(.+)$/);
            if (heading) {
                flushAll();
                const level = Math.min(heading[1].length, 4);
                html.push(`<h${level}>${inlineMarkdownToHtml(heading[2].trim())}</h${level}>`);
                continue;
            }

            const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
            if (image) {
                flushAll();
                html.push(`<p><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}"></p>`);
                continue;
            }

            const listItem = line.match(/^[-*]\s+(.+)$/);
            if (listItem) {
                flushParagraph();
                flushQuote();
                list.push(listItem[1]);
                continue;
            }

            const quoteLine = line.match(/^>\s?(.*)$/);
            if (quoteLine) {
                flushParagraph();
                flushList();
                quote.push(quoteLine[1]);
                continue;
            }

            flushList();
            flushQuote();
            paragraph.push(line);
        }

        if (inCode) flushCode();
        flushAll();
        return html.join("\n");
    }

    function clonePlainData(data = {}) {
        try {
            return JSON.parse(JSON.stringify(data || {}));
        } catch (error) {
            return { ...(data || {}) };
        }
    }

    function applyTranslationOverrideToData(data = {}) {
        const result = clonePlainData(data);
        if (!result.prefer_translated_content || !result.translation_override) return result;

        const override = result.translation_override || {};
        const overrideType = String(override.type || "").toLowerCase();

        if (overrideType === "article" || result.type === "article") {
            const translatedTitle = normalizeSpaces(override.article_title || override.title || "");
            const translatedContent = normalizeSpaces(override.article_content || override.content || override.text || "");
            if (translatedTitle) result.article_title = translatedTitle;
            if (translatedContent) result.article_content = translatedContent;
            if (translatedTitle || translatedContent) result.type = "article";
            return result;
        }

        const translatedText = normalizeSpaces(override.markdown || override.text || override.article_content || "");
        if (translatedText) result.text = translatedText;
        return result;
    }

    const exported = {
        applyTranslationOverrideToData,
        markdownToClipboardHtml,
        plainTextToClipboardHtml,
        inlineMarkdownToHtml,
        escapeHtml,
        markdownToClipboardPlainText,
        hasInlineMarkdownLinks,
        buildArticleTranslationSource,
        translateArticleTextSegments,
        cleanupTwitterDisplayUrlLineBreaks,
        isExpandableTweetTextControl,
        isProbablySimplifiedChinese,
        makeLooseInlineTextPattern,
        normalizeInlineLinkText,
        normalizeSpaces,
        restoreTranslatedLinks,
        stripXArticleLinksFromText,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }

    Object.assign(globalScope, exported);
})(typeof globalThis !== "undefined" ? globalThis : this);
