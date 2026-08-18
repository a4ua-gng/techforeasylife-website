"use strict";

const API_BASE = "/api-proxy";
const SESSION_KEY = "telAdminSession";
const PREVIEW_PREFIX = "/preview";

const DEFAULT_SITE_CONTROL = {
  version: 1,
  updatedAt: null,
  publishedAt: null,
  announcement: {
    enabled: false,
    label: "TEL UPDATE",
    title: "",
    message: "",
    linkText: "",
    linkUrl: "",
    startAt: null,
    endAt: null
  },
  maintenance: {
    enabled: false,
    title: "TEL is getting an update.",
    message: "We’ll be back shortly.",
    eta: "Back shortly"
  },
  careers: {
    applicationEmail: "techforeasylife.operations@gmail.com",
    generalApplicationsOpen: true,
    vacancies: []
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
    finalCta: true
  }
};

const VISUAL_PAGES = [
  ["all", "All"],
  ["index.html", "Home"],
  ["product.html", "Product"],
  ["schools.html", "Schools"],
  ["safety.html", "Safety"],
  ["careers.html", "Careers"],
  ["about.html", "About"],
  ["contact.html", "Contact"]
];

const VISIBILITY_ITEMS = [
  ["hero", "Hero", "Main TEL homepage hero"],
  ["signalStrip", "Principles strip", "Accessible by design / learning through experience strip"],
  ["quickStart", "Start here", "Institution, product and help quick paths"],
  ["mission", "Mission", "TEL mission section"],
  ["flagship", "Mission & flagship", "Flagship and future-build cards"],
  ["pathway", "Choose your path", "Institution and individual pathway"],
  ["safety", "Safety teaser", "SafeFlight learning-system teaser"],
  ["leadership", "Leadership teaser", "Founder-led, team-built section"],
  ["careers", "Careers", "Build-with-us section"],
  ["finalCta", "Final CTA", "Institution proposal call to action"]
];

const VIEW_META = {
  overview: ["CONTROL CENTER", "Mission Control."],
  publish: ["PUBLISH STUDIO", "Preview. Publish. Recover."],
  announcement: ["HOMEPAGE CONTENT", "Announcement control."],
  visibility: ["VISUAL CMS", "Website visual editor."],
  careers: ["CAREERS CONTROL", "Openings & applications."],
  team: ["PEOPLE", "Team administration."],
  history: ["RECOVERY", "Version history."],
  activity: ["AUDIT", "Activity log."],
  deployment: ["OPERATIONS", "Deployment & health."],
  maintenance: ["CRITICAL CONTROL", "Maintenance mode."]
};

const state = {
  token: sessionStorage.getItem(SESSION_KEY) || "",
  published: clone(DEFAULT_SITE_CONTROL),
  draft: clone(DEFAULT_SITE_CONTROL),
  history: [],
  activity: [],
  members: [],
  teamUpdatedAt: null,
  deployment: null,
  visuals: [],
  visualPage: "all",
  visualsDirty: false,
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const el = {
  loginPanel: $("#loginPanel"),
  loginForm: $("#loginForm"),
  password: $("#password"),
  loginStatus: $("#loginStatus"),
  dashboard: $("#dashboard"),
  logout: $("#logout"),
  nav: $("#nav"),
  controlSidebar: $("#controlSidebar"),
  mobileNavToggle: $("#mobileNavToggle"),
  mobileNavClose: $("#mobileNavClose"),
  navBackdrop: $("#navBackdrop"),
  apiDot: $("#apiDot"),
  apiState: $("#apiState"),
  viewEyebrow: $("#viewEyebrow"),
  viewTitle: $("#viewTitle"),
  refreshAll: $("#refreshAll"),
  quickPublish: $("#quickPublish"),
  globalStatus: $("#globalStatus"),
  metricWebsite: $("#metricWebsite"),
  metricWebsiteSub: $("#metricWebsiteSub"),
  metricDraft: $("#metricDraft"),
  metricDraftSub: $("#metricDraftSub"),
  metricAnnouncement: $("#metricAnnouncement"),
  metricAnnouncementSub: $("#metricAnnouncementSub"),
  metricCareers: $("#metricCareers"),
  metricCareersSub: $("#metricCareersSub"),
  metricMaintenance: $("#metricMaintenance"),
  metricMaintenanceSub: $("#metricMaintenanceSub"),
  deployDot: $("#deployDot"),
  deployTitle: $("#deployTitle"),
  deploySub: $("#deploySub"),
  draftChip: $("#draftChip"),
  saveDraft: $("#saveDraft"),
  refreshPreview: $("#refreshPreview"),
  publishDraft: $("#publishDraft"),
  publishStatus: $("#publishStatus"),
  previewFrame: $("#previewFrame"),
  visibilityGrid: $("#visibilityGrid"),
  visualPageFilter: $("#visualPageFilter"),
  reloadVisuals: $("#reloadVisuals"),
  saveVisuals: $("#saveVisuals"),
  visualCount: $("#visualCount"),
  visualStatus: $("#visualStatus"),
  visualEditorGrid: $("#visualEditorGrid"),
  addVacancy: $("#addVacancy"),
  addVacancyInline: $("#addVacancyInline"),
  saveCareers: $("#saveCareers"),
  reviewCareers: $("#reviewCareers"),
  vacancyList: $("#vacancyList"),
  careerStatus: $("#careerStatus"),
  careerOpenRoleCount: $("#careerOpenRoleCount"),
  careerOpenPositionCount: $("#careerOpenPositionCount"),
  careerDepartmentCount: $("#careerDepartmentCount"),
  careerDraftState: $("#careerDraftState"),
  careerPreviewFrame: $("#careerPreviewFrame"),
  reloadTeam: $("#reloadTeam"),
  addMember: $("#addMember"),
  saveTeam: $("#saveTeam"),
  memberCount: $("#memberCount"),
  visibleCount: $("#visibleCount"),
  teamUpdated: $("#teamUpdated"),
  teamStatus: $("#teamStatus"),
  memberList: $("#memberList"),
  memberTemplate: $("#memberTemplate"),
  historyList: $("#historyList"),
  reloadActivity: $("#reloadActivity"),
  activityList: $("#activityList"),
  deploymentConsole: $("#deploymentConsole"),
  reloadDeployment: $("#reloadDeployment"),
  runHealth: $("#runHealth"),
  healthList: $("#healthList"),
  previewMaintenance: $("#previewMaintenance"),
  publishMaintenance: $("#publishMaintenance")
};

const fields = {
  announcementEnabled: $("#announcementEnabled"),
  announcementLabel: $("#announcementLabel"),
  announcementTitle: $("#announcementTitle"),
  announcementMessage: $("#announcementMessage"),
  announcementLinkText: $("#announcementLinkText"),
  announcementLinkUrl: $("#announcementLinkUrl"),
  announcementStartAt: $("#announcementStartAt"),
  announcementEndAt: $("#announcementEndAt"),
  generalApplicationsOpen: $("#generalApplicationsOpen"),
  careerApplicationEmail: $("#careerApplicationEmail"),
  maintenanceEnabled: $("#maintenanceEnabled"),
  maintenanceTitle: $("#maintenanceTitle"),
  maintenanceMessage: $("#maintenanceMessage"),
  maintenanceEta: $("#maintenanceEta")
};

boot();

function boot() {
  renderVisibilityControls();
  bindEvents();
  checkApiHealth();
  if (state.token) {
    showDashboard();
    loadAll();
  }
}

function bindEvents() {
  el.loginForm.addEventListener("submit", login);
  el.logout.addEventListener("click", logout);
  el.mobileNavToggle?.addEventListener("click", openMobileNav);
  el.mobileNavClose?.addEventListener("click", closeMobileNav);
  el.navBackdrop?.addEventListener("click", closeMobileNav);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileNav();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) closeMobileNav();
  }, { passive: true });
  el.refreshAll.addEventListener("click", loadAll);
  el.quickPublish.addEventListener("click", publishDraft);
  el.saveDraft.addEventListener("click", saveDraft);
  el.refreshPreview.addEventListener("click", refreshPreview);
  el.publishDraft.addEventListener("click", publishDraft);
  el.reloadVisuals.addEventListener("click", () => loadVisuals(true));
  el.saveVisuals.addEventListener("click", saveVisuals);
  el.addVacancy.addEventListener("click", addVacancy);
  el.addVacancyInline.addEventListener("click", addVacancy);
  el.saveCareers.addEventListener("click", saveCareerDraft);
  el.reviewCareers.addEventListener("click", reviewCareersForPublish);
  el.visualPageFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-visual-page]");
    if (!button) return;
    state.visualPage = button.dataset.visualPage || "all";
    renderVisualPageFilters();
    renderVisuals();
  });
  el.reloadTeam.addEventListener("click", () => loadTeam(true));
  el.addMember.addEventListener("click", addMember);
  el.saveTeam.addEventListener("click", saveTeam);
  el.reloadActivity.addEventListener("click", () => loadSiteAdmin(true));
  el.reloadDeployment.addEventListener("click", () => loadDeployment(true));
  el.runHealth.addEventListener("click", () => runHealthScan(true));
  el.previewMaintenance.addEventListener("click", () => {
    switchView("publish");
    refreshPreview();
  });
  el.publishMaintenance.addEventListener("click", publishMaintenanceState);

  el.nav.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) {
      switchView(button.dataset.view);
      closeMobileNav();
    }
  });

  $$("[data-jump]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.jump));
  });

  $$(".preview-size").forEach(button => {
    button.addEventListener("click", () => {
      $$(".preview-size").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      el.previewFrame.style.width = button.dataset.width;
    });
  });

  $$(".career-preview-size").forEach(button => {
    button.addEventListener("click", () => {
      $$(".career-preview-size").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      el.careerPreviewFrame.style.width = button.dataset.careerWidth;
    });
  });

  el.previewFrame.addEventListener("load", () => {
    setTimeout(sendPreview, 120);
  });
  el.careerPreviewFrame.addEventListener("load", () => {
    setTimeout(sendPreview, 120);
  });

  Object.values(fields).forEach(field => {
    const eventName = field.type === "checkbox" || field.type === "datetime-local" ? "change" : "input";
    field.addEventListener(eventName, syncDraftFromFields);
  });
}

