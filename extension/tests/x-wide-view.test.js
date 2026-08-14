const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const css = fs.readFileSync(path.join(extensionRoot, "x-wide-view.css"), "utf8");
const script = fs.readFileSync(path.join(extensionRoot, "x-wide-view.js"), "utf8");

test("X content script loads the desktop wide-view stylesheet", () => {
    const xScript = manifest.content_scripts.find((entry) => entry.matches.includes("*://*.x.com/*"));
    assert.deepEqual(xScript.css, ["x-wide-view.css"]);
    assert.equal(xScript.js[0], "x-wide-view.js");
});

test("wide view is class-gated and expands only tweet cells", () => {
    assert.match(css, /html\.x2md-wide-view \[data-testid="sidebarColumn"\][\s\S]*display:\s*none\s*!important/);
    assert.match(css, /html\.x2md-wide-view \[data-testid="primaryColumn"\][\s\S]*max-width:\s*min\(900px, calc\(100vw - 420px\)\)\s*!important/);
    assert.match(css, /div:has\(> section\[role="region"\]\)[\s\S]*max-width:\s*none\s*!important/);
    assert.match(css, /cellInnerDiv[^\n]*:has\(article\[data-testid="tweet"\]\)/);
    assert.doesNotMatch(css, /\[data-testid="primaryColumn"\] section/);
    assert.match(css, /article\[data-testid="tweet"\][\s\S]*width:\s*100%\s*!important/);
    assert.match(css, /nav \[role="tablist"\]\[data-testid="ScrollSnap-List"\][\s\S]*display:\s*flex\s*!important/);
});

test("four-image carousels become a complete four-column row", () => {
    assert.match(css, /article\[data-testid="tweet"\][^\n]*ScrollSnap-List[^\n]*:has\(> :nth-child\(4\)\)/);
    assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)\s*!important/);
    assert.match(css, /overflow:\s*visible\s*!important/);
});

test("wide view leaves native single-media geometry intact and persists its state", () => {
    assert.doesNotMatch(css, /x2md-single-(?:photo|video)/);
    assert.doesNotMatch(script, /x2md-single-(?:photo|video)/);
    assert.match(script, /x2md_x_wide_view_enabled/);
    assert.match(script, /twitter/);
    assert.match(script, /location\.hostname/);
    assert.match(script, /chrome\.storage\.local\.get\(\{ \[STORAGE_KEY\]: true \}/);
    assert.match(script, /aria-pressed/);
    assert.match(script, /MutationObserver/);
    assert.match(script, /requestAnimationFrame/);
});

test("wide view asks X to remeasure media after each layout mode change", () => {
    const rootClasses = new Set();
    let mountedButton = null;
    let resizeEvents = 0;
    const button = {
        addEventListener(type, listener) {
            if (type === "click") this.click = listener;
        },
        setAttribute() {},
    };
    const document = {
        body: { appendChild(node) { mountedButton = node; } },
        createElement() { return button; },
        documentElement: {
            classList: {
                contains(name) { return rootClasses.has(name); },
                toggle(name, enabled) {
                    if (enabled) rootClasses.add(name);
                    else rootClasses.delete(name);
                },
            },
        },
        getElementById() { return mountedButton; },
        querySelector() { return {}; },
    };

    vm.runInNewContext(script, {
        chrome: {
            storage: {
                local: {
                    get(_defaults, callback) { callback({ x2md_x_wide_view_enabled: true }); },
                    set() {},
                },
            },
        },
        document,
        Event: class Event { constructor(type) { this.type = type; } },
        location: { hostname: "x.com" },
        MutationObserver: class MutationObserver { observe() {} },
        requestAnimationFrame(callback) { callback(); },
        window: {
            dispatchEvent(event) {
                if (event.type === "resize") resizeEvents += 1;
            },
        },
    });

    assert.equal(resizeEvents, 1, "enabling wide view must invalidate X's stale media measurements");
    button.click();
    assert.equal(resizeEvents, 2, "returning to narrow view must also remeasure media");
});
