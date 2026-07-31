const test = require("node:test");
const assert = require("node:assert/strict");

const { buildVideoDownloadFilename, cleanFilenameStem } = require("../video_download_helpers.js");

test("video filenames use the first sentence boundary after ten characters", () => {
    assert.equal(
        buildVideoDownloadFilename("这是一条值得保存的视频内容。第二句不应进入文件名 https://t.co/example"),
        "这是一条值得保存的视频内容.mp4",
    );
    assert.equal(
        buildVideoDownloadFilename("abcdefghijk. second sentence should not be used"),
        "abcdefghijk.mp4",
    );
    assert.equal(buildVideoDownloadFilename("Hello."), "Hello.mp4");
});

test("video filename fallback strips unsafe path characters and caps length", () => {
    const stem = cleanFilenameStem("abcdefghijk/nope*abc", "fallback");
    assert.equal(stem, "abcdefghijk_nope_abc");
    assert.equal(cleanFilenameStem("a".repeat(120)), "a".repeat(80));
    assert.equal(buildVideoDownloadFilename("", "备用视频"), "备用视频.mp4");
});