function openMobileNav() {
  if (!el.controlSidebar || window.innerWidth > 980) return;
  document.body.classList.add("nav-open");
  if (el.navBackdrop) el.navBackdrop.hidden = false;
  el.mobileNavToggle?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => el.mobileNavClose?.focus());
}

function closeMobileNav() {
  document.body.classList.remove("nav-open");
  if (el.navBackdrop) el.navBackdrop.hidden = true;
  el.mobileNavToggle?.setAttribute("aria-expanded", "false");
}

async function login(event) {
  event.preventDefault();
  setStatus(el.loginStatus, "Signing in…");
  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: el.password.value })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.error || `Login failed (${response.status}).`);
    }
    state.token = data.token;
    sessionStorage.setItem(SESSION_KEY, state.token);
    el.password.value = "";
    setStatus(el.loginStatus, "");
    showDashboard();
    await loadAll();
  } catch (error) {
    setStatus(el.loginStatus, error.message || "Login failed.", "error");
  }
}

function showDashboard() {
  el.loginPanel.hidden = true;
  el.dashboard.hidden = false;
  el.logout.hidden = false;
}

function logout() {
  state.token = "";
  sessionStorage.removeItem(SESSION_KEY);
  el.dashboard.hidden = true;
  el.logout.hidden = true;
  el.loginPanel.hidden = false;
  setStatus(el.loginStatus, "Signed out.");
  setTimeout(() => el.password.focus(), 50);
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    const data = await readJson(response);
    const ok = response.ok && data.ok;
    el.apiState.textContent = ok ? `Connected · v${data.workerVersion || "4"}` : "Needs attention";
    el.apiDot.className = ok ? "ok" : "bad";
  } catch {
    el.apiState.textContent = "Offline";
    el.apiDot.className = "bad";
  }
}

async function loadAll() {
  if (!state.token) return;
  setBusy(true);
  setStatus(el.globalStatus, "Refreshing Mission Control…");
  try {
    await Promise.all([loadSiteAdmin(false), loadTeam(false), loadVisuals(false)]);
    await Promise.all([loadDeployment(false), runHealthScan(false)]);
    setStatus(el.globalStatus, "Mission Control is up to date.", "success");
  } catch (error) {
    handleAuthError(error);
    setStatus(el.globalStatus, error.message || "Could not refresh Mission Control.", "error");
  } finally {
    setBusy(false);
  }
}

