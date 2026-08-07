"use strict";

(() => {
  const CONFIG_URL = "data/site-content.json";
  const PREVIEW_PARAM = "tel-admin-preview";
  const isAdminPreview = new URLSearchParams(location.search).get(PREVIEW_PARAM) === "1";
  let currentDocument = { version: 2, updatedAt: null, visuals: [] };

  window.addEventListener("message", handlePreviewMessage);
  loadPublishedVisuals();

  async function loadPublishedVisuals() {
    try {
      const response = await fetch(`${CONFIG_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Visual config request failed (${response.status}).`);
      const data = await response.json();
      applyDocument(normalizeDocument(data));
    } catch (error) {
      console.warn("TEL visual configuration could not be loaded; keeping original website images.", error);
    }
  }

  function handlePreviewMessage(event) {
    if (!isAdminPreview || event.origin !== location.origin) return;
    if (!event.data || event.data.type !== "TEL_ADMIN_VISUAL_PREVIEW") return;
    applyDocument(normalizeDocument({ version: 2, updatedAt: null, visuals: event.data.visuals || [] }));
  }

  function normalizeDocument(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      version: 2,
      updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
      visuals: Array.isArray(source.visuals) ? source.visuals : [],
    };
  }

  function currentPageFile() {
    const path = location.pathname.split("/").filter(Boolean).pop() || "index.html";
    return path.includes(".") ? path : "index.html";
  }

  function applyDocument(documentData) {
    currentDocument = documentData;
    const page = currentPageFile();
    documentData.visuals
      .filter((visual) => visual && visual.page === page && visual.imageSelector)
      .forEach(applyVisual);
  }

  function applyVisual(visual) {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll(visual.imageSelector)];
    } catch {
      return;
    }

    nodes.forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return;

      node.hidden = visual.active === false;
      if (visual.active === false) return;

      if (visual.assetPath && isSafeRelativeAsset(visual.assetPath)) {
        node.src = visual.assetPath;
        const galleryButton = node.closest("[data-gallery]");
        if (galleryButton) galleryButton.dataset.gallery = visual.assetPath;
      }

      if (typeof visual.alt === "string") node.alt = visual.alt;

      const fit = ["inherit", "contain", "cover", "fill", "none", "scale-down"].includes(visual.fit)
        ? visual.fit
        : "inherit";
      node.style.objectFit = fit === "inherit" ? "" : fit;

      const x = clampNumber(visual.positionX, 50, 0, 100);
      const y = clampNumber(visual.positionY, 50, 0, 100);
      node.style.objectPosition = `${x}% ${y}%`;
    });

    if (Array.isArray(visual.labels)) {
      visual.labels.forEach((label) => {
        if (!label || label.active === false || !label.selector) return;
        try {
          document.querySelectorAll(label.selector).forEach((element) => {
            element.textContent = typeof label.value === "string" ? label.value : "";
          });
        } catch {
          // Invalid preview selector. Ignore it rather than breaking the public site.
        }
      });
    }
  }

  function isSafeRelativeAsset(value) {
    const path = String(value || "").trim();
    if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/") || path.startsWith(".")) return false;
    if (/^[a-z]+:/i.test(path) || path.startsWith("//") || /[?#\u0000]/.test(path)) return false;
    return /\.(?:jpe?g|png|webp|avif)$/i.test(path);
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  window.TELVisualContent = {
    get document() {
      return currentDocument;
    },
    applyPreview(visuals) {
      if (isAdminPreview) applyDocument(normalizeDocument({ visuals }));
    },
  };
})();
