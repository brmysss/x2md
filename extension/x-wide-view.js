(function () {
    "use strict";

    if (!/(^|\.)((x)|(twitter))\.com$/.test(location.hostname)) return;

    const STORAGE_KEY = "x2md_x_wide_view_enabled";
    const ROOT_CLASS = "x2md-wide-view";
    const BUTTON_ID = "__x2md_wide_view_toggle";

    function setEnabled(enabled) {
        document.documentElement.classList.toggle(ROOT_CLASS, enabled);
        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.setAttribute("aria-pressed", String(enabled));
            button.title = enabled ? "关闭 X2MD 宽屏模式" : "开启 X2MD 宽屏模式";
        }
    }

    function markSingleMedia() {
        document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
            tweet.querySelectorAll(".x2md-single-photo, .x2md-single-video").forEach((media) => {
                media.classList.remove("x2md-single-photo", "x2md-single-video");
            });
            if (tweet.querySelector('[data-testid="ScrollSnap-List"]')) return;
            const player = tweet.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"], video');
            const photos = tweet.querySelectorAll('[data-testid="tweetPhoto"]');
            if (!player && photos.length !== 1) return;
            const mediaBox = player
                ? player.closest('[data-testid="tweetPhoto"]')?.parentElement?.parentElement
                    || player.closest('[data-testid="videoComponent"]')?.parentElement
                    || player.parentElement?.parentElement
                : photos[0].parentElement?.parentElement;
            if (!mediaBox || mediaBox === tweet) return;
            mediaBox.classList.add(player
                ? "x2md-single-video"
                : "x2md-single-photo");
        });
    }

    function mountButton() {
        if (document.getElementById(BUTTON_ID) || !document.querySelector('[data-testid="primaryColumn"]')) return;
        const button = document.createElement("button");
        button.id = BUTTON_ID;
        button.type = "button";
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h6v2H6v4H4V5Zm10 0h6v6h-2V7h-4V5ZM4 13h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg><span>宽屏</span>';
        button.addEventListener("click", () => {
            const enabled = !document.documentElement.classList.contains(ROOT_CLASS);
            setEnabled(enabled);
            chrome.storage.local.set({ [STORAGE_KEY]: enabled });
        });
        document.body.appendChild(button);
        setEnabled(document.documentElement.classList.contains(ROOT_CLASS));
    }

    function refresh() {
        mountButton();
        markSingleMedia();
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (result) => {
        setEnabled(result[STORAGE_KEY] !== false);
        refresh();
    });

    let refreshQueued = false;
    const observer = new MutationObserver(() => {
        if (refreshQueued) return;
        refreshQueued = true;
        requestAnimationFrame(() => {
            refreshQueued = false;
            refresh();
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}());