async function loadSiteAdmin(showMessage = false) {
  const response = await apiFetch("/api/admin/site", { method: "GET" });
  const data = await readJson(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Could not load site controls (${response.status}).`);
  }

  state.published = normalizeSiteControl(data.published);
  state.draft = normalizeSiteControl(data.draft || data.published);
  state.history = Array.isArray(data.history) ? data.history : [];
  state.activity = Array.isArray(data.activity) ? data.activity : [];

  syncFieldsFromDraft();
  renderHistory();
  renderActivity();
  updateMetrics();

  if (showMessage) setStatus(el.globalStatus, "Site controls refreshed.", "success");
}

function syncFieldsFromDraft() {
  const a = state.draft.announcement;
  const m = state.draft.maintenance;
  const c = state.draft.careers;

  fields.announcementEnabled.checked = !!a.enabled;
  fields.announcementLabel.value = a.label || "";
  fields.announcementTitle.value = a.title || "";
  fields.announcementMessage.value = a.message || "";
  fields.announcementLinkText.value = a.linkText || "";
  fields.announcementLinkUrl.value = a.linkUrl || "";
  fields.announcementStartAt.value = toLocalInput(a.startAt);
  fields.announcementEndAt.value = toLocalInput(a.endAt);

  fields.generalApplicationsOpen.checked = c.generalApplicationsOpen !== false;
  fields.careerApplicationEmail.value = c.applicationEmail || DEFAULT_SITE_CONTROL.careers.applicationEmail;

  fields.maintenanceEnabled.checked = !!m.enabled;
  fields.maintenanceTitle.value = m.title || "";
  fields.maintenanceMessage.value = m.message || "";
  fields.maintenanceEta.value = m.eta || "";

  VISIBILITY_ITEMS.forEach(([key]) => {
    const input = el.visibilityGrid.querySelector(`[data-visibility="${key}"]`);
    if (input) input.checked = state.draft.visibility[key] !== false;
  });

  updateAnnouncementPreview();
  renderVacancies();
  updateCareerSummary();
  updateMaintenancePreview();
  updateMetrics();
  sendPreview();
}

function syncDraftFromFields() {
  syncVacanciesFromCards();
  state.draft.announcement = {
    enabled: fields.announcementEnabled.checked,
    label: fields.announcementLabel.value.trim(),
    title: fields.announcementTitle.value.trim(),
    message: fields.announcementMessage.value.trim(),
    linkText: fields.announcementLinkText.value.trim(),
    linkUrl: fields.announcementLinkUrl.value.trim(),
    startAt: fromLocalInput(fields.announcementStartAt.value),
    endAt: fromLocalInput(fields.announcementEndAt.value)
  };

  state.draft.careers = {
    ...state.draft.careers,
    applicationEmail: fields.careerApplicationEmail.value.trim(),
    generalApplicationsOpen: fields.generalApplicationsOpen.checked,
    vacancies: state.draft.careers.vacancies.map((vacancy, index) => ({
      ...vacancy,
      order: index + 1
    }))
  };

  state.draft.maintenance = {
    enabled: fields.maintenanceEnabled.checked,
    title: fields.maintenanceTitle.value.trim(),
    message: fields.maintenanceMessage.value.trim(),
    eta: fields.maintenanceEta.value.trim()
  };

  VISIBILITY_ITEMS.forEach(([key]) => {
    const input = el.visibilityGrid.querySelector(`[data-visibility="${key}"]`);
    if (input) state.draft.visibility[key] = input.checked;
  });

  updateAnnouncementPreview();
  updateCareerSummary();
  updateMaintenancePreview();
  updateMetrics();
  sendPreview();
}

function validateDraft(config) {
  const a = config.announcement;
  if (a.enabled && !a.title.trim()) throw new Error("An enabled announcement needs a headline.");
  if (a.linkText && !a.linkUrl) throw new Error("Add a CTA link or remove the CTA text.");
  if (a.linkUrl && /^(javascript|data|vbscript):/i.test(a.linkUrl)) throw new Error("That announcement link is not allowed.");
  if (a.startAt && a.endAt && Date.parse(a.startAt) >= Date.parse(a.endAt)) {
    throw new Error("Announcement end time must be after the start time.");
  }
  if (config.maintenance.enabled && !config.maintenance.title.trim()) {
    throw new Error("Maintenance mode needs a headline.");
  }
  const c = config.careers;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.applicationEmail || "")) {
    throw new Error("Careers needs a valid application email address.");
  }
  if (!Array.isArray(c.vacancies) || c.vacancies.length > 30) {
    throw new Error("Careers can contain up to 30 vacancies.");
  }
  c.vacancies.forEach((vacancy, index) => {
    const number = index + 1;
    if (!vacancy.role.trim()) throw new Error(`Opening ${number} needs a role title.`);
    if (!vacancy.department.trim()) throw new Error(`Opening ${number} needs a department.`);
    if (!vacancy.description.trim()) throw new Error(`Opening ${number} needs a short description.`);
    if (!Number.isInteger(Number(vacancy.openings)) || Number(vacancy.openings) < 1 || Number(vacancy.openings) > 99) {
      throw new Error(`Opening ${number} needs a vacant-position count from 1 to 99.`);
    }
  });
}

async function saveDraft(options = {}) {
  syncDraftFromFields();
  validateDraft(state.draft);
  if (!options.silent) setStatus(el.publishStatus, "Saving draft…");

  const response = await apiFetch("/api/admin/site/draft", {
    method: "PUT",
    body: JSON.stringify({ config: state.draft })
  });
  const data = await readJson(response);
  if (!response.ok || !data.ok) throw new Error(data.error || `Draft save failed (${response.status}).`);

  state.draft = normalizeSiteControl(data.draft || state.draft);
  state.activity = Array.isArray(data.activity) ? data.activity : state.activity;
  renderActivity();
  updateMetrics();

  if (!options.silent) setStatus(el.publishStatus, "Draft saved.", "success");
  return data;
}

async function publishDraft() {
  if (state.busy) return;
  setBusy(true);
  setStatus(el.publishStatus, "Preparing publish…");
  try {
    syncDraftFromFields();
    validateDraft(state.draft);
    await saveDraft({ silent: true });

    const response = await apiFetch("/api/admin/site/publish", {
      method: "POST",
      body: "{}"
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Publish failed (${response.status}).`);

    state.published = normalizeSiteControl(data.published || state.draft);
    state.draft = clone(state.published);
    state.history = Array.isArray(data.history) ? data.history : state.history;
    state.activity = Array.isArray(data.activity) ? data.activity : state.activity;

    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    setStatus(el.publishStatus, `Published successfully${data.commit ? ` · ${data.commit.slice(0, 7)}` : ""}.`, "success");
    setStatus(el.globalStatus, "Live website controls published.", "success");

    await loadDeployment(false);
  } catch (error) {
    handleAuthError(error);
    setStatus(el.publishStatus, error.message || "Publish failed.", "error");
  } finally {
    setBusy(false);
  }
}

async function publishMaintenanceState() {
  syncDraftFromFields();
  if (state.draft.maintenance.enabled) {
    const confirmed = window.confirm(
      "Publish maintenance mode now? Visitors will see the TEL maintenance screen until you disable it and publish again."
    );
    if (!confirmed) return;
  }
  await publishDraft();
}

function refreshPreview() {
  const base = `${PREVIEW_PREFIX}/?tel-admin-preview=1`;
  el.previewFrame.src = `${base}&v=${Date.now()}`;
}

function sendPreview() {
  [el.previewFrame, el.careerPreviewFrame].forEach(frame => {
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { type: "TEL_ADMIN_PREVIEW", config: state.draft },
        location.origin
      );
      frame.contentWindow.postMessage(
        { type: "TEL_ADMIN_VISUAL_PREVIEW", visuals: state.visuals },
        location.origin
      );
    } catch {}
  });
}

function renderVisibilityControls() {
  el.visibilityGrid.replaceChildren();
  VISIBILITY_ITEMS.forEach(([key, title, description]) => {
    const label = document.createElement("label");
    label.className = "visibility-item";
    label.innerHTML = `
      <div><strong></strong><small></small></div>
      <span class="switch">
        <input type="checkbox" data-visibility="${escapeHtml(key)}" checked>
        <i></i>
      </span>`;
    $("strong", label).textContent = title;
    $("small", label).textContent = description;
    $("input", label).addEventListener("change", syncDraftFromFields);
    el.visibilityGrid.append(label);
  });
}

function addVacancy() {
  const vacancies = state.draft.careers.vacancies;
  if (vacancies.length >= 30) {
    setStatus(el.careerStatus, "A maximum of 30 vacancies can be managed at once.", "error");
    return;
  }
  vacancies.push(normalizeVacancy({
    id: `opening-${Date.now()}`,
    role: "",
    department: "",
    description: "",
    location: "",
    openings: 1,
    active: true
  }, vacancies.length));
  renderVacancies();
  updateCareerSummary();
  updateMetrics();
  sendPreview();
  const lastCard = el.vacancyList.lastElementChild;
  lastCard?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $(".v-role input", lastCard)?.focus(), 220);
  setStatus(el.careerStatus, "New opening added to the draft. Complete its required fields.");
}

