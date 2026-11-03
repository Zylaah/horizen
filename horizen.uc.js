// Horizen. Zen's sidebar is left exactly as it is, and only collapsed out of
// sight, the way Zen itself does in fullscreen. Spaces, essentials, folders and
// session restore keep running on it. A separate horizontal strip reads the same
// tabs and draws them across the top of the page. Restart Zen after editing.
(() => {
  if (window.__horizenLoaded) {
    return;
  }
  window.__horizenLoaded = true;

  const XHTML = "http://www.w3.org/1999/xhtml";
  const PREF = "horizen.layout.enabled";
  const root = document.documentElement;

  let strip = null;
  let bar = null;
  let active = false;
  let ready = false;
  let applying = false;
  let frame = 0;

  const enabled = () => {
    try {
      return Services.prefs.getBoolPref(PREF, true);
    } catch (e) {
      return true;
    }
  };

  // Single toolbar moves the address bar into the sidebar, which would be
  // hidden with it. Compact mode already hides the sidebar on its own.
  const wanted = () =>
    enabled() &&
    root.getAttribute("zen-little-window") !== "true" &&
    !root.hasAttribute("popup-window") &&
    !root.hasAttribute("customizing") &&
    root.getAttribute("zen-compact-mode") !== "true" &&
    root.getAttribute("zen-single-toolbar") !== "true";

  function h(tag, cls, parent) {
    const el = document.createElementNS(XHTML, tag);
    if (cls) {
      el.className = cls;
    }
    parent?.append(el);
    return el;
  }

  function collectTabs() {
    const gz = window.gZenWorkspaces;
    const activeId = gz?.activeWorkspace;
    const essentials = [];
    const pinned = [];
    const normal = [];
    for (const tab of window.gBrowser.tabs) {
      if (
        tab.closing ||
        tab.hidden ||
        tab.hasAttribute("zen-empty-tab") ||
        tab.hasAttribute("zen-glance-tab")
      ) {
        continue;
      }
      if (tab.hasAttribute("zen-essential")) {
        if (gz?.containerSpecificEssentials) {
          const space = gz.getActiveWorkspaceFromCache?.();
          const want = Number(space?.containerTabId) || 0;
          if (want !== (Number(tab.getAttribute("usercontextid")) || 0)) {
            continue;
          }
        }
        essentials.push(tab);
        continue;
      }
      const id = tab.getAttribute("zen-workspace-id");
      if (id && activeId && id !== activeId) {
        continue;
      }
      (tab.pinned ? pinned : normal).push(tab);
    }
    return { essentials, pinned: pinnedItems(pinned), normal };
  }

  // The pinned band follows the order of the active space's pinned section,
  // so loose pins and folders sit exactly as they do in the sidebar. A folder
  // is one chip here, never its tabs.
  function pinnedItems(fallbackTabs) {
    const gz = window.gZenWorkspaces;
    const container =
      gz?.activeWorkspaceElement?.pinnedTabsContainer ?? gz?.pinnedTabsContainer;
    if (!container) {
      return fallbackTabs.map(tab => ({ tab }));
    }
    const items = [];
    const addTab = tab => {
      if (
        tab &&
        !tab.closing &&
        !tab.hidden &&
        !tab.hasAttribute("zen-empty-tab") &&
        !tab.hasAttribute("zen-glance-tab") &&
        !tab.hasAttribute("zen-essential")
      ) {
        items.push({ tab });
      }
    };
    for (const child of container.children) {
      if (child.localName === "tab") {
        addTab(child);
      } else if (child.isZenFolder) {
        if (child.localName !== "zen-workspace-collapsible-pins") {
          items.push({ folder: child });
        }
      } else if (child.tabs) {
        child.tabs.forEach(addTab);
      }
    }
    return items;
  }

  function folderTabs(folder) {
    const found = [];
    for (const item of folder.allItemsRecursive) {
      if (item.localName === "tab") {
        found.push(item);
      } else if (!item.isZenFolder && item.tabs) {
        found.push(...item.tabs);
      }
    }
    return found.filter(tab => !tab.hasAttribute("zen-empty-tab"));
  }

  function folderEl(folder) {
    const el = h("div", "horizen-folder");
    el.folder = folder;
    const name = folder.label || folder.name || "Folder";
    el.title = name;
    if (folderTabs(folder).includes(window.gBrowser.selectedTab)) {
      el.setAttribute("active", "true");
    }
    const svg = folder.icon?.firstElementChild;
    if (svg) {
      h("span", "horizen-folder-icon", el).append(svg.cloneNode(true));
    }
    h("span", "horizen-folder-label", el).textContent = name;
    return el;
  }

  function addTabItem(popup, tab) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", tab.label || "");
    item.setAttribute("class", "menuitem-iconic");
    item.setAttribute(
      "image",
      tab.getAttribute("image") || "chrome://global/skin/icons/defaultFavicon.svg"
    );
    if (tab === window.gBrowser.selectedTab) {
      item.setAttribute("default", "true");
    }
    item.addEventListener("command", () => {
      window.gBrowser.selectedTab = tab;
    });
    popup.append(item);
  }

  function fillFolderMenu(popup, folder) {
    let count = 0;
    for (const item of folder.allItems) {
      if (item.hasAttribute("zen-empty-tab")) {
        continue;
      }
      count++;
      if (item.isZenFolder) {
        const menu = document.createXULElement("menu");
        menu.setAttribute("label", item.label || item.name || "Folder");
        const sub = document.createXULElement("menupopup");
        menu.append(sub);
        fillFolderMenu(sub, item);
        popup.append(menu);
      } else if (item.localName === "tab") {
        addTabItem(popup, item);
      } else if (item.tabs) {
        item.tabs.forEach(tab => addTabItem(popup, tab));
      }
    }
    if (!count) {
      const empty = document.createXULElement("menuitem");
      empty.setAttribute("label", "Empty folder");
      empty.setAttribute("disabled", "true");
      popup.append(empty);
    }
  }

  function openFolder(el) {
    const popup = document.createXULElement("menupopup");
    fillFolderMenu(popup, el.folder);
    document.getElementById("mainPopupSet").append(popup);
    popup.addEventListener("popuphidden", () => popup.remove(), { once: true });
    popup.openPopup(el, "after_start");
  }

  function tabEl(tab, kind) {
    const el = h("div", `horizen-tab horizen-${kind}`);
    el.tab = tab;
    el.dataset.kind = kind;
    el.title = tab.label || "";
    if (window.gBrowser.selectedTab === tab) {
      el.setAttribute("selected", "true");
    }
    for (const name of ["busy", "pending", "soundplaying", "muted", "attention"]) {
      if (tab.hasAttribute(name)) {
        el.setAttribute(name, "true");
      }
    }
    const icon = h("img", "horizen-icon", el);
    icon.src =
      tab.getAttribute("image") || "chrome://global/skin/icons/defaultFavicon.svg";
    icon.tab = tab;
    if (kind === "normal") {
      const label = h("span", "horizen-label", el);
      label.textContent = tab.label || "";
      label.tab = tab;
      const close = h("span", "horizen-close", el);
      close.textContent = "\u00d7";
      close.tab = tab;
    }
    return el;
  }

  function divider(parent) {
    h("span", "horizen-divider", parent);
  }

  function spaceButton(parent) {
    const gz = window.gZenWorkspaces;
    let list = [];
    try {
      list = gz?.getWorkspaces?.() || [];
    } catch (e) {
      list = [];
    }
    if (!list.length) {
      return;
    }
    const current = list.find(s => s.uuid === gz.activeWorkspace) || list[0];
    const btn = h("div", "horizen-space", parent);
    const icon = typeof current.icon === "string" && current.icon.length <= 4 ? current.icon : "";
    btn.textContent = `${icon ? icon + " " : ""}${current.name || ""}`;
    btn.title = "Next space";
    btn.addEventListener("click", () => {
      const next = list[(list.indexOf(current) + 1) % list.length];
      if (next && next !== current) {
        gz.changeWorkspaceWithID(next.uuid);
      }
    });
  }

  function render() {
    frame = 0;
    if (!active || !bar) {
      return;
    }
    const { essentials, pinned, normal } = collectTabs();
    bar.replaceChildren();
    spaceButton(bar);
    for (const tab of essentials) {
      bar.append(tabEl(tab, "essential"));
    }
    if (essentials.length && (pinned.length || normal.length)) {
      divider(bar);
    }
    for (const item of pinned) {
      bar.append(item.folder ? folderEl(item.folder) : tabEl(item.tab, "pinned"));
    }
    if (pinned.length && normal.length) {
      divider(bar);
    }
    for (const tab of normal) {
      bar.append(tabEl(tab, "normal"));
    }
    const add = h("div", "horizen-newtab", bar);
    add.textContent = "+";
    add.title = "New tab";
  }

  function schedule() {
    if (!frame && active) {
      frame = requestAnimationFrame(render);
    }
  }

  function buildStrip() {
    strip = h("div");
    strip.id = "horizen-strip";
    bar = h("div", "horizen-bar", strip);

    strip.addEventListener("click", e => {
      if (e.button !== 0) {
        return;
      }
      if (e.target.closest(".horizen-newtab")) {
        const cmd = document.getElementById("cmd_newNavigatorTab");
        if (cmd) {
          cmd.doCommand();
        } else {
          window.BrowserCommands?.openTab?.();
        }
        return;
      }
      const folder = e.target.closest(".horizen-folder");
      if (folder?.folder) {
        openFolder(folder);
        return;
      }
      const el = e.target.closest(".horizen-tab");
      if (!el?.tab) {
        return;
      }
      if (e.target.closest(".horizen-close")) {
        window.gBrowser.removeTab(el.tab);
      } else {
        window.gBrowser.selectedTab = el.tab;
      }
    });

    strip.addEventListener("auxclick", e => {
      const el = e.target.closest(".horizen-tab");
      if (e.button === 1 && el?.tab && el.dataset.kind === "normal") {
        window.gBrowser.removeTab(el.tab);
      }
    });

    strip.addEventListener("contextmenu", e => {
      const el = e.target.closest(".horizen-tab");
      if (!el?.tab) {
        return;
      }
      e.preventDefault();
      document
        .getElementById("tabContextMenu")
        ?.openPopupAtScreen(e.screenX, e.screenY, true, e);
    });
  }

  function parkWindowButtons() {
    const manager = window.gZenVerticalTabsManager;
    if (!manager?.isWindowsStyledButtons) {
      return;
    }
    const buttons = manager.actualWindowButtons;
    if (buttons && buttons.parentElement !== strip) {
      strip.append(buttons);
    }
  }

  function apply() {
    if (applying) {
      return;
    }
    applying = true;
    try {
      const should = wanted();
      if (should) {
        const wrapper = document.getElementById("zen-appcontent-wrapper");
        if (!wrapper) {
          return;
        }
        if (!strip) {
          buildStrip();
        }
        if (strip.parentElement !== wrapper || wrapper.firstElementChild !== strip) {
          wrapper.prepend(strip);
        }
        root.setAttribute("horizen-layout", "true");
        active = true;
        parkWindowButtons();
        render();
      } else if (active) {
        active = false;
        root.removeAttribute("horizen-layout");
        strip?.remove();
        // Zen puts the window buttons and toolbars back where it keeps them.
        window.gZenVerticalTabsManager?._updateEvent?.();
      }
    } finally {
      applying = false;
    }
  }

  const manager = window.gZenVerticalTabsManager;
  if (manager && !manager._updateEvent.__horizen) {
    const original = manager._updateEvent;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      if (ready && !applying) {
        apply();
      }
      return result;
    };
    wrapped.__horizen = true;
    manager._updateEvent = wrapped;
  }

  new MutationObserver(() => {
    if (ready) {
      apply();
    }
  }).observe(root, {
    attributes: true,
    attributeFilter: ["zen-compact-mode", "zen-single-toolbar", "customizing", "zen-little-window"],
  });

  Services.prefs.addObserver(PREF, apply);

  const TAB_EVENTS = [
    "TabOpen",
    "TabClose",
    "TabMove",
    "TabSelect",
    "TabAttrModified",
    "TabPinned",
    "TabUnpinned",
    "TabHide",
    "TabShow",
    "TabGrouped",
    "TabUngrouped",
  ];
  const ZEN_EVENTS = [
    "ZenWorkspacesUIUpdate",
    "ZenWorkspaceDataChanged",
    "AfterWorkspacesSessionRestore",
    "ZenFolderRenamed",
    "TabGroupCreate",
    "TabGroupRemoved",
    "TabGroupUpdate",
  ];

  function listen() {
    for (const type of TAB_EVENTS) {
      window.gBrowser.tabContainer.addEventListener(type, schedule);
    }
    for (const type of ZEN_EVENTS) {
      window.addEventListener(type, schedule);
    }
  }

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
    listen();
    ready = true;
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
