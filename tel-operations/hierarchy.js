import { levels, authority, assignedPeople, reporting, approvals, cover, modeText } from "./hierarchy-data.js";

const root = new URL("../", import.meta.url);
const svgNS = "http://www.w3.org/2000/svg";
const stage = document.querySelector("#chart-stage");
const scene = document.querySelector("#chart-scene");
const decks = document.querySelector("#chart-decks");
const edges = document.querySelector("#chart-edges");
const nodeLayer = document.querySelector("#chart-nodes");
const inspector = document.querySelector("#chart-inspector");
const scenarioSelect = document.querySelector("#cover-scenario");
const status = document.querySelector("#chart-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const phone = window.matchMedia("(max-width: 720px)");

const rosterFallback = [
  { id: "abhiraj-bhattacharya", name: "Abhiraj Bhattacharya", role: "Strategy Analyst", image: "abhiraj-bhattacharya-corrected.webp" },
  { id: "new-member-1786110873578", name: "Jidan Hussain", role: "Growth & Outreach Manager", image: "team-images/new-member-1786110873578.jpg" },
  { id: "kalpa-jyoti-baruah", name: "Kalpa Jyoti Baruah", role: "Visual Media Lead", image: "team-images/kalpa-jyoti-baruah.jpg" }
];

let roles = [];
let buttons = new Map();
let layout = new Map();
let rails = [];
let edgePaths = [];
let selectedId = "founder";
let previewId = null;
let mode = "reporting";
let view = reducedMotion.matches ? "flat" : "depth";
let yaw = -.16;
let pitch = .21;
let frame;
let drag;
let width;
let height;
let centerX;
let span;
let compact;

function svg(name, className) {
  const el = document.createElementNS(svgNS, name);
  if (className) el.setAttribute("class", className);
  return el;
}

function imageFor(person, className) {
  if (!person?.image) return null;
  const image = document.createElement("img");
  image.src = new URL(person.image, root).href;
  image.alt = "";
  image.decoding = "async";
  image.className = className;
  image.addEventListener("error", () => image.remove(), { once: true });
  return image;
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join("");
}

function renderRoster(people) {
  const verified = new Map(people.map(person => [person.id, person]));
  roles = authority.map(role => ({
    ...role,
    person: verified.get(role.personId) || assignedPeople.get(role.personId)
  }));
  roles.push(...people.filter(person => !assignedPeople.has(person.id)).map(person => ({
    id: person.id,
    level: 3,
    title: person.name,
    caption: person.role || "Team member",
    person,
    summary: person.role ? `${person.role} at TEL. Members share the same authority level.` : "A TEL team member with the same authority level as other members.",
    facts: {
      "Owns": "Their assigned work, updates and handover.",
      "Reports to": "The designated lead for the work. HR coordinates team-wide announcements and leave.",
      "Can coordinate": "Share updates, suggest changes and flag blockers. Task assignments come from the designated lead."
    }
  })));
  if (!roles.some(role => role.id === selectedId)) selectedId = "founder";
  previewId = null;

  buttons = new Map();
  const nodes = document.createDocumentFragment();
  for (const role of roles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chart-node level-${role.level}`;
    button.dataset.role = role.id;
    const description = role.caption || role.person?.name || levels[role.level];
    button.setAttribute("aria-label", `${levels[role.level]}. ${role.title}. ${description}`);
    button.setAttribute("aria-controls", "chart-inspector");

    const avatar = document.createElement("span");
    avatar.className = "node-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = role.person ? initials(role.person.name) : "✦";
    const photo = imageFor(role.person, "node-photo");
    if (photo) avatar.append(photo);

    const label = document.createElement("span");
    label.className = "node-text";
    const title = document.createElement("strong");
    title.textContent = role.title;
    const caption = document.createElement("small");
    caption.textContent = description;
    label.append(title, caption);
    button.append(avatar, label);

    const showPreview = () => {
      previewId = role.id;
      updateInspector();
    };
    const clearPreview = () => {
      if (previewId !== role.id) return;
      previewId = null;
      updateInspector();
    };
    button.addEventListener("pointerenter", event => {
      if (event.pointerType === "mouse") showPreview();
    });
    button.addEventListener("pointerleave", () => {
      if (document.activeElement !== button) clearPreview();
    });
    button.addEventListener("focus", showPreview);
    button.addEventListener("blur", clearPreview);
    button.addEventListener("click", () => {
      selectedId = role.id;
      previewId = null;
      updateInspector();
      status.textContent = `${role.title} selected`;
      if (phone.matches) {
        inspector.tabIndex = -1;
        inspector.focus({ preventScroll: true });
        inspector.scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "instant" : "smooth" });
      }
    });
    nodes.append(button);
    buttons.set(role.id, button);
  }
  nodeLayer.replaceChildren(nodes);
  document.querySelector("#chart-levels").textContent = `4 levels · ${new Set(roles.map(role => role.person?.name).filter(Boolean)).size} people`;
  resize();
  updateMode();
}

function updateInspector() {
  const id = previewId || selectedId;
  const role = roles.find(item => item.id === id);
  if (!role) return;
  const person = role.person;
  document.querySelector("#role-index").textContent = `0${role.level + 1} / ${levels[role.level].toUpperCase()}`;
  document.querySelector("#role-title").textContent = role.title;
  document.querySelector("#role-person").textContent = role.level === 3 ? role.caption : (person?.name || role.caption);
  document.querySelector("#role-summary").textContent = role.summary;
  const avatar = document.querySelector("#role-avatar");
  avatar.className = `role-avatar level-${role.level}`;
  avatar.textContent = person ? initials(person.name) : "✦";
  const photo = imageFor(person, "role-photo");
  if (photo) avatar.append(photo);
  const facts = document.createDocumentFragment();
  for (const [key, value] of Object.entries(role.facts)) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = key;
    description.textContent = value;
    facts.append(term, description);
  }
  document.querySelector("#role-facts").replaceChildren(facts);
  for (const [nodeId, button] of buttons) {
    button.setAttribute("aria-pressed", String(nodeId === selectedId));
    button.classList.toggle("is-preview", nodeId === id && nodeId !== selectedId);
  }
  for (const [path, from, to] of edgePaths) {
    path.classList.toggle("is-connected", from === id || to === id);
  }
}

function legendItem(text, extraClass = "") {
  const item = document.createElement("span");
  const line = document.createElement("span");
  line.className = `legend-line ${extraClass}`;
  item.append(line, document.createTextNode(text));
  return item;
}

function updateMode() {
  const scenario = cover[scenarioSelect.value];
  const relevant = modeText[mode];
  scenarioSelect.parentElement.hidden = mode !== "cover";
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  const shownEdges = mode === "reporting" ? reporting : mode === "approvals" ? approvals : scenario.edges;
  edges.replaceChildren();
  edgePaths = shownEdges.map(([from, to, type = "reporting"]) => {
    const path = svg("path", `chart-edge edge-${type}`);
    edges.append(path);
    return [path, from, to, type];
  });
  for (const [id, button] of buttons) {
    button.classList.toggle("is-away", mode === "cover" && scenario.absent.includes(id));
    button.classList.toggle("is-acting", mode === "cover" && (
      scenarioSelect.value === "both" ? ["temark", "finance", "hr"].includes(id) : id === (scenarioSelect.value === "founder" ? "coo" : "ceo")
    ));
  }
  document.querySelector("#context-title").textContent = relevant.title;
  document.querySelector("#context-copy").textContent = mode === "cover" ? scenario.copy : relevant.copy;
  const legend = document.querySelector("#chart-legend");
  legend.replaceChildren(legendItem(relevant.legend, mode === "cover" ? "legend-acting" : relevant.legendClass));
  if (relevant.second) legend.append(legendItem(relevant.second, relevant.secondClass));
  updateInspector();
  requestDraw();
}

function resize() {
  width = stage.clientWidth;
  if (!width) return;
  compact = width < 675;
  const members = roles.filter(role => role.level === 3);
  const memberColumns = compact ? 2 : Math.min(Math.max(members.length, 1), 4);
  const memberRows = Math.max(1, Math.ceil(members.length / memberColumns));
  const rowHeight = compact ? 70 : 68;
  const baseline = compact ? [94, 192, 290, 466] : [96, 204, 318, 444];
  height = baseline[3] + (memberRows - 1) * rowHeight + 86;
  centerX = compact ? width / 2 : width / 2 + 36;
  span = compact ? (width - 26) / 2 : (width - 132) / 2;
  const gap = compact ? 11 : 14;
  stage.style.setProperty("--scene-height", `${height}px`);
  stage.style.setProperty("--node-width", `${Math.min(compact ? 247 : 190, span * (compact ? 1 : .5) - gap)}px`);
  scene.setAttribute("viewBox", `0 0 ${width} ${height}`);
  layout = new Map();
  rails = [];
  decks.replaceChildren();

  function rail(level, y, showLabel = true) {
    const platform = svg("path", `chart-deck deck-${level}`);
    const grid = svg("path", "chart-grid-lines");
    const front = svg("path", "chart-deck-front");
    const label = svg("text", "chart-rail-label");
    label.textContent = `0${level + 1}   ${levels[level].toUpperCase()}`;
    decks.append(platform, grid, front);
    if (showLabel) decks.append(label);
    rails.push({ y, platform, grid, front, label });
  }

  baseline.forEach((y, level) => rail(level, y));
  if (compact) rail(2, baseline[2] + rowHeight, false);
  for (let row = 1; row < memberRows; row += 1) rail(3, baseline[3] + row * rowHeight, false);

  authority.forEach((role, index) => {
    let x = role.x;
    let y = baseline[role.level];
    if (compact && role.level === 2) {
      x = index % 2 === 0 ? -.51 : .51;
      if (index >= 6) y += rowHeight;
    } else if (compact) {
      x = Math.sign(x) * .51;
    }
    layout.set(role.id, { x: x * span, y, z: role.z });
  });
  members.forEach((role, index) => {
    const row = Math.floor(index / memberColumns);
    const col = index % memberColumns;
    const x = ((col + .5) / memberColumns * 2 - 1) * (compact ? 1.02 : 1);
    layout.set(role.id, { x: x * span, y: baseline[3] + row * rowHeight, z: col % 2 === 0 ? 12 : -8 });
  });
  requestDraw();
}

function requestDraw() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function project(point) {
  if (view === "flat") return { x: centerX + point.x, y: point.y, scale: 1, depth: 0 };
  const y = point.y - height / 2;
  const angle = compact ? yaw * .64 : yaw;
  const x1 = point.x * Math.cos(angle) + point.z * Math.sin(angle);
  const z1 = point.z * Math.cos(angle) - point.x * Math.sin(angle);
  const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const depth = y * Math.sin(pitch) + z1 * Math.cos(pitch);
  const scale = 1 + Math.max(-.12, Math.min(.12, depth / 1400));
  return { x: centerX + x1 * scale, y: height / 2 + y1 * scale, scale, depth };
}

function line(point) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function draw() {
  frame = null;
  if (!width) return;
  for (const { y, platform, grid, front, label } of rails) {
    const left = -span - 8;
    const right = span + 8;
    const back = view === "flat" ? 0 : -110;
    const foot = y + 24;
    const a = project({ x: left, y: foot, z: back });
    const b = project({ x: right, y: foot, z: back });
    const c = project({ x: right, y: foot + 3, z: 45 });
    const d = project({ x: left, y: foot + 3, z: 45 });
    platform.setAttribute("d", `M${line(a)} L${line(b)} L${line(c)} L${line(d)} Z`);
    front.setAttribute("d", `M${line(d)} L${line(c)}`);
    const ribs = [];
    for (let i = 1; i < 8; i += 1) {
      const x = left + (right - left) * i / 8;
      ribs.push(`M${line(project({ x, y: foot, z: back }))} L${line(project({ x, y: foot + 3, z: 45 }))}`);
    }
    grid.setAttribute("d", ribs.join(" "));
    label.setAttribute("x", compact ? 15 : 18);
    label.setAttribute("y", Math.round(project({ x: 0, y: y - (compact ? 40 : 28), z: 0 }).y));
  }

  const centers = new Map();
  for (const [id, point] of layout) {
    const node = buttons.get(id);
    const center = project(point);
    node.style.left = `${center.x}px`;
    node.style.top = `${center.y}px`;
    node.style.setProperty("--depth-scale", center.scale);
    node.style.zIndex = String(Math.round(center.depth + 170));
    centers.set(id, center);
  }

  for (const [path, from, to, type] of edgePaths) {
    const a = centers.get(from);
    const b = centers.get(to);
    if (!a || !b) continue;
    if (type === "approval") {
      const direction = Math.sign(b.x - a.x);
      const aX = a.x + direction * 20;
      const bX = b.x - direction * 20;
      const lift = direction * 41;
      path.setAttribute("d", `M${aX},${a.y} C${aX},${a.y + lift} ${bX},${b.y + lift} ${bX},${b.y}`);
    } else {
      const startY = a.y + 24 * a.scale;
      const endY = b.y - 24 * b.scale;
      const mid = (startY + endY) / 2;
      path.setAttribute("d", `M${a.x},${startY} C${a.x},${mid} ${b.x},${mid} ${b.x},${endY}`);
    }
  }
}

function setView(next) {
  view = next;
  stage.dataset.view = view;
  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  }
  document.querySelector(".chart-camera").hidden = view === "flat";
  document.querySelector("#chart-hint").textContent = view === "depth" ? "Drag to orbit · select a role" : "Flat view · select a role";
  requestDraw();
}

function rotate(nextYaw, nextPitch) {
  yaw = Math.max(-.52, Math.min(.52, nextYaw));
  pitch = Math.max(-.2, Math.min(.38, nextPitch));
  requestDraw();
}

for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    updateMode();
    status.textContent = document.querySelector("#context-copy").textContent;
  });
}
for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => setView(button.dataset.view));
}
for (const button of document.querySelectorAll("[data-camera]")) {
  button.addEventListener("click", () => {
    if (button.dataset.camera === "reset") rotate(-.16, .21);
    else rotate(yaw + (button.dataset.camera === "left" ? -.18 : .18), pitch);
  });
}
scenarioSelect.addEventListener("change", () => {
  updateMode();
  status.textContent = cover[scenarioSelect.value].copy;
});
stage.addEventListener("pointerdown", event => {
  if (view !== "depth" || event.button !== 0 || event.target.closest("button")) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
  stage.setPointerCapture(event.pointerId);
  stage.classList.add("is-dragging");
});
stage.addEventListener("pointermove", event => {
  if (!drag || drag.id !== event.pointerId) return;
  rotate(drag.yaw + (event.clientX - drag.x) * .005, drag.pitch + (event.clientY - drag.y) * .004);
});
stage.addEventListener("lostpointercapture", () => {
  drag = null;
  stage.classList.remove("is-dragging");
});

const resizeObserver = new ResizeObserver(() => {
  if (stage.clientWidth !== width) resize();
});
resizeObserver.observe(stage);
setView(view);
renderRoster(rosterFallback);

try {
  const response = await fetch(new URL("data/team.json", root));
  if (!response.ok) throw new Error("TEL team directory unavailable");
  const directory = await response.json();
  const people = directory.members
    .filter(person => person?.active !== false && person?.id && person?.name)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
  renderRoster(people);
} catch {
  // Keep the verified roster snapshot if the public directory is temporarily unavailable.
}