function renderVacancies() {
  el.vacancyList.replaceChildren();
  const vacancies = state.draft.careers.vacancies;

  if (!vacancies.length) {
    const empty = document.createElement("div");
    empty.className = "vacancy-empty";
    const title = document.createElement("strong");
    title.textContent = "No specific openings yet.";
    const copy = document.createElement("p");
    copy.textContent = "Add the first role when TEL has a confirmed vacancy. Until then, the public page shows a clean and accurate empty state.";
    const button = document.createElement("button");
    button.className = "btn primary";
    button.type = "button";
    button.textContent = "Add first opening";
    button.addEventListener("click", addVacancy);
    empty.append(title, copy, button);
    el.vacancyList.append(empty);
    return;
  }

  vacancies.forEach((vacancy, index) => {
    const card = document.createElement("article");
    card.className = `panel vacancy-card${vacancy.active === false ? " is-paused" : ""}`;
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="vacancy-top">
        <div class="vacancy-title"><span class="vacancy-number">OPENING // ${String(index + 1).padStart(2, "0")}</span><span class="vacancy-live-label">${vacancy.active === false ? "PAUSED" : "PUBLIC"}</span></div>
        <div class="vacancy-controls">
          <button class="icon v-move-up" type="button" aria-label="Move opening up">↑</button>
          <button class="icon v-move-down" type="button" aria-label="Move opening down">↓</button>
          <button class="icon remove v-remove" type="button">Remove</button>
          <label class="vacancy-toggle">Show publicly<span class="switch"><input class="v-active" type="checkbox" ${vacancy.active !== false ? "checked" : ""}><i></i></span></label>
        </div>
      </div>
      <div class="vacancy-fields">
        <label class="v-role">Role title *<input maxlength="120" placeholder="e.g. Front-end Developer" value="${escapeHtml(vacancy.role)}"></label>
        <label class="v-department">Department *<input maxlength="100" placeholder="e.g. Design & Technology" value="${escapeHtml(vacancy.department)}"></label>
        <label class="v-openings">Vacant positions *<input type="number" min="1" max="99" step="1" value="${vacancy.openings}"></label>
        <label class="v-location">Location / format<input maxlength="100" placeholder="e.g. Remote · Guwahati" value="${escapeHtml(vacancy.location)}"></label>
        <label class="v-description">Short role description *<textarea maxlength="500" rows="4" placeholder="Explain the actual work and what this person will own.">${escapeHtml(vacancy.description)}</textarea></label>
      </div>`;

    const update = () => {
      vacancy.role = $(".v-role input", card).value;
      vacancy.department = $(".v-department input", card).value;
      vacancy.openings = Math.max(1, Math.min(99, Number($(".v-openings input", card).value) || 1));
      vacancy.location = $(".v-location input", card).value;
      vacancy.description = $(".v-description textarea", card).value;
      vacancy.active = $(".v-active", card).checked;
      card.classList.toggle("is-paused", !vacancy.active);
      $(".vacancy-live-label", card).textContent = vacancy.active ? "PUBLIC" : "PAUSED";
      updateCareerSummary();
      updateMetrics();
      sendPreview();
    };

    $$("input, textarea", card).forEach(input => {
      input.addEventListener(input.type === "checkbox" ? "change" : "input", update);
    });
    $(".v-move-up", card).disabled = index === 0;
    $(".v-move-down", card).disabled = index === vacancies.length - 1;
    $(".v-move-up", card).addEventListener("click", () => moveVacancy(index, -1));
    $(".v-move-down", card).addEventListener("click", () => moveVacancy(index, 1));
    $(".v-remove", card).addEventListener("click", () => removeVacancy(index));
    el.vacancyList.append(card);
  });
}

function syncVacanciesFromCards() {
  $$(".vacancy-card", el.vacancyList).forEach((card, index) => {
    const vacancy = state.draft.careers.vacancies[index];
    if (!vacancy) return;
    vacancy.role = $(".v-role input", card).value;
    vacancy.department = $(".v-department input", card).value;
    vacancy.openings = Math.max(1, Math.min(99, Number($(".v-openings input", card).value) || 1));
    vacancy.location = $(".v-location input", card).value;
    vacancy.description = $(".v-description textarea", card).value;
    vacancy.active = $(".v-active", card).checked;
    vacancy.order = index + 1;
  });
}

function moveVacancy(index, delta) {
  syncVacanciesFromCards();
  const vacancies = state.draft.careers.vacancies;
  const target = index + delta;
  if (target < 0 || target >= vacancies.length) return;
  [vacancies[index], vacancies[target]] = [vacancies[target], vacancies[index]];
  vacancies.forEach((vacancy, position) => { vacancy.order = position + 1; });
  renderVacancies();
  updateCareerSummary();
  updateMetrics();
  sendPreview();
}

function removeVacancy(index) {
  syncVacanciesFromCards();
  const vacancy = state.draft.careers.vacancies[index];
  if (!window.confirm(`Remove ${vacancy?.role || "this opening"} from the draft?`)) return;
  state.draft.careers.vacancies.splice(index, 1);
  state.draft.careers.vacancies.forEach((item, position) => { item.order = position + 1; });
  renderVacancies();
  updateCareerSummary();
  updateMetrics();
  sendPreview();
  setStatus(el.careerStatus, "Opening removed from the draft.");
}

function updateCareerSummary() {
  const draftCareers = state.draft.careers;
  const open = draftCareers.vacancies.filter(vacancy => vacancy.active !== false);
  const positions = open.reduce((total, vacancy) => total + (Number(vacancy.openings) || 1), 0);
  const departments = new Set(open.map(vacancy => vacancy.department.trim()).filter(Boolean)).size;
  const careerDirty = !deepEqual(draftCareers, state.published.careers);

  el.careerOpenRoleCount.textContent = String(open.length);
  el.careerOpenPositionCount.textContent = String(positions);
  el.careerDepartmentCount.textContent = String(departments);
  el.careerDraftState.textContent = careerDirty ? "Unpublished career changes" : "Synced with live";
  el.careerDraftState.classList.toggle("dirty", careerDirty);

  const live = state.published.careers.vacancies.filter(vacancy => vacancy.active !== false);
  const livePositions = live.reduce((total, vacancy) => total + (Number(vacancy.openings) || 1), 0);
  el.metricCareers.textContent = `${live.length} open`;
  el.metricCareersSub.textContent = live.length
    ? `${livePositions} vacant position${livePositions === 1 ? "" : "s"} live`
    : state.published.careers.generalApplicationsOpen ? "General applications open" : "Applications paused";
}

async function saveCareerDraft() {
  if (state.busy) return;
  setBusy(true);
  setStatus(el.careerStatus, "Saving career draft…");
  try {
    syncDraftFromFields();
    validateDraft(state.draft);
    await saveDraft({ silent: true });
    syncFieldsFromDraft();
    setStatus(el.careerStatus, "Career draft saved. Review it, then publish when ready.", "success");
  } catch (error) {
    handleAuthError(error);
    setStatus(el.careerStatus, error.message || "Could not save the career draft.", "error");
  } finally {
    setBusy(false);
  }
}

function reviewCareersForPublish() {
  try {
    syncDraftFromFields();
    validateDraft(state.draft);
    el.previewFrame.src = `${PREVIEW_PREFIX}/careers.html?tel-admin-preview=1&v=${Date.now()}`;
    switchView("publish");
    setStatus(el.publishStatus, "Careers preview loaded. Save the draft, then publish when everything looks right.");
    setTimeout(sendPreview, 180);
  } catch (error) {
    setStatus(el.careerStatus, error.message || "Complete the required career fields first.", "error");
  }
}

function updateAnnouncementPreview() {
  const a = state.draft.announcement;
  $("#annMiniLabel").textContent = a.label || "TEL UPDATE";
  $("#annMiniTitle").textContent = a.title || "Your announcement will appear here.";
  $("#annMiniMessage").textContent = a.message || "Preview of the homepage announcement.";
  $("#annMiniLink").textContent = a.linkText ? `${a.linkText} ↗` : "No CTA";

  const status = announcementStatus(a);
  $("#annScheduleState").textContent = status.label;
  $("#annScheduleDetail").textContent = status.detail;
}

function announcementStatus(a) {
  if (!a.enabled) return { label: "Disabled", detail: "The announcement will not appear." };

  const now = Date.now();
  const start = a.startAt ? Date.parse(a.startAt) : NaN;
  const end = a.endAt ? Date.parse(a.endAt) : NaN;

  if (Number.isFinite(start) && now < start) {
    return { label: "Scheduled", detail: `Starts ${new Date(start).toLocaleString()}.` };
  }
  if (Number.isFinite(end) && now >= end) {
    return { label: "Schedule ended", detail: `Ended ${new Date(end).toLocaleString()}.` };
  }
  if (Number.isFinite(end)) {
    return { label: "Active now", detail: `Automatically ends ${new Date(end).toLocaleString()}.` };
  }
  return { label: "Active now", detail: "No automatic end time." };
}

function updateMaintenancePreview() {
  const m = state.draft.maintenance;
  $("#maintenanceToggleTitle").textContent = m.enabled ? "Maintenance is ON in draft" : "Maintenance is OFF";
  $("#maintenanceToggleCopy").textContent = m.enabled
    ? "Publish to put the public site behind the maintenance screen."
    : "The public site is available normally.";
  $("#maintMiniTitle").textContent = m.title || DEFAULT_SITE_CONTROL.maintenance.title;
  $("#maintMiniMessage").textContent = m.message || DEFAULT_SITE_CONTROL.maintenance.message;
  $("#maintMiniEta").textContent = m.eta || DEFAULT_SITE_CONTROL.maintenance.eta;
}

function updateMetrics() {
  const dirty = !deepEqual(stripTimes(state.draft), stripTimes(state.published));
  el.draftChip.textContent = dirty ? "UNPUBLISHED" : "SYNCED";
  el.draftChip.classList.toggle("dirty", dirty);
  el.metricDraft.textContent = dirty ? "Changes" : "Synced";
  el.metricDraftSub.textContent = dirty ? "Draft differs from live site" : "No unpublished edits";

  const ann = announcementStatus(state.published.announcement);
  el.metricAnnouncement.textContent = !state.published.announcement.enabled
    ? "Off"
    : ann.label === "Active now" ? "Live" : "Scheduled";
  el.metricAnnouncementSub.textContent = ann.detail;

  el.metricMaintenance.textContent = state.published.maintenance.enabled ? "ON" : "Off";
  el.metricMaintenanceSub.textContent = state.published.maintenance.enabled
    ? "Public maintenance gate is active"
    : "Public site available";

  updateCareerSummary();
}


async function loadVisuals(showMessage = false) {
  try {
    const response = await fetch(`${API_BASE}/api/site-content`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Could not load website visuals (${response.status}).`);
    }

    state.visuals = Array.isArray(data.data?.visuals)
      ? data.data.visuals.map(normalizeVisual)
      : [];
    state.visualsDirty = false;
    renderVisuals();
    updateVisualStatus();

    if (showMessage) {
      setStatus(el.visualStatus, "Visual configuration reloaded.", "success");
    }
  } catch (error) {
    if (showMessage) setStatus(el.visualStatus, friendlyNetworkError(error, "Could not load visuals."), "error");
    throw error;
  }
}

