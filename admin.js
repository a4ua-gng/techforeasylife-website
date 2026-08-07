"use strict";

const API_BASE = "https://tel-website-admin-api.xtremedivyangshu.workers.dev";
const SESSION_KEY = "telAdminSession";

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

const VISIBILITY_ITEMS = [
  ["hero", "Hero", "Main TEL Model Rocket Kit hero section"],
  ["signalStrip", "Principles strip", "Accessible by design / learning through experience strip"],
  ["quickStart", "Start here", "Institution, product and help quick paths"],
  ["mission", "Mission", "Technology should feel like an invitation section"],
  ["flagship", "Mission & flagship", "Current flagship and future build cards"],
  ["pathway", "Choose your path", "Institution and individual pathway panel"],
  ["safety", "Safety teaser", "SAFEFLIGHT learning system teaser"],
  ["leadership", "Leadership teaser", "Founder-led, team-built section"],
  ["careers", "Careers", "Build with us card"],
  ["finalCta", "Final CTA", "Institution proposal call to action"],
];

const VIEW_META = {
  overview: ["CONTROL CENTER", "Mission Control."],
  publish: ["PUBLISH STUDIO", "Preview. Publish. Recover."],
  announcement: ["HOMEPAGE CONTENT", "Announcement control."],
  visibility: ["HOMEPAGE CONTENT", "Visibility control."],
  team: ["PEOPLE", "Team administration."],
  history: ["RECOVERY", "Version history."],
  activity: ["AUDIT", "Activity log."],
  deployment: ["OPERATIONS", "Deployment & health."],
  maintenance: ["CRITICAL CONTROL", "Maintenance mode."],
};

const state = {
  token: sessionStorage.getItem(SESSION_KEY) || "",
  members: [],
  teamUpdatedAt: null,
  published: clone(DEFAULT_SITE_CONTROL),
  draft: clone(DEFAULT_SITE_CONTROL),
  history: [],
  activity: [],
  draftDirty: false,
  busy: false,
  backendV4: true,
  deployment: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  loginPanel: $("#loginPanel"),
  loginForm: $("#loginForm"),
  passwordInput: $("#passwordInput"),
  loginStatus: $("#loginStatus"),
  dashboard: $("#dashboard"),
  dashboardStatus: $("#dashboardStatus"),
  logoutButton: $("#logoutButton"),
  apiStatus: $("#apiStatus"),
  viewEyebrow: $("#viewEyebrow"),
  viewTitle: $("#viewTitle"),
  adminNav: $("#adminNav"),
  refreshAllButton: $("#refreshAllButton"),
  quickPublishButton: $("#quickPublishButton"),
  metricWebsite: $("#metricWebsite"),
  metricWebsiteSub: $("#metricWebsiteSub"),
  metricDraft: $("#metricDraft"),
  metricDraftSub: $("#metricDraftSub"),
  metricAnnouncement: $("#metricAnnouncement"),
  metricAnnouncementSub: $("#metricAnnouncementSub"),
  metricMaintenance: $("#metricMaintenance"),
  metricMaintenanceSub: $("#metricMaintenanceSub"),
  overviewDeployOrb: $("#overviewDeployOrb"),
  overviewDeployTitle: $("#overviewDeployTitle"),
  overviewDeploySub: $("#overviewDeploySub"),
  draftChip: $("#draftChip"),
  saveDraftButton: $("#saveDraftButton"),
  previewButton: $("#previewButton"),
  publishButton: $("#publishButton"),
  publishStatus: $("#publishStatus"),
  previewFrame: $("#previewFrame"),
  previewStage: $("#previewStage"),
  visibilityGrid: $("#visibilityGrid"),
  historyList: $("#historyList"),
  activityList: $("#activityList"),
  refreshActivityButton: $("#refreshActivityButton"),
  deploymentConsole: $("#deploymentConsole"),
  healthList: $("#healthList"),
  refreshDeploymentButton: $("#refreshDeploymentButton"),
  runHealthButton: $("#runHealthButton"),
  memberList: $("#memberList"),
  memberTemplate: $("#memberTemplate"),
  memberCount: $("#memberCount"),
  visibleCount: $("#visibleCount"),
  lastUpdated: $("#lastUpdated"),
  addMemberButton: $("#addMemberButton"),
  saveTeamButton: $("#saveTeamButton"),
  refreshTeamButton: $("#refreshTeamButton"),
  teamStatus: $("#teamStatus"),
};

