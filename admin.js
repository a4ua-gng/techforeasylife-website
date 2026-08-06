"use strict";

const API_BASE = "https://tel-website-admin-api.xtremedivyangshu.workers.dev";
const SESSION_KEY = "telAdminSession";

const state = {
  token: sessionStorage.getItem(SESSION_KEY) || "",
  members: [],
  updatedAt: null,
  busy: false,
};

const elements = {
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  passwordInput: document.querySelector("#passwordInput"),
  loginStatus: document.querySelector("#loginStatus"),
  dashboard: document.querySelector("#dashboard"),
  dashboardStatus: document.querySelector("#dashboardStatus"),
  memberList: document.querySelector("#memberList"),
  memberTemplate: document.querySelector("#memberTemplate"),
  memberCount: document.querySelector("#memberCount"),
  visibleCount: document.querySelector("#visibleCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  addMemberButton: document.querySelector("#addMemberButton"),
  saveButton: document.querySelector("#saveButton"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
};

elements.loginForm.addEventListener("submit", handleLogin);
elements.addMemberButton.addEventListener("click", addMember);
elements.saveButton.addEventListener("click", saveTeam);
elements.refreshButton.addEventListener("click", loadTeam);
elements.logoutButton.addEventListener("click", logout);

if (state.token) {
  showDashboard();
  loadTeam();
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

    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.error || `Login failed (${response.status}).`);
    }

    state.token = data.token;
    sessionStorage.setItem(SESSION_KEY, state.token);
    elements.passwordInput.value = "";
    setLoginStatus("");
    showDashboard();
    await loadTeam();
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

async function loadTeam() {
  setBusy(true);
  setDashboardStatus("Loading team data…");

  try {
    const response = await fetch(`${API_BASE}/api/team`, { cache: "no-store" });
    const data = await readJson(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Could not load team (${response.status}).`);
    }

    state.members = Array.isArray(data.data?.members)
      ? data.data.members.map(normalizeMember)
      : [];
    state.updatedAt = data.data?.updatedAt || null;
    renderMembers();
    setDashboardStatus(data.exists ? "Team data loaded." : "No team file exists yet. Save once to create it.", "success");
  } catch (error) {
    setDashboardStatus(error.message || "Could not load team.", "error");
  } finally {
    setBusy(false);
  }
}

function addMember() {
  const order = state.members.length + 1;
  state.members.push({
    id: `new-member-${Date.now()}`,
    name: "",
    role: "",
    quote: "",
    label: "",
    image: "",
    alt: "",
    section: "team",
    order,
    active: true,
  });
  renderMembers();
  elements.memberList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderMembers() {
  elements.memberList.replaceChildren();

  state.members.forEach((member, index) => {
    const card = elements.memberTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.index = String(index);
    card.querySelector(".member-number").textContent = `${member.section === "leadership" ? "LEADERSHIP" : "TEAM"} // ${String(index + 1).padStart(2, "0")}`;

    const fields = {
      name: card.querySelector(".field-name"),
      role: card.querySelector(".field-role"),
      section: card.querySelector(".field-section"),
      order: card.querySelector(".field-order"),
      label: card.querySelector(".field-label"),
      quote: card.querySelector(".field-quote"),
      image: card.querySelector(".field-image"),
      alt: card.querySelector(".field-alt"),
      active: card.querySelector(".field-active"),
    };

    fields.name.value = member.name;
    fields.role.value = member.role;
    fields.section.value = member.section;
    fields.order.value = member.order;
    fields.label.value = member.label;
    fields.quote.value = member.quote;
    fields.image.value = member.image;
    fields.alt.value = member.alt;
    fields.active.checked = member.active;

    for (const [key, field] of Object.entries(fields)) {
      const eventName = key === "active" || key === "section" ? "change" : "input";
      field.addEventListener(eventName, () => {
        member[key] = key === "active"
          ? field.checked
          : key === "order"
            ? Number(field.value) || index + 1
            : field.value;
        if (key === "image") updatePhotoPreview(card, member.image, member.alt || member.name);
        updateSummary();
      });
    }

    card.querySelector(".move-up").disabled = index === 0;
    card.querySelector(".move-down").disabled = index === state.members.length - 1;
    card.querySelector(".move-up").addEventListener("click", () => moveMember(index, -1));
    card.querySelector(".move-down").addEventListener("click", () => moveMember(index, 1));
    card.querySelector(".remove-member").addEventListener("click", () => removeMember(index));
    card.querySelector(".image-file").addEventListener("change", (event) => uploadImage(event, member, card));

    updatePhotoPreview(card, member.image, member.alt || member.name);
    elements.memberList.append(card);
  });

  updateSummary();
}

function moveMember(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.members.length) return;
  [state.members[index], state.members[target]] = [state.members[target], state.members[index]];
  state.members.forEach((member, position) => { member.order = position + 1; });
  renderMembers();
}

