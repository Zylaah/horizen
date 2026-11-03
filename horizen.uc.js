// Horizen, step 1. The layout itself is in chrome.css. This script only
// marks the window, and takes the mark off in compact mode and popups.
// Restart Zen after changing either file.
(() => {
  if (window.__horizenLoaded) {
    return;
  }
  window.__horizenLoaded = true;

  const root = document.documentElement;
  const PREF = "horizen.layout.enabled";

  const enabled = () => {
    try {
      return Services.prefs.getBoolPref(PREF, true);
    } catch (e) {
      return true;
    }
  };

  const skipped = () =>
    root.getAttribute("zen-little-window") === "true" ||
    root.hasAttribute("popup-window") ||
    root.getAttribute("zen-compact-mode") === "true" ||
    root.hasAttribute("customizing");

  function apply() {
    if (!enabled() || skipped()) {
      root.removeAttribute("horizen-layout");
      return;
    }
    root.setAttribute("horizen-layout", "true");
  }

  const manager = window.gZenVerticalTabsManager;
  if (manager && !manager._updateEvent.__horizen) {
    const original = manager._updateEvent;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      if (window.__horizenReady) {
        apply();
      }
      return result;
    };
    wrapped.__horizen = true;
    manager._updateEvent = wrapped;
  }

  new MutationObserver(apply).observe(root, {
    attributes: true,
    attributeFilter: ["zen-compact-mode", "customizing", "zen-little-window"],
  });

  Services.prefs.addObserver(PREF, apply);
  window.addEventListener(
    "unload",
    () => {
      try {
        Services.prefs.removeObserver(PREF, apply);
      } catch (e) {}
    },
    { once: true }
  );

  async function start() {
    try {
      await window.gZenWorkspaces?.promiseInitialized;
      await window.delayedStartupPromise;
      await window.SessionStore?.promiseAllWindowsRestored;
    } catch (e) {}
    window.__horizenReady = true;
    apply();
  }

  if (window.gBrowserInit?.delayedStartupFinished) {
    start();
  } else {
    const observer = subject => {
      if (subject !== window) {
        return;
      }
      Services.obs.removeObserver(observer, "browser-delayed-startup-finished");
      start();
    };
    Services.obs.addObserver(observer, "browser-delayed-startup-finished");
  }
})();
