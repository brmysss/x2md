(function (root) {
    "use strict";

    const VIDEO_DOWNLOAD_BUTTON_CLASS = "__x2md_video_download_button";
    const VIDEO_SELECTOR = '[data-testid="videoComponent"], [data-testid="videoPlayer"], video, img[src*="video_thumb"]';
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

    function sendDownloadMessage(data) {
        return new Promise((resolve, reject) => {
            root.chrome?.runtime?.sendMessage?.({ action: "download_video", data }, (response) => {
                if (root.chrome?.runtime?.lastError) {
                    reject(new Error(root.chrome.runtime.lastError.message));
                    return;
                }
                if (!response?.success) {
                    reject(new Error(response?.error || "视频下载失败"));
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

    function buildButton(reference) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${reference?.className || ""} ${VIDEO_DOWNLOAD_BUTTON_CLASS}`.trim();
        button.setAttribute("aria-label", "下载视频");
        button.title = "下载视频";
        button.innerHTML = `
            <span dir="ltr" style="display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:0 6px;line-height:32px;">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="width:19px;height:19px;display:block;fill:currentColor;"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z"/></svg>
                <span style="font-size:14px;line-height:32px;">Download</span>
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
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.isTrusted === false) return;
            setButtonState(button, "loading", "正在下载视频");
            showToast("正在准备下载视频…", "loading", null);
            try {
                const response = await sendDownloadMessage({
                    video_url: getVideoUrl(article),
                    tweet_url: getTweetUrl(article),
                    text: getTweetText(article),
                });
                setButtonState(button, "saved", `已下载：${response.filename || "视频"}`);
                showToast(`视频已下载：${response.filename || "已保存"}`, "success", 2600);
            } catch (error) {
                console.error("[x2md] 视频下载失败：", error);
                setButtonState(button, "failed", "视频下载失败");
                showToast(error.message || "视频下载失败，请重试", "error", 4200);
            } finally {
                setTimeout(() => {
                    if (button.isConnected) setButtonState(button, "idle", "下载视频");
                }, 1200);
            }
        }, true);
    }

    function mount() {
        if (!isTwitterPage()) {
            root.document?.querySelectorAll?.(`.${VIDEO_DOWNLOAD_BUTTON_CLASS}`).forEach((button) => button.remove());
            return;
        }
        for (const article of root.document?.querySelectorAll?.("article, [role='article']") || []) {
            const existing = article.querySelector?.(`.${VIDEO_DOWNLOAD_BUTTON_CLASS}`);
            if (!article.querySelector?.(VIDEO_SELECTOR)) {
                existing?.remove();
                continue;
            }
            const group = findActionGroup(article);
            if (!group) continue;
            const button = existing || buildButton(group.querySelector?.(BOOKMARK_SELECTOR) || group.querySelector?.("button"));
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