async function removeMember(index) {
  const member = state.members[index];
  const confirmed = window.confirm(`Remove ${member.name || "this member"} from the dashboard?`);
  if (!confirmed) return;

  state.members.splice(index, 1);
  state.members.forEach((item, position) => { item.order = position + 1; });
  renderMembers();
}

async function uploadImage(event, member, card) {
  const file = event.target.files?.[0];
  if (!file) return;

  const status = card.querySelector(".upload-status");
  const memberId = slugify(member.name || member.id || "team-member");

  if (!memberId || memberId.length < 2) {
    status.textContent = "Enter the member’s name before uploading a photo.";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "Image must be 5 MB or smaller.";
    return;
  }

  status.textContent = "Uploading to GitHub…";

  try {
    const base64 = await fileToBase64(file);
    const response = await apiFetch("/api/images", {
      method: "POST",
      body: JSON.stringify({ memberId, contentType: file.type, base64 }),
    });
    const data = await readJson(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Upload failed (${response.status}).`);
    }

    member.id = memberId;
    member.image = data.path;
    card.querySelector(".field-image").value = data.path;
    updatePhotoPreview(card, data.path, member.alt || member.name);
    status.textContent = "Photo uploaded. Save the team data next.";
  } catch (error) {
    status.textContent = error.message || "Upload failed.";
  } finally {
    event.target.value = "";
  }
}

async function saveTeam() {
  syncMembersFromCards();

  const invalid = state.members.find((member) => !member.name.trim() || !member.role.trim());
  if (invalid) {
    setDashboardStatus("Every member needs a name and role before saving.", "error");
    return;
  }

  setBusy(true);
  setDashboardStatus("Saving to GitHub…");

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
      active: member.active !== false,
    }));

    const response = await apiFetch("/api/team", {
      method: "PUT",
      body: JSON.stringify({ members }),
    });
    const data = await readJson(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Save failed (${response.status}).`);
    }

    state.members = data.data.members.map(normalizeMember);
    state.updatedAt = data.data.updatedAt;
    renderMembers();
    setDashboardStatus("Saved to GitHub successfully.", "success");
  } catch (error) {
    if (/authentication|session|expired/i.test(error.message || "")) logout();
    setDashboardStatus(error.message || "Could not save team data.", "error");
  } finally {
    setBusy(false);
  }
}

function syncMembersFromCards() {
  const cards = [...elements.memberList.querySelectorAll(".member-card")];
  cards.forEach((card, index) => {
    const member = state.members[index];
    member.name = card.querySelector(".field-name").value;
    member.role = card.querySelector(".field-role").value;
    member.section = card.querySelector(".field-section").value;
    member.order = Number(card.querySelector(".field-order").value) || index + 1;
    member.label = card.querySelector(".field-label").value;
    member.quote = card.querySelector(".field-quote").value;
    member.image = card.querySelector(".field-image").value;
    member.alt = card.querySelector(".field-alt").value;
    member.active = card.querySelector(".field-active").checked;
  });
}

function updatePhotoPreview(card, path, alt) {
  const img = card.querySelector(".photo-preview img");
  const placeholder = card.querySelector(".photo-preview span");

  if (!path) {
    img.hidden = true;
    img.removeAttribute("src");
    placeholder.hidden = false;
    return;
  }

  img.src = path;
  img.alt = alt || "Team member";
  img.hidden = false;
  placeholder.hidden = true;
  img.onerror = () => {
    img.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = "Photo not found";
  };
}

function updateSummary() {
  elements.memberCount.textContent = String(state.members.length);
  elements.visibleCount.textContent = String(state.members.filter((member) => member.active !== false).length);
  elements.lastUpdated.textContent = state.updatedAt
    ? `Last saved ${new Date(state.updatedAt).toLocaleString()}`
    : "Not saved yet";
}

function setBusy(busy) {
  state.busy = busy;
  elements.saveButton.disabled = busy;
  elements.refreshButton.disabled = busy;
  elements.addMemberButton.disabled = busy;
}

function setLoginStatus(message, type = "") {
  elements.loginStatus.textContent = message;
  elements.loginStatus.className = `status ${type}`.trim();
}

function setDashboardStatus(message, type = "") {
  elements.dashboardStatus.textContent = message;
  elements.dashboardStatus.className = `status ${type}`.trim();
}

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
    active: member.active !== false,
  };
}