const siteFields = {
  announcementEnabled: $("#announcementEnabled"),
  announcementLabel: $("#announcementLabel"),
  announcementTitle: $("#announcementTitle"),
  announcementMessage: $("#announcementMessage"),
  announcementLinkText: $("#announcementLinkText"),
  announcementLinkUrl: $("#announcementLinkUrl"),
  announcementStartAt: $("#announcementStartAt"),
  announcementEndAt: $("#announcementEndAt"),
  maintenanceEnabled: $("#maintenanceEnabled"),
  maintenanceTitle: $("#maintenanceTitle"),
  maintenanceMessage: $("#maintenanceMessage"),
  maintenanceEta: $("#maintenanceEta"),
};

bindEvents();
renderVisibilityControls();
checkApiHealth();
if (state.token) {
  showDashboard();
  loadAll();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", logout);
  elements.refreshAllButton.addEventListener("click", loadAll);
  elements.quickPublishButton.addEventListener("click", publishDraft);
  elements.saveDraftButton.addEventListener("click", saveDraft);
  elements.previewButton.addEventListener("click", sendPreview);
  elements.publishButton.addEventListener("click", publishDraft);
  elements.addMemberButton.addEventListener("click", addMember);
  elements.saveTeamButton.addEventListener("click", saveTeam);
  elements.refreshTeamButton.addEventListener("click", loadTeam);
  elements.refreshActivityButton.addEventListener("click", loadSiteAdminData);
  elements.refreshDeploymentButton.addEventListener("click", loadDeployment);
  elements.runHealthButton.addEventListener("click", runHealthScan);
  $("#maintenancePreviewButton").addEventListener("click", () => { switchView("publish"); sendPreview(); });
  $("#maintenancePublishButton").addEventListener("click", publishMaintenanceState);

  elements.adminNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) switchView(button.dataset.view);
  });
  $$('[data-jump]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
  $$(".preview-size").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".preview-size").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      elements.previewFrame.style.width = button.dataset.previewWidth;
    });
  });
  elements.previewFrame.addEventListener("load", sendPreview);

  Object.values(siteFields).forEach((field) => {
    const eventName = field.type === "checkbox" || field.type === "datetime-local" ? "change" : "input";
    field.addEventListener(eventName, syncDraftFromFields);
  });
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginStatus("Signing in…");
  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: elements.passwordInput.value }),
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok || !data.token) throw new Error(data.error || `Login failed (${response.status}).`);
    state.token = data.token;
    sessionStorage.setItem(SESSION_KEY, state.token);
    elements.passwordInput.value = "";
    setLoginStatus("");
    showDashboard();
    await loadAll();
  } catch (error) {
    setLoginStatus(error.message || "Login failed.", "error");
  }
}

function showDashboard() {
  elements.loginPanel.hidden = true;
  elements.dashboard.hidden = false;
  elements.logoutButton.hidden = false;
}

function logout() {
  state.token = "";
  state.members = [];
  sessionStorage.removeItem(SESSION_KEY);
  elements.dashboard.hidden = true;
  elements.logoutButton.hidden = true;
  elements.loginPanel.hidden = false;
  elements.passwordInput.focus();
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    const data = await readJson(response);
    const ok = response.ok && data.ok;
    elements.apiStatus.textContent = ok ? "Connected" : "Needs attention";
    $(".live-dot")?.classList.toggle("ok", ok);
    $(".live-dot")?.classList.toggle("bad", !ok);
  } catch {
    elements.apiStatus.textContent = "Offline";
    $(".live-dot")?.classList.add("bad");
  }
}

async function loadAll() {
  setBusy(true);
  setDashboardStatus("Refreshing Mission Control…");
  try {
    await Promise.all([loadTeam(false), loadSiteAdminData(false)]);
    await Promise.all([loadDeployment(false), runHealthScan(false)]);
    setDashboardStatus(state.backendV4 ? "Mission Control is up to date." : "Admin v4 UI is loaded, but the Worker v4 routes are not live yet.", state.backendV4 ? "success" : "error");
  } catch (error) {
    handleAuthError(error);
    setDashboardStatus(error.message || "Could not refresh Mission Control.", "error");
  } finally {
    setBusy(false);
  }
}

