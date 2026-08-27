(function (root) {
    "use strict";

    const VIDEO_DOWNLOAD_BUTTON_CLASS = "__x2md_video_download_button";
    const SPACE_PANEL_DOWNLOAD_BUTTON_CLASS = "__x2md_space_panel_download_button";
    const VIDEO_SELECTOR = '[data-testid="videoComponent"], [data-testid="videoPlayer"], video, img[src*="video_thumb"]';
    const AUDIO_SPACE_SELECTOR = 'a[href*="/i/spaces/"]';
    const ACTION_GROUP_SELECTOR = '[role="group"]';
    const BOOKMARK_SELECTOR = '[data-testid="bookmark"], [data-testid="removeBookmark"], [aria-label*="Bookmark"], [aria-label*="书签"]';
    const SHARE_SELECTOR = '[data-testid="share"], [aria-label*="Share"], [aria-label*="分享"]';

    function isTwitterPage() {
        return typeof isTwitterLikePage === "function" ? isTwitterLikePage() : /(?:^|\.)x\.com$|(?:^|\.)twitter\.com$/i.test(root.location?.hostname || "");
    }

    function getTweetText(article) {
        return String(article?.querySelector?.('[data-testid="tweetText"]')?.innerText || "").trim();
    }

    function getTweetUrl(article) {
        for (const link of article?.querySelectorAll?.('a[href*="/status/"]') || []) {
            const href = link.getAttribute?.("href") || "";
            const match = href.match(/^(\/[^/]+\/status\/\d+)/);
            if (match) return new URL(match[1], root.location?.origin || "https://x.com").href;
        }
        const currentPath = String(root.location?.pathname || "").match(/^(\/[^/]+\/status\/\d+)/)?.[1] || "";
        return currentPath ? `${root.location?.origin || "https://x.com"}${currentPath}` : "";
    }

    function getVideoUrl(article) {
        for (const video of article?.querySelectorAll?.("video") || []) {
            const candidates = [video.currentSrc, video.src, video.getAttribute?.("src")];
            for (const source of video.querySelectorAll?.("source") || []) candidates.push(source.src || source.getAttribute?.("src"));
            const direct = candidates.find((value) => /^https:\/\/video\.twimg\.com\//i.test(String(value || "")));
            if (direct) return direct;
        }

        const html = String(article?.innerHTML || "");
        return html.match(/https:\/\/video\.twimg\.com\/[^"'\\\s]+?\.mp4(?:\?[^"'\\\s]*)?/i)?.[0] || "";
    }

    function getHlsPlaylist(article) {
        return String(article?.innerHTML || "").match(/https:\/\/video\.twimg\.com\/[^"'\\\s]+\.m3u8(?:\?[^"'\\\s]*)?/i)?.[0] || "";
    }

    function getLocalAudioSpaceId(article) {
        for (const link of article?.querySelectorAll?.(AUDIO_SPACE_SELECTOR) || []) {
            const match = String(link.getAttribute?.("href") || "").match(/\/i\/spaces\/([A-Za-z0-9_-]+)/);
            if (match) return match[1];
        }
        return String(article?.innerHTML || "").match(/\/i\/spaces\/([A-Za-z0-9_-]+)/)?.[1] || "";
    }

    function getAudioSpaceId(article) {
        const localId = getLocalAudioSpaceId(article);
        if (localId) return localId;
        for (const entry of root.performance?.getEntriesByType?.("resource") || []) {
            if (!String(entry.name || "").includes("/AudioSpaceById?")) continue;
            try {
                const variables = JSON.parse(new URL(entry.name).searchParams.get("variables") || "{}");
                if (/^[A-Za-z0-9_-]{8,64}$/.test(String(variables.id || ""))) return String(variables.id);
            } catch (error) { }
        }
        return "";
    }

    function isAudioSpaceArticle(article) {
        return Boolean(getLocalAudioSpaceId(article)) || Boolean(article?.querySelector?.('[data-testid*="space" i]')) ||
            /播放录音|加入一个[“"]?空间|Play recording|Play audio|Join (?:a )?Space/i.test(String(article?.innerText || ""));
    }

    function getAudioSpaceOperationId() {
        for (const entry of root.performance?.getEntriesByType?.("resource") || []) {
            const match = String(entry.name || "").match(/\/graphql\/([A-Za-z0-9_-]+)\/AudioSpaceById(?:\?|$)/);
            if (match) return match[1];
        }
        return "";
    }

    function findActionGroup(article) {
        const bookmark = article?.querySelector?.(BOOKMARK_SELECTOR);
        const share = article?.querySelector?.(SHARE_SELECTOR);
        const candidate = bookmark || share;
        if (!candidate) return null;
        const group = candidate.closest?.(ACTION_GROUP_SELECTOR);
        if (group) return group;

        let parent = candidate.parentElement;
        for (let depth = 0; parent && depth < 5 && parent !== article; depth++, parent = parent.parentElement) {
            if ((parent.querySelectorAll?.("button, [role='button']") || []).length >= 3) return parent;
        }
        return candidate.parentElement || null;
    }

    function findDirectChild(group, node) {
        let current = node;
        while (current && current.parentElement !== group) current = current.parentElement;
        return current?.parentElement === group ? current : null;
    }

    function showToast(message, type = "loading", duration = null) {
        if (typeof root.showToast === "function") root.showToast(message, type, duration);
    }

    function sendDownloadMessage(action, data) {
        return new Promise((resolve, reject) => {
            root.chrome?.runtime?.sendMessage?.({ action, data }, (response) => {
                if (root.chrome?.runtime?.lastError) {
                    reject(new Error(root.chrome.runtime.lastError.message));
                    return;
                }
                if (!response?.success) {
                    reject(new Error(response?.error || "媒体下载失败"));
                    return;
                }
                resolve(response);
            });
        });
    }

    function setButtonState(button, state, label) {
        button.dataset.x2mdState = state;
        button.disabled = state === "loading";
        if (label) button.title = label;
        button.style.opacity = state === "loading" ? "0.55" : "1";
    }

    function buildButton(reference, mediaType = "video") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${reference?.className || ""} ${VIDEO_DOWNLOAD_BUTTON_CLASS}`.trim();
        button.dataset.x2mdMediaType = mediaType;
        button.setAttribute("aria-label", mediaType === "audio" ? "下载录音" : "下载视频");
        button.title = mediaType === "audio" ? "下载录音；长按仅检测并下载 CC 字幕" : "下载视频；长按仅检测并下载 CC 字幕";
        button.innerHTML = `
            <span dir="ltr" style="display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:0 6px;line-height:32px;">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="width:19px;height:19px;display:block;fill:currentColor;"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z"/></svg>
                <span data-x2md-download-label style="font-size:14px;line-height:32px;">${mediaType === "audio" ? "Download Audio" : "Download"}</span>
            </span>
        `;
        button.addEventListener("mouseenter", () => {
            const span = button.querySelector("span");
            if (span) span.style.background = "rgba(29, 155, 240, .10)";
        });
        button.addEventListener("mouseleave", () => {
            const span = button.querySelector("span");
            if (span) span.style.background = "transparent";
        });
        return button;
    }

    function bindButton(button, article) {
        if (button.__x2md_download_bound) return;
        button.__x2md_download_bound = true;
        let longPressTimer = null;
        let longPressTriggered = false;

        async function runDownload(includeSubtitles = false) {
            const audio = button.dataset.x2mdMediaType === "audio";
            const loadingLabel = includeSubtitles ? "正在检测 CC 字幕" : audio ? "正在下载录音" : "正在下载视频";
            setButtonState(button, "loading", loadingLabel);
            showToast(includeSubtitles ? "正在检测 CC 字幕…" : audio ? "录音已转入后台准备…" : "正在解析视频源地址…", "loading", null);
            try {
                const response = await sendDownloadMessage(audio ? "download_audio_space" : "download_video", {
                    video_url: audio ? "" : getVideoUrl(article),
                    hls_playlist: audio ? "" : getHlsPlaylist(article),
                    tweet_url: getTweetUrl(article),
                    text: getTweetText(article),
                    space_id: audio ? getAudioSpaceId(article) : "",
                    audio_space_operation_id: audio ? getAudioSpaceOperationId() : "",
                    include_subtitles: includeSubtitles,
                });
                const resultLabel = includeSubtitles
                    ? response.subtitle_found
                        ? `CC 字幕已下载：${response.subtitle_filename}`
                        : "未发现可下载的 CC 字幕"
                    : audio
                        ? `录音已进入后台下载：${response.filename || "已保存"}`
                        : `视频已开始下载：${response.filename || "已保存"}`;
                setButtonState(button, "saved", resultLabel);
                showToast(resultLabel, "success", 3200);
            } catch (error) {
                console.error("[x2md] 媒体下载失败：", error);
                setButtonState(button, "failed", "媒体下载失败");
                showToast(error.message || "媒体下载失败，请重试", "error", 4200);
            } finally {
                setTimeout(() => {
                    if (button.isConnected) setButtonState(button, "idle", button.dataset.x2mdMediaType === "audio" ? "下载录音；长按仅检测并下载 CC 字幕" : "下载视频；长按仅检测并下载 CC 字幕");
                }, 1200);
            }
        }

        button.addEventListener("pointerdown", (event) => {
            if (event.isTrusted === false || button.disabled) return;
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                longPressTriggered = true;
                void runDownload(true);
            }, 650);
        }, true);
        for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
            button.addEventListener(eventName, () => {
                if (longPressTimer) clearTimeout(longPressTimer);
                longPressTimer = null;
            }, true);
        }
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.isTrusted === false) return;
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }
            await runDownload(false);
        }, true);
    }

    function buildSpacePanelButton(reference) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${reference?.className || ""} ${SPACE_PANEL_DOWNLOAD_BUTTON_CLASS}`.trim();
        button.setAttribute("aria-label", "下载录音");
        button.title = "下载录音；长按仅检测并下载 CC 字幕";
        button.style.cssText = reference?.style?.cssText || "";
        button.style.marginLeft = "4px";
        button.style.marginRight = "4px";
        button.innerHTML = `<div dir="ltr" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;color:rgb(15,20,25);"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:21px;height:21px;fill:currentColor;"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z"/></svg></div>`;
        return button;
    }

    function bindSpacePanelButton(button) {
        if (button.__x2md_download_bound) return;
        button.__x2md_download_bound = true;
        let longPressTimer = null;
        let longPressTriggered = false;

        async function runDownload(includeSubtitles) {
            setButtonState(button, "loading", includeSubtitles ? "正在检测 CC 字幕" : "正在下载录音");
            showToast(includeSubtitles ? "正在检测 CC 字幕…" : "录音已转入后台准备…", "loading", null);
            try {
                const response = await sendDownloadMessage("download_audio_space", {
                    tweet_url: getTweetUrl(root.document),
                    space_id: getAudioSpaceId(root.document),
                    audio_space_operation_id: getAudioSpaceOperationId(),
                    include_subtitles: includeSubtitles,
                });
                const message = includeSubtitles
                    ? response.subtitle_found
                        ? `CC 字幕已下载：${response.subtitle_filename}`
                        : "未发现可下载的 CC 字幕"
                    : `录音已进入后台下载：${response.filename}`;
                setButtonState(button, "saved", message);
                showToast(message, "success", 3600);
            } catch (error) {
                console.error("[x2md] Space 面板下载失败：", error);
                setButtonState(button, "failed", "媒体下载失败");
                showToast(error.message || "媒体下载失败，请重试", "error", 4200);
            } finally {
                setTimeout(() => {
                    if (button.isConnected) setButtonState(button, "idle", "下载录音；长按仅检测并下载 CC 字幕");
                }, 1200);
            }
        }

        button.addEventListener("pointerdown", (event) => {
            if (event.isTrusted === false || button.disabled) return;
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                longPressTriggered = true;
                void runDownload(true);
            }, 650);
        }, true);
        for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
            button.addEventListener(eventName, () => {
                if (longPressTimer) clearTimeout(longPressTimer);
                longPressTimer = null;
            }, true);
        }
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.isTrusted === false) return;
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }
            void runDownload(false);
        }, true);
    }

    function mountSpacePanelButton() {
        const panel = root.document?.querySelector?.('[data-testid="SpaceDockExpanded"]');
        if (!panel) {
            root.document?.querySelectorAll?.(`.${SPACE_PANEL_DOWNLOAD_BUTTON_CLASS}`).forEach((button) => button.remove());
            return;
        }
        const collapse = panel.querySelector?.('button[aria-label="收起"], button[aria-label="Collapse"]');
        const toolbar = collapse?.parentElement;
        if (!toolbar) return;
        let button = toolbar.querySelector?.(`.${SPACE_PANEL_DOWNLOAD_BUTTON_CLASS}`);
        if (!button) {
            const reference = toolbar.querySelector?.('button[aria-label="画中画"], button[aria-label="Picture in picture"]') || collapse;
            button = buildSpacePanelButton(reference);
            toolbar.insertBefore(button, collapse.nextSibling);
        }
        bindSpacePanelButton(button);
    }

    function mount() {
        if (!isTwitterPage()) {
            root.document?.querySelectorAll?.(`.${VIDEO_DOWNLOAD_BUTTON_CLASS}`).forEach((button) => button.remove());
            return;
        }
        mountSpacePanelButton();
        for (const article of root.document?.querySelectorAll?.("article, [role='article']") || []) {
            const existing = article.querySelector?.(`.${VIDEO_DOWNLOAD_BUTTON_CLASS}`);
            const mediaType = article.querySelector?.(VIDEO_SELECTOR) ? "video" : isAudioSpaceArticle(article) ? "audio" : "";
            if (!mediaType) {
                existing?.remove();
                continue;
            }
            const group = findActionGroup(article);
            if (!group) continue;
            const button = existing || buildButton(group.querySelector?.(BOOKMARK_SELECTOR) || group.querySelector?.("button"), mediaType);
            button.dataset.x2mdMediaType = mediaType;
            if (!existing) {
                const share = group.querySelector?.(SHARE_SELECTOR);
                const nativeDownload = group.querySelector?.('[aria-label*="Download"], [aria-label*="下载"]');
                const directNativeDownload = findDirectChild(group, nativeDownload);
                const directShare = findDirectChild(group, share);
                if (directNativeDownload) group.insertBefore(button, directNativeDownload.nextSibling);
                else if (directShare) group.insertBefore(button, directShare);
                else group.appendChild(button);
            }
            bindButton(button, article);
        }
    }

    root.X2MDXVideoDownload = { mount, buildVideoDownloadFilename: root.buildVideoDownloadFilename, getVideoUrl };
    if (typeof module !== "undefined" && module.exports) module.exports = { mount, getVideoUrl };
})(typeof globalThis !== "undefined" ? globalThis : this);
