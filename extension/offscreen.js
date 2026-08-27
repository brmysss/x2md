(function () {
    "use strict";

    const objectUrls = new Set();

    async function buildHlsBlob(source) {
        const playlistUrl = new URL(source);
        const response = await fetch(playlistUrl);
        if (!response.ok) throw new Error(`录音清单请求失败：${response.status}`);
        const playlist = await response.text();
        const segmentUrls = playlist.split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"))
            .map((line) => new URL(line, playlistUrl).href);
        if (!segmentUrls.length) throw new Error("录音清单中没有音频分片");

        const parts = new Array(segmentUrls.length);
        let nextIndex = 0;
        await Promise.all(Array.from({ length: Math.min(12, segmentUrls.length) }, async () => {
            while (nextIndex < segmentUrls.length) {
                const index = nextIndex++;
                const segment = await fetch(segmentUrls[index]);
                if (!segment.ok) throw new Error(`录音分片请求失败：${segment.status}`);
                parts[index] = await segment.arrayBuffer();
            }
        }));
        return new Blob(parts, { type: "audio/aac" });
    }

    function startDownload(options) {
        return new Promise((resolve, reject) => {
            chrome.downloads.download({ saveAs: false, conflictAction: "uniquify", ...options }, (id) => {
                const runtimeError = chrome.runtime.lastError;
                if (runtimeError) reject(new Error(runtimeError.message));
                else resolve(id);
            });
        });
    }

    async function downloadHlsAudio(source, filename) {
        const blob = await buildHlsBlob(source);
        const url = URL.createObjectURL(blob);
        objectUrls.add(url);
        try {
            await startDownload({ url, filename });
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icons/icon128.png",
                title: "X2MD 录音已准备完成",
                message: `${filename} 已交给 Chrome 下载`,
            });
        } finally {
            setTimeout(() => {
                URL.revokeObjectURL(url);
                objectUrls.delete(url);
            }, 60_000);
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.target !== "offscreen") return false;
        if (message.action === "revoke_object_url") {
            URL.revokeObjectURL(message.url);
            objectUrls.delete(message.url);
            sendResponse({ success: true });
            return false;
        }
        if (message.action === "download_hls_audio") {
            void downloadHlsAudio(message.url, message.filename).catch((error) => {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icon128.png",
                    title: "X2MD 录音下载失败",
                    message: error.message || String(error),
                });
            });
            sendResponse({ success: true, queued: true });
            return false;
        }
        if (message.action !== "build_hls_blob") return false;
        buildHlsBlob(message.url).then((blob) => {
            const url = URL.createObjectURL(blob);
            objectUrls.add(url);
            sendResponse({ success: true, url });
        }).catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
        return true;
    });
})();