async function loadSiteAdminData(updateStatus = true) {
  try {
    const response = await apiFetch("/api/admin/site", { method: "GET" });
    const data = await readJson(response);
    if (response.status === 404) {
      state.backendV4 = false;
      await loadStaticSiteControl();
      return;
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `Could not load site controls (${response.status}).`);
    state.backendV4 = true;
    state.published = normalizeSiteControl(data.published);
    state.draft = normalizeSiteControl(data.draft || data.published);
    state.history = Array.isArray(data.history) ? data.history : [];
    state.activity = Array.isArray(data.activity) ? data.activity : [];
    state.draftDirty = !deepEqual(stripTimes(state.draft), stripTimes(state.published));
    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    updateSiteMetrics();
    if (updateStatus) setDashboardStatus("Site controls refreshed.", "success");
  } catch (error) {
    handleAuthError(error);
    if (updateStatus) setDashboardStatus(error.message || "Could not load site controls.", "error");
    throw error;
  }
}

async function loadStaticSiteControl() {
  try {
    const response = await fetch(`data/site-control.json?v=${Date.now()}`, { cache: "no-store" });
    const data = response.ok ? await response.json() : DEFAULT_SITE_CONTROL;
    state.published = normalizeSiteControl(data);
    state.draft = clone(state.published);
    state.history = [];
    state.activity = [];
    state.draftDirty = false;
    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    updateSiteMetrics();
  } catch {
    state.published = clone(DEFAULT_SITE_CONTROL);
    state.draft = clone(DEFAULT_SITE_CONTROL);
    syncFieldsFromDraft();
    updateSiteMetrics();
  }
}

function syncFieldsFromDraft() {
  const a = state.draft.announcement;
  const m = state.draft.maintenance;
  siteFields.announcementEnabled.checked = a.enabled;
  siteFields.announcementLabel.value = a.label;
  siteFields.announcementTitle.value = a.title;
  siteFields.announcementMessage.value = a.message;
  siteFields.announcementLinkText.value = a.linkText;
  siteFields.announcementLinkUrl.value = a.linkUrl;
  siteFields.announcementStartAt.value = toLocalInputValue(a.startAt);
  siteFields.announcementEndAt.value = toLocalInputValue(a.endAt);
  siteFields.maintenanceEnabled.checked = m.enabled;
  siteFields.maintenanceTitle.value = m.title;
  siteFields.maintenanceMessage.value = m.message;
  siteFields.maintenanceEta.value = m.eta;
  VISIBILITY_ITEMS.forEach(([key]) => {
    const checkbox = elements.visibilityGrid.querySelector(`[data-visibility-key="${key}"]`);
    if (checkbox) checkbox.checked = state.draft.visibility[key] !== false;
  });
  updateAnnouncementPreview();
  updateMaintenancePreview();
  updateDraftChip();
  sendPreview();
}

function syncDraftFromFields() {
  state.draft.announcement = {
    enabled: siteFields.announcementEnabled.checked,
    label: siteFields.announcementLabel.value.trim(),
    title: siteFields.announcementTitle.value.trim(),
    message: siteFields.announcementMessage.value.trim(),
    linkText: siteFields.announcementLinkText.value.trim(),
    linkUrl: siteFields.announcementLinkUrl.value.trim(),
    startAt: fromLocalInputValue(siteFields.announcementStartAt.value),
    endAt: fromLocalInputValue(siteFields.announcementEndAt.value),
  };
  state.draft.maintenance = {
    enabled: siteFields.maintenanceEnabled.checked,
    title: siteFields.maintenanceTitle.value.trim(),
    message: siteFields.maintenanceMessage.value.trim(),
    eta: siteFields.maintenanceEta.value.trim(),
  };
  VISIBILITY_ITEMS.forEach(([key]) => {
    const checkbox = elements.visibilityGrid.querySelector(`[data-visibility-key="${key}"]`);
    if (checkbox) state.draft.visibility[key] = checkbox.checked;
  });
  state.draftDirty = !deepEqual(stripTimes(state.draft), stripTimes(state.published));
  updateDraftChip();
  updateAnnouncementPreview();
  updateMaintenancePreview();
  updateSiteMetrics();
  sendPreview();
}

function validateDraft(config) {
  const a = config.announcement;
  if (a.enabled && !a.title.trim()) throw new Error("An enabled announcement needs a headline.");
  if (a.linkText && !a.linkUrl) throw new Error("Add a CTA link or remove the CTA text.");
  if (a.startAt && a.endAt && Date.parse(a.startAt) >= Date.parse(a.endAt)) throw new Error("Announcement end time must be after the start time.");
  if (config.maintenance.enabled && !config.maintenance.title.trim()) throw new Error("Maintenance mode needs a headline.");
}

