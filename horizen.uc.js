// Horizen, step 1: put Zen's toolbox across the top of the window and the
// toolbar under the tab strip. Reserved essentials and pinned-folder slots
// come later. Restart Zen after changing this file.
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

  function setOrient(value) {
    const tabs = window.gBrowser?.tabContainer;
    if (!tabs) {
      return;
    }
    tabs.setAttribute("orient", value);
    const main = tabs.arrowScrollbox;
    if (main) {
      main.setAttribute("orient", value);
      main.scrollbox?.setAttribute("orient", value);
    }
    for (const box of document.querySelectorAll("zen-workspace arrowscrollbox")) {
      box.setAttribute("orient", value);
      box.scrollbox?.setAttribute("orient", value);
    }
  }

  function parkToolbar() {
    const titlebar = document.getElementById("titlebar");
    const navbar = document.getElementById("nav-bar");
    const bookmarks = document.getElementById("PersonalToolbar");
    if (!titlebar || !navbar) {
      return;
    }
    if (navbar.previousElementSibling !== titlebar) {
      titlebar.after(navbar);
    }
    if (bookmarks && bookmarks.previousElementSibling !== navbar) {
      navbar.after(bookmarks);
    }
    document.getElementById("navigator-toolbox")?.style.removeProperty("max-width");
  }

  function restoreToolbar() {
    const container = document.getElementById("zen-appcontent-navbar-container");
    if (!container) {
      return;
    }
    const navbar = document.getElementById("nav-bar");
    const bookmarks = document.getElementById("PersonalToolbar");
    if (navbar && navbar.parentElement !== container) {
      container.appendChild(navbar);
    }
    if (bookmarks && bookmarks.parentElement !== container) {
      container.appendChild(bookmarks);
    }
  }

  function apply() {
    if (!enabled() || skipped()) {
      root.removeAttribute("horizen-layout");
      restoreToolbar();
      setOrient("vertical");
      return;
    }
    root.setAttribute("horizen-layout", "true");
    parkToolbar();
    setOrient("horizontal");
  }

  window.__horizenApply = apply;

  const manager = window.gZenVerticalTabsManager;
  if (manager && !manager._updateEvent.__horizen) {
    const original = manager._updateEvent;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      if (window.__horizenReady) {
        window.__horizenApply?.();
      }
      return result;
    };
    wrapped.__horizen = true;
    manager._updateEvent = wrapped;
  }

  const strip = document.getElementById("tabbrowser-arrowscrollbox");
  if (strip) {
    new MutationObserver(() => {
      if (root.getAttribute("horizen-layout") === "true") {
        setOrient("horizontal");
      }
    }).observe(strip, { childList: true });
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