function normalizeVisual(visual, index = 0) {
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 50;
  return {
    id: String(visual.id || `visual-${index + 1}`),
    name: String(visual.name || `Visual ${index + 1}`),
    page: String(visual.page || "index.html"),
    assetPath: String(visual.assetPath || ""),
    defaultAssetPath: String(visual.defaultAssetPath || visual.assetPath || ""),
    imageSelector: String(visual.imageSelector || ""),
    alt: String(visual.alt || ""),
    note: String(visual.note || ""),
    fit: ["inherit", "contain", "cover", "fill", "none", "scale-down"].includes(visual.fit)
      ? visual.fit
      : "inherit",
    positionX: Math.max(0, Math.min(100, number(visual.positionX))),
    positionY: Math.max(0, Math.min(100, number(visual.positionY))),
    active: visual.active !== false,
    labels: Array.isArray(visual.labels) ? visual.labels : []
  };
}

function renderVisualPageFilters() {
  const counts = Object.create(null);
  state.visuals.forEach(visual => { counts[visual.page] = (counts[visual.page] || 0) + 1; });

  el.visualPageFilter.replaceChildren();
  VISUAL_PAGES.forEach(([page, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `visual-page-tab${state.visualPage === page ? " active" : ""}`;
    button.dataset.visualPage = page;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", state.visualPage === page ? "true" : "false");
    const count = page === "all" ? state.visuals.length : (counts[page] || 0);
    button.innerHTML = `<span>${escapeHtml(label)}</span><b>${count}</b>`;
    el.visualPageFilter.append(button);
  });
}

function renderVisuals() {
  const filter = state.visualPage || "all";
  const visuals = state.visuals.filter(visual => filter === "all" || visual.page === filter);

  renderVisualPageFilters();
  el.visualCount.textContent = String(state.visuals.length);
  el.visualEditorGrid.replaceChildren();

  if (!visuals.length) {
    const pageLabel = VISUAL_PAGES.find(([page]) => page === filter)?.[1] || "This page";
    el.visualEditorGrid.innerHTML = `<div class="visual-empty"><div><strong>${escapeHtml(pageLabel)} has no standalone content pictures to edit.</strong><p>This page is mostly interface, text or shared branding. Choose another page or All to continue editing website visuals.</p></div></div>`;
    return;
  }

  visuals.forEach(visual => {
    const card = document.createElement("article");
    card.className = `visual-card${visual.active === false ? " is-disabled" : ""}`;
    card.dataset.visualId = visual.id;

    const previewPath = visual.assetPath || visual.defaultAssetPath || "";

    card.innerHTML = `
      <div class="visual-preview-column">
        <div class="visual-preview">
          <img alt="">
          <span class="visual-preview-badge">${escapeHtml(VISUAL_PAGES.find(([page]) => page === visual.page)?.[1] || visual.page)}</span>
        </div>
        <label class="visual-upload">
          Replace picture
          <input class="visual-file" type="file" accept="image/jpeg,image/png,image/webp">
        </label>
        <small class="muted visual-upload-status"></small>
      </div>
      <div class="visual-body">
        <div class="visual-title-row">
          <div>
            <strong>${escapeHtml(visual.name)}</strong>
            <small>${escapeHtml(visual.assetPath || "No custom asset")}</small>
          </div>
          <label class="switch" title="Show or hide this picture">
            <input class="visual-active" type="checkbox" ${visual.active !== false ? "checked" : ""}>
            <i></i>
          </label>
        </div>

        <div class="visual-field-grid">
          <label class="full">Alt text
            <input class="visual-alt" maxlength="220" value="${escapeHtml(visual.alt)}">
          </label>
          <label>Image fit
            <select class="visual-fit">
              ${["inherit","contain","cover","fill","none","scale-down"].map(option =>
                `<option value="${option}" ${visual.fit === option ? "selected" : ""}>${option}</option>`
              ).join("")}
            </select>
          </label>
          <label>Page
            <input value="${escapeHtml(visual.page)}" readonly>
          </label>
          <label class="full">Horizontal focus
            <span class="visual-range">
              <input class="visual-x" type="range" min="0" max="100" step="1" value="${visual.positionX}">
              <output>${Math.round(visual.positionX)}%</output>
            </span>
          </label>
          <label class="full">Vertical focus
            <span class="visual-range">
              <input class="visual-y" type="range" min="0" max="100" step="1" value="${visual.positionY}">
              <output>${Math.round(visual.positionY)}%</output>
            </span>
          </label>
        </div>

        <div class="visual-card-actions">
          <button class="btn secondary visual-preview-page" type="button">Preview on page</button>
          <button class="btn secondary visual-reset" type="button">Reset original image</button>
        </div>
        <small class="muted">${escapeHtml(visual.note || visual.imageSelector)}</small>
      </div>`;

    const previewImage = $(".visual-preview img", card);
    updateVisualPreviewImage(previewImage, visual);

    $(".visual-active", card).addEventListener("change", event => {
      visual.active = event.target.checked;
      card.classList.toggle("is-disabled", !visual.active);
      markVisualsDirty();
      sendPreview();
    });

    $(".visual-alt", card).addEventListener("input", event => {
      visual.alt = event.target.value;
      markVisualsDirty();
      sendPreview();
    });

    $(".visual-fit", card).addEventListener("change", event => {
      visual.fit = event.target.value;
      updateVisualPreviewImage(previewImage, visual);
      markVisualsDirty();
      sendPreview();
    });

    const x = $(".visual-x", card);
    const y = $(".visual-y", card);

    x.addEventListener("input", () => {
      visual.positionX = Number(x.value);
      x.nextElementSibling.textContent = `${Math.round(visual.positionX)}%`;
      updateVisualPreviewImage(previewImage, visual);
      markVisualsDirty();
      sendPreview();
    });

    y.addEventListener("input", () => {
      visual.positionY = Number(y.value);
      y.nextElementSibling.textContent = `${Math.round(visual.positionY)}%`;
      updateVisualPreviewImage(previewImage, visual);
      markVisualsDirty();
      sendPreview();
    });

    $(".visual-file", card).addEventListener("change", event => {
      uploadVisualAsset(event, visual, card);
    });

    $(".visual-reset", card).addEventListener("click", () => {
      visual.assetPath = visual.defaultAssetPath || "";
      updateVisualPreviewImage(previewImage, visual);
      $(".visual-title-row small", card).textContent = visual.assetPath || "No asset";
      markVisualsDirty();
      sendPreview();
    });

    $(".visual-preview-page", card).addEventListener("click", () => {
      openVisualPreview(visual);
    });

    el.visualEditorGrid.append(card);
  });
}

function updateVisualPreviewImage(image, visual) {
  const path = visual.assetPath || visual.defaultAssetPath || "";
  if (!path) {
    image.removeAttribute("src");
    return;
  }

  image.src = `${PREVIEW_PREFIX}/${path.replace(/^\/+/, "")}?v=${Date.now()}`;
  image.alt = visual.alt || visual.name;
  image.style.objectFit = visual.fit === "inherit" ? "contain" : visual.fit;
  image.style.objectPosition = `${visual.positionX}% ${visual.positionY}%`;
}

function markVisualsDirty() {
  state.visualsDirty = true;
  updateVisualStatus();
}

function updateVisualStatus() {
  if (!el.visualStatus) return;
  el.visualStatus.textContent = state.visualsDirty
    ? "Unsaved visual changes. Preview them, then click Save visual changes."
    : "Visual configuration is synced with the live website.";
  el.visualStatus.className = `status ${state.visualsDirty ? "visual-dirty" : "visual-clean"}`;
}

async function uploadVisualAsset(event, visual, card) {
  const file = event.target.files?.[0];
  if (!file) return;

  const status = $(".visual-upload-status", card);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    status.textContent = "Use JPG, PNG or WebP.";
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "Image must be 5 MB or smaller.";
    event.target.value = "";
    return;
  }

  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[file.type];

  const path = `site-visuals/${slugify(visual.id)}.${extension}`;
  status.textContent = "Uploading replacement…";

  try {
    const base64 = await fileToBase64(file);
    const response = await apiFetch("/api/site-assets", {
      method: "POST",
      body: JSON.stringify({
        path,
        contentType: file.type,
        base64
      })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Visual upload failed (${response.status}).`);
    }

    visual.assetPath = data.path;
    state.visualsDirty = true;
    $(".visual-title-row small", card).textContent = visual.assetPath;
    updateVisualPreviewImage($(".visual-preview img", card), visual);
    updateVisualStatus();
    sendPreview();
    status.textContent = "Replacement uploaded and staged. Save visual changes to make it live.";
  } catch (error) {
    handleAuthError(error);
    status.textContent = friendlyNetworkError(error, "Visual upload failed.");
  } finally {
    event.target.value = "";
  }
}

async function saveVisuals() {
  if (state.busy) return;
  setBusy(true);
  setStatus(el.visualStatus, "Saving visual configuration…");

  try {
    const response = await apiFetch("/api/site-content", {
      method: "PUT",
      body: JSON.stringify({ visuals: state.visuals })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Visual save failed (${response.status}).`);
    }

    state.visuals = Array.isArray(data.data?.visuals)
      ? data.data.visuals.map(normalizeVisual)
      : state.visuals;
    state.visualsDirty = false;
    renderVisuals();
    updateVisualStatus();
    setStatus(el.globalStatus, "Website visuals saved live.", "success");
    if (Array.isArray(data.activity)) {
      state.activity = data.activity;
      renderActivity();
    }
  } catch (error) {
    handleAuthError(error);
    setStatus(el.visualStatus, friendlyNetworkError(error, "Could not save visuals."), "error");
  } finally {
    setBusy(false);
  }
}