async function saveDraft({ silent = false } = {}) {
  syncDraftFromFields();
  validateDraft(state.draft);
  if (!state.backendV4) throw new Error("Worker v4 is not deployed yet, so drafts cannot be saved to GitHub from this UI.");
  if (!silent) setPublishStatus("Saving draft…");
  const response = await apiFetch("/api/admin/site/draft", {
    method: "PUT",
    body: JSON.stringify({ config: state.draft }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.ok) throw new Error(data.error || `Draft save failed (${response.status}).`);
  state.draft = normalizeSiteControl(data.draft || state.draft);
  state.draftDirty = !deepEqual(stripTimes(state.draft), stripTimes(state.published));
  updateDraftChip();
  if (!silent) setPublishStatus("Draft saved to GitHub.", "success");
  return data;
}

async function publishDraft() {
  if (state.busy) return;
  setBusy(true);
  setPublishStatus("Preparing publish…");
  try {
    syncDraftFromFields();
    validateDraft(state.draft);
    await saveDraft({ silent: true });
    const response = await apiFetch("/api/admin/site/publish", { method: "POST", body: "{}" });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Publish failed (${response.status}).`);
    state.published = normalizeSiteControl(data.published || state.draft);
    state.draft = clone(state.published);
    state.history = Array.isArray(data.history) ? data.history : state.history;
    state.activity = Array.isArray(data.activity) ? data.activity : state.activity;
    state.draftDirty = false;
    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    updateSiteMetrics();
    setPublishStatus(`Published successfully${data.commit ? ` · ${data.commit.slice(0, 7)}` : ""}.`, "success");
    setDashboardStatus("Live site control state published.", "success");
    await loadDeployment(false);
  } catch (error) {
    handleAuthError(error);
    setPublishStatus(error.message || "Publish failed.", "error");
  } finally {
    setBusy(false);
  }
}

async function publishMaintenanceState() {
  syncDraftFromFields();
  const enabling = state.draft.maintenance.enabled;
  if (enabling) {
    const confirmed = window.confirm("Publish maintenance mode now? Visitors will see the TEL maintenance screen until you disable and publish it again.");
    if (!confirmed) return;
  }
  await publishDraft();
}

function sendPreview() {
  if (!elements.previewFrame?.contentWindow) return;
  try {
    elements.previewFrame.contentWindow.postMessage({ type: "TEL_ADMIN_PREVIEW", config: state.draft }, location.origin);
  } catch { /* preview iframe may still be loading */ }
}

function updateDraftChip() {
  elements.draftChip.textContent = state.draftDirty ? "UNPUBLISHED" : "SYNCED";
  elements.draftChip.classList.toggle("dirty", state.draftDirty);
  elements.metricDraft.textContent = state.draftDirty ? "Changes" : "Synced";
  elements.metricDraftSub.textContent = state.draftDirty ? "Draft differs from live site" : "No unpublished edits";
}

function updateAnnouncementPreview() {
  const a = state.draft.announcement;
  $("#announcementMiniLabel").textContent = a.label || "TEL UPDATE";
  $("#announcementMiniTitle").textContent = a.title || "Your announcement will appear here.";
  $("#announcementMiniMessage").textContent = a.message || "This preview mirrors the new homepage announcement section.";
  $("#announcementMiniLink").textContent = a.linkText ? `${a.linkText} ↗` : "No CTA";
  const status = getAnnouncementStatus(a);
  $("#announcementScheduleState").textContent = status.label;
  $("#announcementScheduleDetail").textContent = status.detail;
}

function getAnnouncementStatus(a) {
  if (!a.enabled) return { label: "Announcement disabled", detail: "It will not appear on the homepage." };
  const now = Date.now();
  const start = a.startAt ? Date.parse(a.startAt) : NaN;
  const end = a.endAt ? Date.parse(a.endAt) : NaN;
  if (Number.isFinite(start) && now < start) return { label: "Scheduled", detail: `Starts ${new Date(start).toLocaleString()}.` };
  if (Number.isFinite(end) && now >= end) return { label: "Schedule ended", detail: `Ended ${new Date(end).toLocaleString()}.` };
  if (Number.isFinite(end)) return { label: "Active now", detail: `Automatically ends ${new Date(end).toLocaleString()}.` };
  return { label: "Active now", detail: "No automatic end time." };
}

function updateMaintenancePreview() {
  const m = state.draft.maintenance;
  $("#maintenanceToggleTitle").textContent = m.enabled ? "Maintenance is ON in draft" : "Maintenance is OFF";
  $("#maintenanceToggleCopy").textContent = m.enabled ? "Publish to put the public site behind the maintenance screen." : "The public site remains available normally.";
  $("#maintenanceMiniTitle").textContent = m.title || DEFAULT_SITE_CONTROL.maintenance.title;
  $("#maintenanceMiniMessage").textContent = m.message || DEFAULT_SITE_CONTROL.maintenance.message;
  $("#maintenanceMiniEta").textContent = m.eta || DEFAULT_SITE_CONTROL.maintenance.eta;
}

function updateSiteMetrics() {
  updateDraftChip();
  const announcementStatus = getAnnouncementStatus(state.published.announcement);
  elements.metricAnnouncement.textContent = state.published.announcement.enabled ? (announcementStatus.label === "Active now" ? "Live" : "Scheduled") : "Off";
  elements.metricAnnouncementSub.textContent = announcementStatus.detail;
  elements.metricMaintenance.textContent = state.published.maintenance.enabled ? "ON" : "Off";
  elements.metricMaintenanceSub.textContent = state.published.maintenance.enabled ? "Public maintenance gate is active" : "Public site available";
}

function renderVisibilityControls() {
  elements.visibilityGrid.replaceChildren();
  VISIBILITY_ITEMS.forEach(([key, title, copy]) => {
    const item = document.createElement("label");
    item.className = "visibility-item";
    item.innerHTML = `<div><strong></strong><small></small></div><span class="switch"><input type="checkbox" data-visibility-key="${key}"><i></i></span>`;
    $("strong", item).textContent = title;
    $("small", item).textContent = copy;
    const checkbox = $("input", item);
    checkbox.checked = true;
    checkbox.addEventListener("change", syncDraftFromFields);
    elements.visibilityGrid.append(item);
  });
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!state.history.length) {
    elements.historyList.innerHTML = '<div class="empty-state">No previous published versions yet.</div>';
    return;
  }
  state.history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = entry.label || `Version ${entry.id || "snapshot"}`;
    const small = document.createElement("small");
    small.textContent = `${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown time"}${entry.commit ? ` · ${entry.commit.slice(0, 7)}` : ""}`;
    info.append(strong, small);
    const button = document.createElement("button");
    button.className = "button button-secondary";
    button.type = "button";
    button.textContent = "Restore";
    button.addEventListener("click", () => rollbackVersion(entry.id));
    item.append(info, button);
    elements.historyList.append(item);
  });
}

async function rollbackVersion(id) {
  if (!id) return;
  const confirmed = window.confirm("Restore this version to the live site controls? The current live version will be saved to history first.");
  if (!confirmed) return;
  setBusy(true);
  setDashboardStatus("Restoring selected version…");
  try {
    const response = await apiFetch("/api/admin/site/rollback", { method: "POST", body: JSON.stringify({ id }) });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Rollback failed (${response.status}).`);
    state.published = normalizeSiteControl(data.published);
    state.draft = clone(state.published);
    state.history = Array.isArray(data.history) ? data.history : state.history;
    state.activity = Array.isArray(data.activity) ? data.activity : state.activity;
    state.draftDirty = false;
    syncFieldsFromDraft();
    renderHistory();
    renderActivity();
    setDashboardStatus("Previous version restored and published.", "success");
  } catch (error) {
    handleAuthError(error);
    setDashboardStatus(error.message || "Rollback failed.", "error");
  } finally {
    setBusy(false);
  }
}

function renderActivity() {
  elements.activityList.replaceChildren();
  if (!state.activity.length) {
    elements.activityList.innerHTML = '<div class="empty-state">No v4 activity has been logged yet.</div>';
    return;
  }
  state.activity.forEach((event) => {
    const item = document.createElement("div");
    item.className = "activity-item";
    const mark = document.createElement("span");
    mark.className = "activity-mark";
    mark.textContent = activityIcon(event.type);
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = event.message || event.type || "Admin action";
    const small = document.createElement("small");
    small.textContent = `${event.at ? new Date(event.at).toLocaleString() : "Unknown time"}${event.commit ? ` · ${event.commit.slice(0, 7)}` : ""}`;
    info.append(strong, small);
    item.append(mark, info);
    elements.activityList.append(item);
  });
}

function activityIcon(type) {
  if (/rollback/i.test(type || "")) return "↶";
  if (/publish/i.test(type || "")) return "↑";
  if (/team/i.test(type || "")) return "T";
  if (/image/i.test(type || "")) return "▧";
  return "·";
}

async function loadDeployment(updateStatus = true) {
  if (!state.token) return;
  if (!state.backendV4) {
    state.deployment = null;
    renderDeploymentFallback();
    return;
  }
  try {
    const response = await apiFetch("/api/admin/deployment", { method: "GET" });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Deployment lookup failed (${response.status}).`);
    state.deployment = data;
    renderDeployment(data);
    if (updateStatus) setDashboardStatus("Deployment status refreshed.", "success");
  } catch (error) {
    renderDeploymentError(error);
    if (updateStatus) setDashboardStatus(error.message || "Could not load deployment status.", "error");
  }
}

function renderDeployment(data) {
  const commit = data.commit || {};
  elements.deploymentConsole.replaceChildren();
  addConsoleLine(`> repository ${data.repository || "TEL website"}`);
  addConsoleLine(`> branch ${data.branch || "main"}`);
  addConsoleLine(`> head ${commit.sha ? commit.sha.slice(0, 12) : "unknown"}`);
  addConsoleLine(`> message ${commit.message || "No commit message available"}`);
  addConsoleLine(`> committed ${commit.date ? new Date(commit.date).toLocaleString() : "unknown"}`);
  addConsoleLine(`> admin API v4 ${data.apiVersion || "ready"}`);
  elements.overviewDeployOrb.className = "status-orb ok";
  elements.overviewDeployTitle.textContent = commit.sha ? `GitHub ${commit.sha.slice(0, 7)}` : "GitHub connected";
  elements.overviewDeploySub.textContent = commit.message || "Latest branch state loaded";
}

function renderDeploymentFallback() {
  elements.deploymentConsole.innerHTML = "<p>&gt; Admin v4 backend routes are not live on the Worker.</p><p>&gt; Static v4 frontend files can still be checked from GitHub.</p>";
  elements.overviewDeployOrb.className = "status-orb bad";
  elements.overviewDeployTitle.textContent = "Worker v4 pending";
  elements.overviewDeploySub.textContent = "Deploy the v4 Worker source to activate publish/history controls";
}

function renderDeploymentError(error) {
  elements.deploymentConsole.innerHTML = "";
  addConsoleLine(`> error ${error.message || "Deployment status unavailable"}`);
  elements.overviewDeployOrb.className = "status-orb bad";
  elements.overviewDeployTitle.textContent = "Status unavailable";
  elements.overviewDeploySub.textContent = error.message || "Could not read repository status";
}

function addConsoleLine(text) {
  const p = document.createElement("p");
  p.textContent = text;
  elements.deploymentConsole.append(p);
}

async function runHealthScan(updateStatus = true) {
  const checks = [
    ["Homepage", "index.html"],
    ["Product", "product.html"],
    ["Schools", "schools.html"],
    ["Safety", "safety.html"],
    ["Careers", "careers.html"],
    ["About", "about.html"],
    ["Contact", "contact.html"],
    ["Site controls", "data/site-control.json"],
    ["TEL logo", "tel-logo.webp"],
  ];
  elements.healthList.innerHTML = '<div class="empty-state">Scanning public files…</div>';
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
  const failed = results.filter((item) => !item.ok).length;
  elements.metricWebsite.textContent = failed ? `${failed} issue${failed === 1 ? "" : "s"}` : "Healthy";
  elements.metricWebsiteSub.textContent = failed ? "Open Deployment for failed checks" : `${results.length} checks passed`;
  if (updateStatus) setDashboardStatus(failed ? `Health scan finished with ${failed} failed check${failed === 1 ? "" : "s"}.` : "All website health checks passed.", failed ? "error" : "success");
  return results;
}

function renderHealth(results) {
  elements.healthList.replaceChildren();
  results.forEach((result) => {
    const item = document.createElement("div");
    item.className = "health-item";
    const orb = document.createElement("span");
    orb.className = `status-orb ${result.ok ? "ok" : "bad"}`;
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = result.name;
    const small = document.createElement("small");
    small.textContent = result.ok ? `HTTP ${result.status}` : (result.status ? `HTTP ${result.status}` : "Request failed");
    info.append(strong, small);
    const ms = document.createElement("b");
    ms.textContent = `${result.ms} ms`;
    item.append(orb, info, ms);
    elements.healthList.append(item);
  });
}

async function loadTeam(updateStatus = true) {
  try {
    const response = await fetch(`${API_BASE}/api/team`, { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Could not load team (${response.status}).`);
    state.members = Array.isArray(data.data?.members) ? data.data.members.map(normalizeMember) : [];
    state.teamUpdatedAt = data.data?.updatedAt || null;
    renderMembers();
    if (updateStatus) setTeamStatus(data.exists ? "Team data loaded." : "No team file exists yet.", "success");
  } catch (error) {
    if (updateStatus) setTeamStatus(error.message || "Could not load team.", "error");
    throw error;
  }
}

function addMember() {
  const order = state.members.length + 1;
  state.members.push({ id: `new-member-${Date.now()}`, name: "", role: "", quote: "", label: "", image: "", alt: "", section: "team", order, active: true });
  renderMembers();
  elements.memberList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderMembers() {
  elements.memberList.replaceChildren();
  state.members.forEach((member, index) => {
    const card = elements.memberTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.index = String(index);
    $(".member-number", card).textContent = `${member.section === "leadership" ? "LEADERSHIP" : "TEAM"} // ${String(index + 1).padStart(2, "0")}`;
    const fields = {
      name: $(".field-name", card), role: $(".field-role", card), section: $(".field-section", card), order: $(".field-order", card),
      label: $(".field-label", card), quote: $(".field-quote", card), image: $(".field-image", card), alt: $(".field-alt", card), active: $(".field-active", card),
    };
    fields.name.value = member.name; fields.role.value = member.role; fields.section.value = member.section; fields.order.value = member.order;
    fields.label.value = member.label; fields.quote.value = member.quote; fields.image.value = member.image; fields.alt.value = member.alt; fields.active.checked = member.active;
    for (const [key, field] of Object.entries(fields)) {
      const eventName = key === "active" || key === "section" ? "change" : "input";
      field.addEventListener(eventName, () => {
        member[key] = key === "active" ? field.checked : key === "order" ? Number(field.value) || index + 1 : field.value;
        if (key === "image") updatePhotoPreview(card, member.image, member.alt || member.name);
        updateTeamSummary();
      });
    }
    $(".move-up", card).disabled = index === 0;
    $(".move-down", card).disabled = index === state.members.length - 1;
    $(".move-up", card).addEventListener("click", () => moveMember(index, -1));
    $(".move-down", card).addEventListener("click", () => moveMember(index, 1));
    $(".remove-member", card).addEventListener("click", () => removeMember(index));
    $(".image-file", card).addEventListener("change", (event) => uploadImage(event, member, card));
    updatePhotoPreview(card, member.image, member.alt || member.name);
    elements.memberList.append(card);
  });
  updateTeamSummary();
}

function moveMember(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.members.length) return;
  [state.members[index], state.members[target]] = [state.members[target], state.members[index]];
  state.members.forEach((member, position) => { member.order = position + 1; });
  renderMembers();
}

function removeMember(index) {
  const member = state.members[index];
  if (!window.confirm(`Remove ${member.name || "this member"} from the dashboard?`)) return;
  state.members.splice(index, 1);
  state.members.forEach((item, position) => { item.order = position + 1; });
  renderMembers();
}

async function uploadImage(event, member, card) {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = $(".upload-status", card);
  const memberId = slugify(member.name || member.id || "team-member");
  if (!memberId || memberId.length < 2) { status.textContent = "Enter the member’s name before uploading a photo."; return; }
  if (file.size > 5 * 1024 * 1024) { status.textContent = "Image must be 5 MB or smaller."; return; }
  status.textContent = "Uploading to GitHub…";
  try {
    const base64 = await fileToBase64(file);
    const response = await apiFetch("/api/images", { method: "POST", body: JSON.stringify({ memberId, contentType: file.type, base64 }) });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Upload failed (${response.status}).`);
    member.id = memberId; member.image = data.path; $(".field-image", card).value = data.path;
    updatePhotoPreview(card, data.path, member.alt || member.name);
    status.textContent = "Photo uploaded. Save the team data next.";
  } catch (error) { status.textContent = error.message || "Upload failed."; }
  finally { event.target.value = ""; }
}

async function saveTeam() {
  syncMembersFromCards();
  const invalid = state.members.find((member) => !member.name.trim() || !member.role.trim());
  if (invalid) { setTeamStatus("Every member needs a name and role before saving.", "error"); return; }
  setBusy(true); setTeamStatus("Saving team to GitHub…");
  try {
    const members = state.members.map((member, index) => ({ ...member, id: slugify(member.id || member.name), name: member.name.trim(), role: member.role.trim(), quote: member.quote.trim(), label: member.label.trim(), image: member.image.trim(), alt: member.alt.trim() || `${member.name.trim()}, ${member.role.trim()}`, section: member.section === "leadership" ? "leadership" : "team", order: index + 1, active: member.active !== false }));
    const response = await apiFetch("/api/team", { method: "PUT", body: JSON.stringify({ members }) });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `Save failed (${response.status}).`);
    state.members = data.data.members.map(normalizeMember); state.teamUpdatedAt = data.data.updatedAt; renderMembers();
    setTeamStatus("Team saved to GitHub successfully.", "success");
    if (state.backendV4) loadSiteAdminData(false).catch(() => {});
  } catch (error) { handleAuthError(error); setTeamStatus(error.message || "Could not save team data.", "error"); }
  finally { setBusy(false); }
}

function syncMembersFromCards() {
  $$(".member-card", elements.memberList).forEach((card, index) => {
    const member = state.members[index];
    member.name = $(".field-name", card).value; member.role = $(".field-role", card).value; member.section = $(".field-section", card).value;
    member.order = Number($(".field-order", card).value) || index + 1; member.label = $(".field-label", card).value; member.quote = $(".field-quote", card).value;
    member.image = $(".field-image", card).value; member.alt = $(".field-alt", card).value; member.active = $(".field-active", card).checked;
  });
}

function updatePhotoPreview(card, path, alt) {
  const img = $(".photo-preview img", card); const placeholder = $(".photo-preview span", card);
  if (!path) { img.hidden = true; img.removeAttribute("src"); placeholder.hidden = false; placeholder.textContent = "No photo"; return; }
  img.src = path; img.alt = alt || "Team member"; img.hidden = false; placeholder.hidden = true;
  img.onerror = () => { img.hidden = true; placeholder.hidden = false; placeholder.textContent = "Photo not found"; };
}

function updateTeamSummary() {
  elements.memberCount.textContent = String(state.members.length);
  elements.visibleCount.textContent = String(state.members.filter((member) => member.active !== false).length);
  elements.lastUpdated.textContent = state.teamUpdatedAt ? `Last saved ${new Date(state.teamUpdatedAt).toLocaleString()}` : "Not saved yet";
}

function switchView(view) {
  if (!VIEW_META[view]) return;
  $$(".nav-item", elements.adminNav).forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  elements.viewEyebrow.textContent = VIEW_META[view][0];
  elements.viewTitle.textContent = VIEW_META[view][1];
  if (view === "publish") setTimeout(sendPreview, 80);
  if (view === "deployment") { loadDeployment(false); runHealthScan(false); }
}

function setBusy(busy) {
  state.busy = busy;
  [elements.quickPublishButton, elements.publishButton, elements.saveDraftButton, elements.saveTeamButton, elements.refreshAllButton].forEach((button) => { if (button) button.disabled = busy; });
}
function setLoginStatus(message, type = "") { elements.loginStatus.textContent = message; elements.loginStatus.className = `status ${type}`.trim(); }
function setDashboardStatus(message, type = "") { elements.dashboardStatus.textContent = message; elements.dashboardStatus.className = `status global-status ${type}`.trim(); }
function setPublishStatus(message, type = "") { elements.publishStatus.textContent = message; elements.publishStatus.className = `status ${type}`.trim(); }
function setTeamStatus(message, type = "") { elements.teamStatus.textContent = message; elements.teamStatus.className = `status ${type}`.trim(); }

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}`, ...(options.headers || {}) } });
}
function handleAuthError(error) { if (/authentication|session|expired/i.test(error?.message || "")) logout(); }
async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { ok: false, error: text || "The server returned an invalid response." }; } }
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Could not read the selected image.")); reader.readAsDataURL(file); }); }
function slugify(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
function normalizeMember(member, index = 0) { return { id: String(member.id || slugify(member.name || `member-${index + 1}`)), name: String(member.name || ""), role: String(member.role || ""), quote: String(member.quote || ""), label: String(member.label || ""), image: String(member.image || ""), alt: String(member.alt || ""), section: member.section === "leadership" ? "leadership" : "team", order: Number(member.order) || index + 1, active: member.active !== false }; }
function normalizeSiteControl(input) { const source = input && typeof input === "object" ? input : {}; return { ...clone(DEFAULT_SITE_CONTROL), ...source, announcement: { ...DEFAULT_SITE_CONTROL.announcement, ...(source.announcement || {}) }, maintenance: { ...DEFAULT_SITE_CONTROL.maintenance, ...(source.maintenance || {}) }, visibility: { ...DEFAULT_SITE_CONTROL.visibility, ...(source.visibility || {}) } }; }
function toLocalInputValue(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
function fromLocalInputValue(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stripTimes(value) { const copy = clone(value); delete copy.updatedAt; delete copy.publishedAt; return copy; }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
