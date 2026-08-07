"use strict";

(() => {
  const CONFIG_URL = "data/site-control.json";
  const PREVIEW_PARAM = "tel-admin-preview";
  const DEFAULTS = {
    version: 1,
    updatedAt: null,
    announcement: {
      enabled: false,
      label: "TEL UPDATE",
      title: "",
      message: "",
      linkText: "",
      linkUrl: "",
      startAt: null,
      endAt: null,
    },
    maintenance: {
      enabled: false,
      title: "TEL is getting an update.",
      message: "We’ll be back shortly.",
      eta: "Back shortly",
    },
    visibility: {
      hero: true,
      signalStrip: true,
      quickStart: true,
      mission: true,
      flagship: true,
      pathway: true,
      safety: true,
      leadership: true,
      careers: true,
      finalCta: true,
    },
  };

  const isAdminPreview = new URLSearchParams(location.search).get(PREVIEW_PARAM) === "1";
  let currentConfig = null;

  loadStyles();
  window.addEventListener("message", handlePreviewMessage);
  loadPublishedConfig();

  async function loadPublishedConfig() {
    try {
      const response = await fetch(`${CONFIG_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Config request failed (${response.status}).`);
      const data = await response.json();
      applyConfig(mergeConfig(data));
    } catch (error) {
      console.warn("TEL site controls could not be loaded; keeping normal frontend.", error);
      applyConfig(mergeConfig(DEFAULTS));
    }
  }

  function handlePreviewMessage(event) {
    if (!isAdminPreview || event.origin !== location.origin) return;
    if (!event.data || event.data.type !== "TEL_ADMIN_PREVIEW" || !event.data.config) return;
    applyConfig(mergeConfig(event.data.config));
  }

  function mergeConfig(input) {
    const safe = input && typeof input === "object" ? input : {};
    return {
      ...DEFAULTS,
      ...safe,
      announcement: { ...DEFAULTS.announcement, ...(safe.announcement || {}) },
      maintenance: { ...DEFAULTS.maintenance, ...(safe.maintenance || {}) },
      visibility: { ...DEFAULTS.visibility, ...(safe.visibility || {}) },
    };
  }

  function applyConfig(config) {
    currentConfig = config;
    applyVisibility(config.visibility);
    applyAnnouncement(config.announcement);
    applyMaintenance(config.maintenance);
  }

  function applyVisibility(visibility) {
    if (document.body.dataset.page !== "home") return;
    const sections = getHomeSections();
    Object.entries(sections).forEach(([key, element]) => {
      if (!element) return;
      element.classList.toggle("tel-admin-hidden", visibility[key] === false);
    });
  }

  function getHomeSections() {
    const allSections = [...document.querySelectorAll("main > section")];
    return {
      hero: document.querySelector(".home-hero"),
      signalStrip: document.querySelector(".signal-strip"),
      quickStart: document.querySelector(".quick-start"),
      mission: allSections.find((section) => section.classList.contains("split-section")) || null,
      flagship: document.querySelector(".project-grid")?.closest("section") || null,
      pathway: document.querySelector(".pathway")?.closest("section") || null,
      safety: document.querySelector(".safety-teaser"),
      leadership: document.querySelector(".team-teaser"),
      careers: document.querySelector(".home-discover-grid"),
      finalCta: document.querySelector("main > .final-cta"),
    };
  }

  function applyAnnouncement(announcement) {
    document.querySelector(".tel-announcement-wrap")?.remove();
    if (document.body.dataset.page !== "home") return;
    if (!announcementIsActive(announcement)) return;

    const wrap = document.createElement("section");
    wrap.className = "tel-announcement-wrap reveal visible";
    wrap.setAttribute("aria-label", "TEL announcement");

    const panel = document.createElement("div");
    panel.className = "tel-announcement";

    const copy = document.createElement("div");
    copy.className = "tel-announcement-copy";

    const label = document.createElement("span");
    label.className = "tel-announcement-label";
    label.textContent = announcement.label || "TEL UPDATE";

    const title = document.createElement("h2");
    title.textContent = announcement.title || "TEL update";

    const message = document.createElement("p");
    message.textContent = announcement.message || "";

    copy.append(label, title);
    if (announcement.message) copy.append(message);
    panel.append(copy);

    if (announcement.linkText && isSafePublicUrl(announcement.linkUrl)) {
      const link = document.createElement("a");
      link.className = "tel-announcement-link";
      link.href = announcement.linkUrl;
      link.textContent = `${announcement.linkText} ↗`;
      panel.append(link);
    }

    wrap.append(panel);
    const signal = document.querySelector(".signal-strip");
    if (signal) signal.insertAdjacentElement("afterend", wrap);
    else document.querySelector("main")?.prepend(wrap);
  }

  function announcementIsActive(announcement) {
    if (!announcement.enabled) return false;
    const now = Date.now();
    const start = announcement.startAt ? Date.parse(announcement.startAt) : NaN;
    const end = announcement.endAt ? Date.parse(announcement.endAt) : NaN;
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now >= end) return false;
    return true;
  }

  function applyMaintenance(maintenance) {
    document.querySelector(".tel-maintenance-gate")?.remove();
    document.documentElement.style.overflow = "";
    if (!maintenance.enabled || isAdminPreview) return;

    const gate = document.createElement("div");
    gate.className = "tel-maintenance-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-label", "TEL maintenance notice");

    const card = document.createElement("div");
    card.className = "tel-maintenance-card";
    const logo = document.createElement("img");
    logo.src = "tel-logo.webp";
    logo.alt = "TEL — Tech for Easy Life";
    const eyebrow = document.createElement("span");
    eyebrow.textContent = "MAINTENANCE MODE";
    const title = document.createElement("h1");
    title.textContent = maintenance.title || DEFAULTS.maintenance.title;
    const message = document.createElement("p");
    message.textContent = maintenance.message || DEFAULTS.maintenance.message;
    const eta = document.createElement("small");
    eta.textContent = maintenance.eta || DEFAULTS.maintenance.eta;
    card.append(logo, eyebrow, title, message, eta);
    gate.append(card);
    document.body.append(gate);
    document.documentElement.style.overflow = "hidden";
  }

  function isSafePublicUrl(value) {
    if (!value) return false;
    const trimmed = String(value).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
    return true;
  }

  function loadStyles() {
    if (document.querySelector('link[href="site-control-v4.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "site-control-v4.css";
    document.head.append(link);
  }

  window.TELSiteControl = {
    get config() { return currentConfig; },
    applyPreview(config) { if (isAdminPreview) applyConfig(mergeConfig(config)); },
  };
})();