function openVisualPreview(visual) {
  state.visualPage = visual.page;
  const pagePath = visual.page === "index.html" ? "" : visual.page;
  el.previewFrame.src = `${PREVIEW_PREFIX}/${pagePath}?tel-admin-preview=1&v=${Date.now()}`;
  switchView("publish");
  setTimeout(sendPreview, 180);
}

function renderHistory() {
  el.historyList.replaceChildren();

  if (!state.history.length) {
    el.historyList.innerHTML = '<div class="empty">No published history yet.</div>';
    return;
  }

  state.history.forEach(entry => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `<div class="list-info"><strong></strong><small></small></div>`;
    $("strong", item).textContent = entry.label || entry.id || "Snapshot";
    $("small", item).textContent = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown time";

    const button = document.createElement("button");
    button.className = "btn secondary";
    button.textContent = "Restore";
    button.addEventListener("click", () => rollback(entry.id));

    item.append(button);
    el.historyList.append(item);
  });
}

async function rollback(id) {
  if (!id) return;
  if (!window.confirm("Restore this version to the live site? The current live state will be saved first.")) return;

  setBusy(true);
  setStatus(el.globalStatus, "Restoring selected version…");

  try {
    const response = await apiFetch("/api/admin/site/rollback", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Rollback failed (${response.status}).`);

    state.published = normalizeSiteControl(data.published);
    state.draft = clone(state.published);
    state.history = Array.isArray(data.history) ? data.history : state.history;
    state.activity = Array.isArray(data.activity) ? data.activity : state.activity;

    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    setStatus(el.globalStatus, "Previous version restored and published.", "success");
  } catch (error) {
    handleAuthError(error);
    setStatus(el.globalStatus, error.message || "Rollback failed.", "error");
  } finally {
    setBusy(false);
  }
}

function renderActivity() {
  el.activityList.replaceChildren();

  if (!state.activity.length) {
    el.activityList.innerHTML = '<div class="empty">No v4 activity logged yet.</div>';
    return;
  }

  state.activity.forEach(event => {
    const item = document.createElement("div");
    item.className = "activity-item";

    const mark = document.createElement("span");
    mark.className = "activity-mark";
    mark.textContent = activityIcon(event.type);

    const info = document.createElement("div");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    strong.textContent = event.message || event.type || "Admin action";
    small.textContent = `${event.at ? new Date(event.at).toLocaleString() : "Unknown time"}${event.commit ? ` · ${event.commit.slice(0, 7)}` : ""}`;

    info.append(strong, small);
    item.append(mark, info);
    el.activityList.append(item);
  });
}

function activityIcon(type = "") {
  if (/rollback/i.test(type)) return "↶";
  if (/publish/i.test(type)) return "↑";
  if (/team/i.test(type)) return "T";
  if (/image/i.test(type)) return "▧";
  if (/career/i.test(type)) return "C";
  if (/draft/i.test(type)) return "D";
  return "·";
}

async function loadDeployment(showMessage = false) {
  const response = await apiFetch("/api/admin/deployment", { method: "GET" });
  const data = await readJson(response);
  if (!response.ok || !data.ok) throw new Error(data.error || `Deployment lookup failed (${response.status}).`);

  state.deployment = data;
  renderDeployment(data);
  if (showMessage) setStatus(el.globalStatus, "Deployment status refreshed.", "success");
}

function renderDeployment(data) {
  const commit = data.commit || {};
  el.deploymentConsole.replaceChildren();

  [
    `> repository ${data.repository || "TEL website"}`,
    `> branch ${data.branch || "main"}`,
    `> head ${commit.sha ? commit.sha.slice(0, 12) : "unknown"}`,
    `> message ${commit.message || "No commit message available"}`,
    `> committed ${commit.date ? new Date(commit.date).toLocaleString() : "unknown"}`,
    `> admin API v${data.apiVersion || "4"}`
  ].forEach(addConsoleLine);

  el.deployDot.className = "ok";
  el.deployTitle.textContent = commit.sha ? `HEAD ${commit.sha.slice(0, 7)}` : "Repository connected";
  el.deploySub.textContent = commit.message || "Latest branch state loaded";
}

function addConsoleLine(text) {
  const p = document.createElement("p");
  p.textContent = text;
  el.deploymentConsole.append(p);
}

async function runHealthScan(showMessage = false) {
  const checks = [
    ["Homepage", "/preview/"],
    ["Product", "/preview/product.html"],
    ["Schools", "/preview/schools.html"],
    ["Safety", "/preview/safety.html"],
    ["Careers", "/preview/careers.html"],
    ["About", "/preview/about.html"],
    ["Contact", "/preview/contact.html"],
    ["Site controls", "/preview/data/site-control.json"],
    ["TEL logo", "/preview/tel-logo.webp"]
  ];

  el.healthList.innerHTML = '<div class="empty">Scanning public files…</div>';

  const results = await Promise.all(checks.map(async ([name, url]) => {
    const start = performance.now();
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}health=${Date.now()}`, { cache: "no-store" });
      return { name, ok: response.ok, status: response.status, ms: Math.round(performance.now() - start) };
    } catch {
      return { name, ok: false, status: 0, ms: Math.round(performance.now() - start) };
    }
  }));

  const apiStart = performance.now();
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    results.push({ name: "Admin API", ok: response.ok, status: response.status, ms: Math.round(performance.now() - apiStart) });
  } catch {
    results.push({ name: "Admin API", ok: false, status: 0, ms: Math.round(performance.now() - apiStart) });
  }

  renderHealth(results);

  const failed = results.filter(item => !item.ok).length;
  el.metricWebsite.textContent = failed ? `${failed} issue${failed === 1 ? "" : "s"}` : "Healthy";
  el.metricWebsiteSub.textContent = failed ? "Open Deployment for failed checks" : `${results.length} checks passed`;

  if (showMessage) {
    setStatus(
      el.globalStatus,
      failed ? `Health scan finished with ${failed} failed check${failed === 1 ? "" : "s"}.` : "All website health checks passed.",
      failed ? "error" : "success"
    );
  }

  return results;
}

