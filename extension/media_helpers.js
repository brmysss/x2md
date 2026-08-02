(function (globalScope) {
    function decodeXHtmlEntities(value) {
        const namedEntities = {
            amp: "&",
            apos: "'",
            gt: ">",
            lt: "<",
            nbsp: " ",
            quot: '"',
        };

        return String(value || "").replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, decimal, hex, name) => {
            if (name) return namedEntities[name.toLowerCase()] ?? match;

            const codePoint = Number.parseInt(decimal || hex, hex ? 16 : 10);
            if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
                (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
                return match;
            }
            return String.fromCodePoint(codePoint);
        });
    }

    function getVariantBitrate(variant) {
        if (!variant || typeof variant !== "object") return -1;
        if (typeof variant.bitrate === "number") return variant.bitrate;
        if (typeof variant.bit_rate === "number") return variant.bit_rate;
        return -1;
    }

    function selectBestMp4Variant(variants) {
        if (!Array.isArray(variants) || variants.length === 0) return null;

        const mp4Variants = variants.filter((variant) => variant && variant.content_type === "video/mp4");
        if (mp4Variants.length === 0) return null;

        mp4Variants.sort((left, right) => getVariantBitrate(right) - getVariantBitrate(left));
        return mp4Variants[0];
    }

    function getArticleResult(result) {
        return result?.article?.article_results?.result ||
            result?.tweet?.article?.article_results?.result ||
            result?.result?.article?.article_results?.result ||
            null;
    }

    function normalizeArticleImageUrl(url, name = "orig") {
        const raw = String(url || "").trim();
        if (!raw) return "";
        if (raw.includes("?format=") || raw.includes("&format=")) {
            try {
                const parsed = new URL(raw);
                parsed.searchParams.set("name", name);
                return parsed.href;
            } catch (error) {
                return raw.replace(/name=[^&]+/, `name=${name}`);
            }
        }

        const extMatch = raw.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
        if (extMatch) {
            const base = raw.split(/[?#]/)[0];
            return `${base}?format=${extMatch[1]}&name=${name}`;
        }

        const equalsIndex = raw.lastIndexOf("=");
        if (equalsIndex >= 0) return `${raw.slice(0, equalsIndex + 1)}${name}`;
        return raw;
    }

    function normalizeTweetMediaUrlForCompare(url) {
        const raw = String(url || "").trim();
        if (!raw) return "";
        try {
            const parsed = new URL(raw);
            if (parsed.hostname !== "pbs.twimg.com") {
                parsed.searchParams.delete("name");
                return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`.replace(/\?$/, "");
            }
            parsed.searchParams.delete("name");
            parsed.searchParams.delete("format");
            parsed.pathname = parsed.pathname.replace(/\.[a-zA-Z0-9]+$/, "");
            return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`.replace(/\?$/, "");
        } catch (error) {
            return raw
                .replace(/[?&](?:name|format)=[^&]+/g, "")
                .replace(/\.[a-zA-Z0-9]+(?=$|[?#])/, "")
                .replace(/[?&]$/, "");
        }
    }

    function mergeTweetImagesWithDomFallback(apiImages, domImages) {
        const merged = [];
        const seen = new Set();
        for (const image of [...(Array.isArray(apiImages) ? apiImages : []), ...(Array.isArray(domImages) ? domImages : [])]) {
            const normalized = normalizeTweetMediaUrlForCompare(image);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            merged.push(image);
        }
        return merged;
    }


    function collectQuoteImageCompareKeys(quote, keys = new Set()) {
        if (!quote || typeof quote !== "object") return keys;
        for (const image of Array.isArray(quote.images) ? quote.images : []) {
            const key = normalizeTweetMediaUrlForCompare(image);
            if (key) keys.add(key);
        }
        return collectQuoteImageCompareKeys(quote.quote_tweet, keys);
    }

    function removeTweetImagesIncludedInQuote(images, quote, imageAltTexts = {}) {
        const quoteKeys = collectQuoteImageCompareKeys(quote);
        if (!quoteKeys.size) return { images: Array.isArray(images) ? images : [], image_alt_texts: imageAltTexts || {} };

        const nextImages = [];
        const keptKeys = new Set();
        for (const image of Array.isArray(images) ? images : []) {
            const key = normalizeTweetMediaUrlForCompare(image);
            if (!key || quoteKeys.has(key)) continue;
            keptKeys.add(key);
            nextImages.push(image);
        }

        const nextAltTexts = {};
        for (const [url, alt] of Object.entries(imageAltTexts || {})) {
            const key = normalizeTweetMediaUrlForCompare(url);
            if (keptKeys.has(key)) nextAltTexts[url] = alt;
        }
        return { images: nextImages, image_alt_texts: nextAltTexts };
    }

    function articleMediaInfoToMarkdown(mediaInfo, images) {
        const imageUrl = normalizeArticleImageUrl(mediaInfo?.original_img_url || mediaInfo?.url || "");
        if (!imageUrl) return "";
        if (Array.isArray(images) && !images.includes(imageUrl)) images.push(imageUrl);
        return `![](${imageUrl})`;
    }

    function buildArticleMediaLookup(article) {
        const lookup = new Map();
        for (const mediaEntity of Array.isArray(article?.media_entities) ? article.media_entities : []) {
            const mediaId = String(mediaEntity?.media_id || mediaEntity?.media_key || "");
            if (mediaId) lookup.set(mediaId, mediaEntity);
        }
        return lookup;
    }

    function normalizeEntityMap(entityMap) {
        if (Array.isArray(entityMap)) {
            return new Map(entityMap
                .map((entity, index) => [String(entity?.key ?? index), entity?.value])
                .filter(([key, value]) => key !== "" && value));
        }
        if (entityMap && typeof entityMap === "object") {
            return new Map(Object.entries(entityMap).map(([key, value]) => [String(key), value?.value || value]));
        }
        return new Map();
    }

    function rangesOverlap(left, right) {
        const leftStart = Number(left?.offset || 0);
        const leftEnd = leftStart + Number(left?.length || 0);
        const rightStart = Number(right?.offset || 0);
        const rightEnd = rightStart + Number(right?.length || 0);
        return leftStart < rightEnd && rightStart < leftEnd;
    }

    function readArticleUrlValue(value, depth = 0) {
        if (!value || depth > 3) return "";
        if (typeof value === "string") return value.trim();
        if (typeof value !== "object") return "";

        const directKeys = ["url", "href", "expanded_url", "expandedUrl", "unwound_url", "unwoundUrl", "target", "link"];
        for (const key of directKeys) {
            const found = readArticleUrlValue(value[key], depth + 1);
            if (found) return found;
        }
        return "";
    }

    function readArticleLinkUrl(entity) {
        const type = String(entity?.type || "").toUpperCase();
        if (!/(LINK|URL)/.test(type)) return "";
        const url = decodeXHtmlEntities(readArticleUrlValue(entity?.data || entity));
        if (!/^https?:\/\//i.test(url)) return "";
        return url.replace(/[()[\]\\\s]/gu, (character) => {
            const encoded = encodeURIComponent(character);
            return encoded === character
                ? `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
                : encoded.toUpperCase();
        });
    }

    function articleStyleMarker(styles) {
        const values = new Set(styles.map((range) => String(range?.style || "").toUpperCase()));
        if (values.has("BOLD") && values.has("ITALIC")) return "***";
        if (values.has("BOLD")) return "**";
        if (values.has("ITALIC")) return "*";
        return "";
    }

    function renderOverlappingArticleStyles(source, ranges, start, end) {
        const boundaries = [...new Set([start, end, ...ranges.flatMap((range) => [range.offset, range.offset + range.length])])]
            .filter((offset) => offset >= start && offset <= end)
            .sort((left, right) => left - right);
        let result = "";
        let active = [];
        for (let index = 0; index < boundaries.length - 1; index += 1) {
            const from = boundaries[index];
            const to = boundaries[index + 1];
            const next = ["BOLD", "ITALIC"].filter((style) => ranges.some((range) => range.style === style && range.offset <= from && range.offset + range.length >= to));
            if (next.join() !== active.join()) {
                result += [...active].reverse().map((style) => style === "BOLD" ? "</strong>" : "</em>").join("");
                result += next.map((style) => style === "BOLD" ? "<strong>" : "<em>").join("");
                active = next;
            }
            result += source.slice(from, to);
        }
        return result + [...active].reverse().map((style) => style === "BOLD" ? "</strong>" : "</em>").join("");
    }

    function applyArticleInlineFormatting(text, entityRanges, entities, inlineStyleRanges = [], links = [], tokenPrefix = "\uE000X2MD_LINK_") {
        const source = String(text || "");
        const ranges = Array.isArray(entityRanges) ? entityRanges : [];
        const styles = Array.isArray(inlineStyleRanges) ? inlineStyleRanges : [];
        const operations = [];
        for (const range of ranges) {
            const offset = Number(range?.offset || 0);
            const length = Number(range?.length || 0);
            if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) continue;
            if (offset < 0 || offset + length > source.length) continue;

            const url = readArticleLinkUrl(entities.get(String(range?.key)));
            if (!url) continue;
            const label = source.slice(offset, offset + length);
            if (!label.trim() || label.includes("](") || label.includes("![](")) continue;
            const fullLabel = url.replace(/^https?:\/\//i, "");
            const linkStyles = styles.filter((style) => rangesOverlap(range, style));
            const link = `[${fullLabel}](${url})`;
            const placeholder = `${tokenPrefix}${links.length}\uE001`;
            const marker = articleStyleMarker(linkStyles);
            links.push(marker ? `${marker}${link}${marker}` : link);
            operations.push({ offset, length, replacement: placeholder });
        }
        const validStyles = styles.map((range) => ({
            offset: Number(range?.offset || 0),
            length: Number(range?.length || 0),
            style: String(range?.style || "").toUpperCase(),
        })).filter((range) => Number.isFinite(range.offset) && Number.isFinite(range.length) && range.length > 0
            && range.offset >= 0 && range.offset + range.length <= source.length
            && ["BOLD", "ITALIC"].includes(range.style)
            && !ranges.some((excluded) => rangesOverlap(range, excluded)))
            .sort((left, right) => left.offset - right.offset || left.length - right.length);
        for (let index = 0; index < validStyles.length;) {
            const component = [validStyles[index]];
            let end = validStyles[index].offset + validStyles[index].length;
            index += 1;
            while (index < validStyles.length && validStyles[index].offset < end) {
                component.push(validStyles[index]);
                end = Math.max(end, validStyles[index].offset + validStyles[index].length);
                index += 1;
            }
            const offset = component[0].offset;
            const sameRange = component.every((range) => range.offset === offset && range.length === end - offset);
            const marker = articleStyleMarker(component);
            const replacement = sameRange
                ? `${marker}${source.slice(offset, end)}${marker}`
                : renderOverlappingArticleStyles(source, component, offset, end);
            operations.push({ offset, length: end - offset, replacement });
        }

        let result = source;
        for (const operation of operations.sort((left, right) => right.offset - left.offset)) {
            result = `${result.slice(0, operation.offset)}${operation.replacement}${result.slice(operation.offset + operation.length)}`;
        }
        return result;
    }


    function cleanArticleCodeText(value) {
        return decodeXHtmlEntities(value)
            .replace(/\u200b/g, "")
            .replace(/\r\n/g, "\n")
            .trimEnd();
    }

    function formatArticleCodeFence(code, language = "") {
        const cleanCode = cleanArticleCodeText(code);
        if (!cleanCode) return "";
        const cleanLanguage = String(language || "").trim();
        return `\`\`\`${cleanLanguage}\n${cleanCode.replace(/```/g, "``\u200b`")}\n\`\`\``;
    }

    function cleanArticleMarkdownText(value) {
        return decodeXHtmlEntities(value)
            .replace(/\u200b/g, "")
            .replace(/\r\n/g, "\n")
            .trim();
    }

    function readArticleCodeText(value, depth = 0) {
        if (!value || depth > 3) return "";
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
            return value
                .map((item) => readArticleCodeText(item, depth + 1))
                .filter(Boolean)
                .join("\n");
        }
        if (typeof value !== "object") return "";

        const directKeys = [
            "code", "codeText", "content", "contents", "text",
            "plainText", "rawText", "value", "source",
        ];
        for (const key of directKeys) {
            if (typeof value[key] === "string" && value[key].trim()) return value[key];
        }

        const nestedKeys = ["codeBlock", "code_block", "codeSnippet", "snippet", "pre", "body", "data"];
        for (const key of nestedKeys) {
            const nested = readArticleCodeText(value[key], depth + 1);
            if (nested) return nested;
        }

        if (Array.isArray(value.blocks)) {
            return value.blocks
                .map((block) => readArticleCodeText(block, depth + 1) || block?.text || "")
                .filter(Boolean)
                .join("\n");
        }

        return "";
    }

    function readArticleCodeLanguage(data = {}) {
        return String(
            data.language ||
            data.lang ||
            data.syntax ||
            data.codeLanguage ||
            data?.codeBlock?.language ||
            data?.code_block?.language ||
            ""
        ).trim();
    }

    function isArticleCodeEntity(entity) {
        const type = String(entity?.type || "").toUpperCase();
        const data = entity?.data || {};
        return type.includes("CODE") ||
            type.includes("PRE") ||
            type.includes("MONO") ||
            typeof data.code === "string" ||
            typeof data.codeText === "string" ||
            typeof data.codeBlock?.text === "string" ||
            typeof data.code_block?.text === "string";
    }

    function isArticleCodeBlock(block) {
        const type = String(block?.type || "").toLowerCase();
        const data = block?.data || {};
        return type.includes("code") ||
            type === "pre" ||
            data.language ||
            data.codeLanguage ||
            data.isCodeBlock === true ||
            data.codeBlock === true;
    }

    function renderArticleEntity(entity, mediaLookup, images) {
        const type = String(entity?.type || "").toUpperCase();
        const data = entity?.data || {};
        if (type === "DIVIDER") return "---";
        if (type === "MARKDOWN" || typeof data.markdown === "string") {
            return cleanArticleMarkdownText(data.markdown);
        }
        if (isArticleCodeEntity(entity)) {
            return formatArticleCodeFence(readArticleCodeText(data), readArticleCodeLanguage(data));
        }
        if (type !== "MEDIA") return "";

        const lines = [];
        for (const item of Array.isArray(data.mediaItems) ? data.mediaItems : []) {
            const mediaEntity = mediaLookup.get(String(item?.mediaId || item?.media_id || ""));
            const mediaInfo = mediaEntity?.media_info;
            if (mediaInfo?.variants) {
                const bestVariant = selectBestMp4Variant(mediaInfo.variants);
                if (bestVariant?.url) lines.push(`[MEDIA_VIDEO_URL:${bestVariant.url}]`);
                continue;
            }
            const markdown = articleMediaInfoToMarkdown(mediaInfo, images);
            if (markdown) lines.push(markdown);
        }
        if (data.caption && lines.length) lines.push(decodeXHtmlEntities(data.caption).trim());
        return lines.join("\n\n");
    }

    function renderArticleBlock(block, entities, mediaLookup, images) {
        const type = String(block?.type || "unstyled");
        const entityParts = [];
        for (const range of Array.isArray(block?.entityRanges) ? block.entityRanges : []) {
            const entity = entities.get(String(range?.key));
            const rendered = renderArticleEntity(entity, mediaLookup, images);
            if (rendered) entityParts.push(rendered);
        }

        const rawText = String(block?.text || "");
        const links = [];
        let tokenPrefix = "\uE000X2MD_LINK_";
        const decodedRawText = decodeXHtmlEntities(rawText);
        while (rawText.includes(tokenPrefix) || decodedRawText.includes(tokenPrefix)) tokenPrefix += "_";
        const styledText = applyArticleInlineFormatting(rawText, block?.entityRanges, entities, block?.inlineStyleRanges, links, tokenPrefix);
        const text = links
            .reduce((value, link, index) => value.replace(`${tokenPrefix}${index}\uE001`, link), decodeXHtmlEntities(styledText))
            .trim();
        if (isArticleCodeBlock(block)) {
            return formatArticleCodeFence(block?.text || "", readArticleCodeLanguage(block?.data || {}));
        }
        if (type === "atomic") return entityParts.join("\n\n");
        if (type === "header-one") return text ? `# ${text}` : "";
        if (type === "header-two") return text ? `## ${text}` : "";
        if (type === "header-three") return text ? `### ${text}` : "";
        if (type === "unordered-list-item") return text ? `- ${text}` : "";
        if (type === "ordered-list-item") return text ? `1. ${text}` : "";
        if (type === "blockquote") return text ? text.split("\n").map((line) => `> ${line}`).join("\n") : "";
        if (type === "code-block") return text ? `\`\`\`\n${text}\n\`\`\`` : "";
        return [...entityParts, text].filter(Boolean).join("\n\n");
    }

    function extractArticleMarkdownFromGraphQL(result) {
        const article = getArticleResult(result);
        if (!article?.content_state?.blocks) return null;

        const images = [];
        const coverMarkdown = articleMediaInfoToMarkdown(article?.cover_media?.media_info, images);
        const entities = normalizeEntityMap(article.content_state.entityMap);
        const mediaLookup = buildArticleMediaLookup(article);
        const blocks = Array.isArray(article.content_state.blocks) ? article.content_state.blocks : [];
        const body = blocks
            .map((block) => renderArticleBlock(block, entities, mediaLookup, images))
            .filter((part) => String(part || "").trim())
            .join("\n\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        const content = [coverMarkdown, body].filter(Boolean).join("\n\n").trim();
        if (!content) return null;

        const title = decodeXHtmlEntities(article.title).trim();
        const publishedSecs = article?.metadata?.first_published_at_secs;
        const published = publishedSecs ? new Date(Number(publishedSecs) * 1000).toISOString() : "";
        return {
            title,
            content,
            plainText: [title, body || blocks.map((block) => decodeXHtmlEntities(block?.text || "")).filter(Boolean).join("\n\n")]
                .filter(Boolean)
                .join("\n\n"),
            images: Array.from(new Set(images)),
            videos: Array.from(content.matchAll(/\[MEDIA_VIDEO_URL:(.+?)\]/g), (match) => match[1]),
            published,
            source: "graphql_article",
        };
    }

    function extractArticleMediaVideos(result) {
        const article = getArticleResult(result);
        if (!article) {
            return { videos: [], videoDurations: [] };
        }

        const referencedVideoIds = new Set();
        const entityMap = article?.content_state?.entityMap;
        const entities = normalizeEntityMap(entityMap);
        for (const entity of entities.values()) {
            const mediaItems = entity?.data?.mediaItems;
            if (!Array.isArray(mediaItems)) continue;

            for (const item of mediaItems) {
                if (item?.mediaCategory === "AmplifyVideo" && item?.mediaId) {
                    referencedVideoIds.add(String(item.mediaId));
                }
            }
        }

        const articleMediaEntities = Array.isArray(article.media_entities) ? article.media_entities : [];
        const videos = [];
        const videoDurations = [];

        for (const mediaEntity of articleMediaEntities) {
            const mediaId = String(mediaEntity?.media_id || "");
            const mediaInfo = mediaEntity?.media_info;
            const variants = mediaInfo?.variants;
            const isReferenced = referencedVideoIds.size === 0 || referencedVideoIds.has(mediaId);
            if (!isReferenced || !Array.isArray(variants)) continue;

            const bestVariant = selectBestMp4Variant(variants);
            if (!bestVariant?.url) continue;

            videos.push(bestVariant.url);
            if (typeof mediaInfo?.duration_millis === "number") {
                videoDurations.push(mediaInfo.duration_millis);
            }
        }

        return {
            videos: Array.from(new Set(videos)),
            videoDurations,
        };
    }

    function fillArticleVideoPlaceholders(content, videos, options = {}) {
        const preserveMissing = options.preserveMissing === true;
        if (typeof content !== "string" || !content.includes("[[VIDEO_HOLDER_")) {
            return content;
        }

        return content
            .replace(/\[\[VIDEO_HOLDER_(\d+)\]\](?:\s*\[\[VIDEO_HOLDER_\1\]\])+/g, "[[VIDEO_HOLDER_$1]]")
            .replace(/\[\[VIDEO_HOLDER_(\d+)\]\]/g, (match, mediaId) => {
                const bestUrl = (videos || []).find((url) => typeof url === "string" && url.includes(`/${mediaId}/`));
                if (bestUrl) {
                    return `\n[MEDIA_VIDEO_URL:${bestUrl}]\n`;
                }

                if (preserveMissing) {
                    return match;
                }

                return "\n🎞️ [推特媒体：视频/GIF由于隐藏过深提取失败]\n";
            })
            .replace(/\n{3,}/g, "\n\n");
    }

    const exported = {
        decodeXHtmlEntities,
        fillArticleVideoPlaceholders,
        extractArticleMarkdownFromGraphQL,
        extractArticleMediaVideos,
        getVariantBitrate,
        mergeTweetImagesWithDomFallback,
        removeTweetImagesIncludedInQuote,
        normalizeArticleImageUrl,
        normalizeTweetMediaUrlForCompare,
        selectBestMp4Variant,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }

    Object.assign(globalScope, exported);
})(typeof globalThis !== "undefined" ? globalThis : this);
