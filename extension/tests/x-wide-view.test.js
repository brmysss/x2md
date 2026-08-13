const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const css = fs.readFileSync(path.join(extensionRoot, "x-wide-view.css"), "utf8");

test("X content script loads the desktop wide-view stylesheet", () => {
    const xScript = manifest.content_scripts.find((entry) => entry.matches.includes("*://*.x.com/*"));
    assert.deepEqual(xScript.css, ["x-wide-view.css"]);
});

test("wide view hides the sidebar and expands the primary timeline", () => {
    assert.match(css, /\[data-testid="sidebarColumn"\][\s\S]*display:\s*none\s*!important/);
    assert.match(css, /\[data-testid="primaryColumn"\][\s\S]*max-width:\s*min\(1050px, calc\(100vw - 420px\)\)\s*!important/);
    assert.match(css, /article\[data-testid="tweet"\][\s\S]*width:\s*100%\s*!important/);
});

test("four-image carousels become a complete four-column row", () => {
    assert.match(css, /ScrollSnap-List[^\n]*:has\(> :nth-child\(4\)\)/);
    assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)\s*!important/);
    assert.match(css, /overflow:\s*visible\s*!important/);
});