function renderHealth(results) {
  el.healthList.replaceChildren();

  results.forEach(result => {
    const item = document.createElement("div");
    item.className = "list-item health";

    const dot = document.createElement("i");
    dot.className = result.ok ? "ok" : "bad";

    const info = document.createElement("div");
    info.className = "list-info";
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    strong.textContent = result.name;
    small.textContent = result.status ? `HTTP ${result.status}` : "Request failed";
    info.append(strong, small);

    const ms = document.createElement("b");
    ms.textContent = `${result.ms} ms`;

    item.append(dot, info, ms);
    el.healthList.append(item);
  });
}

async function loadTeam(showMessage = false) {
  const response = await fetch(`${API_BASE}/api/team`, { cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok || !data.ok) throw new Error(data.error || `Could not load team (${response.status}).`);

  state.members = Array.isArray(data.data?.members)
    ? data.data.members.map(normalizeMember)
    : [];
  state.teamUpdatedAt = data.data?.updatedAt || null;

  renderMembers();
  if (showMessage) setStatus(el.teamStatus, "Team data loaded.", "success");
}

function addMember() {
  state.members.push({
    id: `new-member-${Date.now()}`,
    name: "",
    role: "",
    quote: "",
    label: "",
    image: "",
    alt: "",
    section: "team",
    order: state.members.length + 1,
    active: true
  });
  renderMembers();
  el.memberList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderMembers() {
  el.memberList.replaceChildren();

  state.members.forEach((member, index) => {
    const card = el.memberTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.index = String(index);
    $(".member-number", card).textContent = `${member.section === "leadership" ? "LEADERSHIP" : "TEAM"} // ${String(index + 1).padStart(2, "0")}`;

    const map = {
      name: $(".f-name", card),
      role: $(".f-role", card),
      section: $(".f-section", card),
      order: $(".f-order", card),
      label: $(".f-label", card),
      quote: $(".f-quote", card),
      image: $(".f-image", card),
      alt: $(".f-alt", card),
      active: $(".f-active", card)
    };

    map.name.value = member.name;
    map.role.value = member.role;
    map.section.value = member.section;
    map.order.value = member.order;
    map.label.value = member.label;
    map.quote.value = member.quote;
    map.image.value = member.image;
    map.alt.value = member.alt;
    map.active.checked = member.active !== false;

    Object.entries(map).forEach(([key, input]) => {
      const eventName = key === "active" || key === "section" ? "change" : "input";
      input.addEventListener(eventName, () => {
        member[key] = key === "active"
          ? input.checked
          : key === "order"
            ? Number(input.value) || index + 1
            : input.value;

        if (key === "image") updatePhoto(card, member.image, member.alt || member.name);
        updateTeamSummary();
      });
    });

    $(".move-up", card).disabled = index === 0;
    $(".move-down", card).disabled = index === state.members.length - 1;
    $(".move-up", card).addEventListener("click", event => { event.preventDefault(); moveMember(index, -1); });
    $(".move-down", card).addEventListener("click", event => { event.preventDefault(); moveMember(index, 1); });
    $(".remove", card).addEventListener("click", event => { event.preventDefault(); removeMember(index); });
    $(".image-file", card).addEventListener("change", event => uploadImage(event, member, card));

    updatePhoto(card, member.image, member.alt || member.name);
    el.memberList.append(card);
  });

  updateTeamSummary();
}

function moveMember(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.members.length) return;
  [state.members[index], state.members[target]] = [state.members[target], state.members[index]];
  state.members.forEach((member, i) => member.order = i + 1);
  renderMembers();
}

function removeMember(index) {
  const member = state.members[index];
  if (!window.confirm(`Remove ${member.name || "this member"} from the dashboard?`)) return;
  state.members.splice(index, 1);
  state.members.forEach((item, i) => item.order = i + 1);
  renderMembers();
}

async function uploadImage(event, member, card) {
  const file = event.target.files?.[0];
  if (!file) return;

  const status = $(".upload-status", card);
  const memberId = slugify(member.name || member.id || "team-member");

  if (!memberId || memberId.length < 2) {
    status.textContent = "Enter the member’s name before uploading.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "Image must be 5 MB or smaller.";
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    status.textContent = "Use JPG, PNG or WebP.";
    return;
  }

  status.textContent = "Uploading…";

  try {
    const base64 = await fileToBase64(file);
    const response = await apiFetch("/api/images", {
      method: "POST",
      body: JSON.stringify({ memberId, contentType: file.type, base64 })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Upload failed (${response.status}).`);

    member.id = memberId;
    member.image = data.path;
    $(".f-image", card).value = data.path;
    updatePhoto(card, data.path, member.alt || member.name);
    status.textContent = "Photo uploaded. Save the team next.";
  } catch (error) {
    handleAuthError(error);
    status.textContent = error.message || "Upload failed.";
  } finally {
    event.target.value = "";
  }
}

function updatePhoto(card, path, alt) {
  const img = $(".photo img", card);
  const placeholder = $(".photo span", card);

  if (!path) {
    img.hidden = true;
    img.removeAttribute("src");
    placeholder.hidden = false;
    placeholder.textContent = "No photo";
    return;
  }

  img.src = `${PREVIEW_PREFIX}/${String(path).replace(/^\/+/, "")}?v=${Date.now()}`;
  img.alt = alt || "Team member";
  img.hidden = false;
  placeholder.hidden = true;

  img.onerror = () => {
    img.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = "Photo not found";
  };
}

async function saveTeam() {
  syncMembersFromCards();

  const invalid = state.members.find(member => !member.name.trim() || !member.role.trim());
  if (invalid) {
    setStatus(el.teamStatus, "Every member needs a name and role.", "error");
    return;
  }

  setBusy(true);
  setStatus(el.teamStatus, "Saving team…");

  try {
    const members = state.members.map((member, index) => ({
      ...member,
      id: slugify(member.id || member.name),
      name: member.name.trim(),
      role: member.role.trim(),
      quote: member.quote.trim(),
      label: member.label.trim(),
      image: member.image.trim(),
      alt: member.alt.trim() || `${member.name.trim()}, ${member.role.trim()}`,
      section: member.section === "leadership" ? "leadership" : "team",
      order: index + 1,
      active: member.active !== false
    }));

    const response = await apiFetch("/api/team", {
      method: "PUT",
      body: JSON.stringify({ members })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Save failed (${response.status}).`);

    state.members = data.data.members.map(normalizeMember);
    state.teamUpdatedAt = data.data.updatedAt;
    renderMembers();
    setStatus(el.teamStatus, "Team saved successfully.", "success");

    await loadSiteAdmin(false);
  } catch (error) {
    handleAuthError(error);
    setStatus(el.teamStatus, error.message || "Could not save team.", "error");
  } finally {
    setBusy(false);
  }
}

function syncMembersFromCards() {
  $$(".member-card", el.memberList).forEach((card, index) => {
    const member = state.members[index];
    member.name = $(".f-name", card).value;
    member.role = $(".f-role", card).value;
    member.section = $(".f-section", card).value;
    member.order = Number($(".f-order", card).value) || index + 1;
    member.label = $(".f-label", card).value;
    member.quote = $(".f-quote", card).value;
    member.image = $(".f-image", card).value;
    member.alt = $(".f-alt", card).value;
    member.active = $(".f-active", card).checked;
  });
}

function updateTeamSummary() {
  el.memberCount.textContent = String(state.members.length);
  el.visibleCount.textContent = String(state.members.filter(member => member.active !== false).length);
  el.teamUpdated.textContent = state.teamUpdatedAt
    ? `Last saved ${new Date(state.teamUpdatedAt).toLocaleString()}`
    : "Not saved yet";
}

function switchView(view) {
  if (!VIEW_META[view]) return;

  $$(".nav", el.nav).forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $$("[data-panel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.panel === view);
  });

  el.viewEyebrow.textContent = VIEW_META[view][0];
  el.viewTitle.textContent = VIEW_META[view][1];

  if (view === "publish" || view === "careers") setTimeout(sendPreview, 100);
  if (view === "deployment") {
    loadDeployment(false).catch(error => setStatus(el.globalStatus, error.message, "error"));
    runHealthScan(false);
  }
}

function setBusy(value) {
  state.busy = value;
  document.body.classList.toggle("busy", value);
  [
    el.refreshAll,
    el.quickPublish,
    el.saveDraft,
    el.publishDraft,
    el.saveVisuals,
    el.addVacancy,
    el.addVacancyInline,
    el.saveCareers,
    el.reviewCareers,
    el.saveTeam
  ].forEach(button => {
    if (button) button.disabled = value;
  });
}

function setStatus(node, message, type = "") {
  if (!node) return;
  node.textContent = message || "";
  node.className = `status${node === el.globalStatus ? " global" : ""}${type ? ` ${type}` : ""}`;
}

function friendlyNetworkError(error, fallback) {
  const message = String(error?.message || "").trim();
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Connection to the TEL Admin API was interrupted. Retry once; if it persists, refresh Mission Control.";
  }
  return message || fallback;
}

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {})
    }
  });
}

