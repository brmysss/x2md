const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getVideoUrl } = require("../x-video-download.js");

test("video button extracts only HTTPS video.twimg.com media URLs", () => {
    const video = { currentSrc: "http://video.twimg.com/insecure.mp4", src: "https://video.twimg.com/secure.mp4", querySelectorAll: () => [] };
    assert.equal(getVideoUrl({ querySelectorAll: () => [video], innerHTML: "" }), "https://video.twimg.com/secure.mp4");
    assert.equal(getVideoUrl({ querySelectorAll: () => [], innerHTML: "https://video.twimg.com/secure.mp4" }), "https://video.twimg.com/secure.mp4");
    assert.equal(getVideoUrl({ querySelectorAll: () => [], innerHTML: "http://video.twimg.com/insecure.mp4" }), "");
});

test("video download rejects synthetic clicks and untrusted message sources", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "x-video-download.js"), "utf8");
    const background = fs.readFileSync(path.join(__dirname, "..", "background_runtime.js"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
    assert.match(source, /event\.isTrusted\s*===\s*false/);
    assert.match(background, /sender\?\.id[\s\S]{0,100}chrome\.runtime\.id/);
    assert.match(background, /isAllowedTwitterUrl\(sender\?\.tab\?\.url\)/);
    assert.match(background, /url\.protocol\s*===\s*["']https:/);
    assert.match(background, /url\.hostname\s*===\s*["']video\.twimg\.com["']/);
    assert.ok(manifest.host_permissions.includes("https://video.twimg.com/*"));
});
