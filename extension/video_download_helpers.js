(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const VIDEO_FILENAME_MAX_CHARS = 80;
    const SENTENCE_BOUNDARY = /[。！？!?；;：:，,、.．…]/u;
    const INVALID_FILENAME_CHARS = /[\u0000-\u001f<>:"/\\|?*]/g;

    function cleanFilenameStem(value, fallback = "x2md-video") {
        const source = String(value || "")
            .replace(/https?:\/\/\S+/giu, "")
            .replace(/\s+/gu, " ")
            .trim();
        const chars = Array.from(source);
        let boundary = -1;
        for (let index = 10; index < chars.length; index++) {
            if (SENTENCE_BOUNDARY.test(chars[index])) {
                boundary = index;
                break;
            }
        }

        const candidate = (boundary >= 0 ? chars.slice(0, boundary) : chars.slice(0, VIDEO_FILENAME_MAX_CHARS))
            .join("")
            .replace(/[。！？!?；;：:，,、.．…]+$/gu, "")
            .replace(INVALID_FILENAME_CHARS, "_")
            .replace(/\s+/gu, " ")
            .trim();
        const fallbackStem = String(fallback || "x2md-video")
            .replace(INVALID_FILENAME_CHARS, "_")
            .trim() || "x2md-video";
        return Array.from(candidate || fallbackStem).slice(0, VIDEO_FILENAME_MAX_CHARS).join("");
    }

    function buildVideoDownloadFilename(text, fallback = "x2md-video") {
        return `${cleanFilenameStem(text, fallback)}.mp4`;
    }

    return { buildVideoDownloadFilename, cleanFilenameStem };
});