function handleAuthError(error) {
  if (/authentication|session|expired|unauthorized/i.test(error?.message || "")) logout();
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: text || "The server returned an invalid response." };
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function normalizeMember(member, index = 0) {
  return {
    id: String(member.id || slugify(member.name || `member-${index + 1}`)),
    name: String(member.name || ""),
    role: String(member.role || ""),
    quote: String(member.quote || ""),
    label: String(member.label || ""),
    image: String(member.image || ""),
    alt: String(member.alt || ""),
    section: member.section === "leadership" ? "leadership" : "team",
    order: Number(member.order) || index + 1,
    active: member.active !== false
  };
}

function normalizeVacancy(vacancy, index = 0) {
  const source = vacancy && typeof vacancy === "object" ? vacancy : {};
  const openings = Math.max(1, Math.min(99, Number.parseInt(source.openings, 10) || 1));
  return {
    id: String(source.id || slugify(source.role || `opening-${index + 1}`)),
    role: String(source.role || ""),
    department: String(source.department || ""),
    description: String(source.description || ""),
    location: String(source.location || ""),
    openings,
    active: source.active !== false,
    order: Number(source.order) || index + 1
  };
}

function normalizeSiteControl(input) {
  const source = input && typeof input === "object" ? input : {};
  const careers = { ...DEFAULT_SITE_CONTROL.careers, ...(source.careers || {}) };
  careers.generalApplicationsOpen = careers.generalApplicationsOpen !== false;
  careers.vacancies = Array.isArray(careers.vacancies)
    ? careers.vacancies.map(normalizeVacancy).sort((a, b) => a.order - b.order)
    : [];
  return {
    ...clone(DEFAULT_SITE_CONTROL),
    ...source,
    announcement: { ...DEFAULT_SITE_CONTROL.announcement, ...(source.announcement || {}) },
    maintenance: { ...DEFAULT_SITE_CONTROL.maintenance, ...(source.maintenance || {}) },
    careers,
    visibility: { ...DEFAULT_SITE_CONTROL.visibility, ...(source.visibility || {}) }
  };
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripTimes(value) {
  const copy = clone(value);
  delete copy.updatedAt;
  delete copy.publishedAt;
  return copy;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
