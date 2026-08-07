const API_VERSION = "2026-03-10";
const WORKER_VERSION = "4.0.0";
const TEAM_FILE = "data/team.json";
const IMAGE_DIRECTORY = "team-images";
const SITE_FILE = "data/site-control.json";
const SITE_DRAFT_FILE = "data/site-control-draft.json";
const SITE_HISTORY_FILE = "data/site-control-history.json";
const ACTIVITY_FILE = "data/admin-activity.json";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_JSON_BYTES = 500_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HISTORY_LIMIT = 20;
const ACTIVITY_LIMIT = 80;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "OPTIONS") return handlePreflight(request, env);
      if (!originIsAllowed(request, env)) return jsonResponse(request, env, 403, { ok: false, error: "Origin not allowed." });

      if (request.method === "GET" && (path === "/" || path === "/health")) return healthResponse(request, env);
      if (request.method === "POST" && path === "/api/login") return login(request, env);
      if (request.method === "GET" && path === "/api/team") return getTeam(request, env);
      if (request.method === "GET" && path === "/api/site-control") return getSiteControl(request, env);

      const protectedRoutes = new Set([
        "PUT /api/team",
        "POST /api/images",
        "DELETE /api/images",
        "GET /api/admin/site",
        "PUT /api/admin/site/draft",
        "POST /api/admin/site/publish",
        "POST /api/admin/site/rollback",
        "GET /api/admin/deployment",
      ]);
      const routeKey = `${request.method} ${path}`;
      if (protectedRoutes.has(routeKey)) {
        const auth = await requireAdmin(request, env);
        if (!auth.ok) return auth.response;
      }

      if (request.method === "PUT" && path === "/api/team") return saveTeam(request, env);
      if (request.method === "POST" && path === "/api/images") return uploadImage(request, env);
      if (request.method === "DELETE" && path === "/api/images") return deleteImage(request, env, url);
      if (request.method === "GET" && path === "/api/admin/site") return getSiteAdmin(request, env);
      if (request.method === "PUT" && path === "/api/admin/site/draft") return saveSiteDraft(request, env);
      if (request.method === "POST" && path === "/api/admin/site/publish") return publishSite(request, env);
      if (request.method === "POST" && path === "/api/admin/site/rollback") return rollbackSite(request, env);
      if (request.method === "GET" && path === "/api/admin/deployment") return getDeploymentStatus(request, env);

      return jsonResponse(request, env, 404, { ok: false, error: "Route not found." });
    } catch (error) {
      console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      return jsonResponse(request, env, status, { ok: false, error: error instanceof Error ? error.message : "Unexpected Worker error." });
    }
  },
};

function defaultSiteControl() {
  return {
    version: 1,
    updatedAt: null,
    publishedAt: null,
    announcement: { enabled: false, label: "TEL UPDATE", title: "", message: "", linkText: "", linkUrl: "", startAt: null, endAt: null },
    maintenance: { enabled: false, title: "TEL is getting an update.", message: "We’ll be back shortly.", eta: "Back shortly" },
    visibility: { hero: true, signalStrip: true, quickStart: true, mission: true, flagship: true, pathway: true, safety: true, leadership: true, careers: true, finalCta: true },
  };
}

function getGitHubToken(env) { return env.GITHUB_TOKEN || env[" GITHUB_TOKEN"] || ""; }
function requiredBindings(env) {
  const missing = [];
  if (!getGitHubToken(env)) missing.push("GITHUB_TOKEN");
  for (const name of ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "ALLOWED_ORIGIN", "ADMIN_PASSWORD", "SESSION_SECRET"]) if (!env[name]) missing.push(name);
  return missing;
}
function originIsAllowed(request, env) { const origin = request.headers.get("Origin"); return !origin || origin === env.ALLOWED_ORIGIN; }
function corsHeaders(request, env) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}
function handlePreflight(request, env) { if (!originIsAllowed(request, env)) return new Response(null, { status: 403 }); return new Response(null, { status: 204, headers: corsHeaders(request, env) }); }
function jsonResponse(request, env, status, data, extraHeaders = {}) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}
function healthResponse(request, env) {
  const missing = requiredBindings(env);
  if (missing.length) return jsonResponse(request, env, 500, { ok: false, service: "TEL Website Admin API", workerVersion: WORKER_VERSION, error: "Worker configuration is incomplete.", missing });
  return jsonResponse(request, env, 200, {
    ok: true,
    service: "TEL Website Admin API",
    workerVersion: WORKER_VERSION,
    repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
    branch: env.GITHUB_BRANCH,
    routes: {
      publicTeam: "GET /api/team",
      publicSiteControl: "GET /api/site-control",
      login: "POST /api/login",
      saveTeam: "PUT /api/team",
      uploadImage: "POST /api/images",
      adminSite: "GET /api/admin/site",
      saveDraft: "PUT /api/admin/site/draft",
      publish: "POST /api/admin/site/publish",
      rollback: "POST /api/admin/site/rollback",
      deployment: "GET /api/admin/deployment"
    }
  });
}

async function login(request, env) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !(await passwordMatches(password, env))) return jsonResponse(request, env, 401, { ok: false, error: "Incorrect password." });
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const token = await createSessionToken({ sub: "tel-admin", iat: now, exp: expiresAt, nonce: crypto.randomUUID() }, env.SESSION_SECRET);
  return jsonResponse(request, env, 200, { ok: true, token, expiresAt: new Date(expiresAt * 1000).toISOString(), workerVersion: WORKER_VERSION });
}
async function passwordMatches(candidate, env) {
  const key = await importHmacKey(env.SESSION_SECRET);
  const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(env.ADMIN_PASSWORD));
  return crypto.subtle.verify("HMAC", key, expectedSignature, encoder.encode(candidate));
}
async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, response: jsonResponse(request, env, 401, { ok: false, error: "Admin authentication required." }) };
  const payload = await verifySessionToken(match[1], env.SESSION_SECRET);
  if (!payload || payload.sub !== "tel-admin") return { ok: false, response: jsonResponse(request, env, 401, { ok: false, error: "Session is invalid or expired." }) };
  return { ok: true, payload };
}
async function createSessionToken(payload, secret) {
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}
async function verifySessionToken(token, secret) {
  try {
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra) return null;
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(encodedSignature), encoder.encode(encodedPayload));
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
async function importHmacKey(secret) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }

async function getTeam(request, env) {
  const file = await githubGetFile(env, TEAM_FILE);
  if (!file) return jsonResponse(request, env, 200, { ok: true, exists: false, data: { version: 1, updatedAt: null, members: [] } });
  return jsonResponse(request, env, 200, { ok: true, exists: true, data: parseJsonFile(file, TEAM_FILE) });
}
async function saveTeam(request, env) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const members = validateMembers(body.members);
  const document = { version: 1, updatedAt: new Date().toISOString(), members };
  const result = await githubPutJson(env, TEAM_FILE, document, "Update TEL team data from Admin v4");
  await appendActivity(env, { type: "team.save", message: `Saved ${members.length} team member${members.length === 1 ? "" : "s"}.`, commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, message: "Team data saved to GitHub.", commit: result.commit?.sha || null, data: document });
}
function validateMembers(input) {
  if (!Array.isArray(input)) throw new HttpError(400, "members must be an array.");
  if (input.length > 50) throw new HttpError(400, "A maximum of 50 members is allowed.");
  const seenIds = new Set();
  return input.map((member, index) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) throw new HttpError(400, `Member ${index + 1} is invalid.`);
    const name = cleanText(member.name, 100, `Member ${index + 1} name`);
    let id = typeof member.id === "string" ? member.id.trim().toLowerCase() : "";
    if (!id) id = slugify(name);
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)) throw new HttpError(400, `Member ${index + 1} has an invalid id.`);
    if (seenIds.has(id)) throw new HttpError(400, `Duplicate member id: ${id}`);
    seenIds.add(id);
    const section = member.section === "leadership" ? "leadership" : "team";
    const image = cleanOptionalText(member.image, 200);
    if (image && (image.includes("..") || /^[a-z]+:/i.test(image) || image.startsWith("//"))) throw new HttpError(400, `Member ${index + 1} has an unsafe image path.`);
    const role = cleanText(member.role, 160, `${name} role`);
    return { id, name, role, quote: cleanOptionalText(member.quote, 400), label: cleanOptionalText(member.label, 100), image, alt: cleanOptionalText(member.alt, 220) || `${name}, ${role}`, section, order: clampInteger(member.order, index + 1, 1, 999), active: member.active !== false };
  });
}

async function uploadImage(request, env) {
  const body = await readJsonBody(request, 8 * 1024 * 1024);
  const memberId = typeof body.memberId === "string" ? body.memberId.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(memberId)) throw new HttpError(400, "A valid memberId is required.");
  const typeToExtension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = typeToExtension[body.contentType];
  if (!extension) throw new HttpError(400, "Only JPG, PNG and WebP images are allowed.");
  let base64 = typeof body.base64 === "string" ? body.base64.trim() : "";
  base64 = base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, "Image data is not valid base64.");
  if (Math.floor((base64.length * 3) / 4) > MAX_IMAGE_BYTES) throw new HttpError(413, "Image must be 5 MB or smaller.");
  const path = `${IMAGE_DIRECTORY}/${memberId}.${extension}`;
  const existing = await githubGetFile(env, path);
  const result = await githubPutFile(env, path, base64, existing?.sha, existing ? `Update ${memberId} team photo` : `Add ${memberId} team photo`);
  await appendActivity(env, { type: "image.upload", message: `Uploaded team photo for ${memberId}.`, commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, message: "Image saved to GitHub.", path, commit: result.commit?.sha || null });
}
async function deleteImage(request, env, url) {
  const path = url.searchParams.get("path") || "";
  if (!path.startsWith(`${IMAGE_DIRECTORY}/`) || path.includes("..")) throw new HttpError(400, "A valid team image path is required.");
  const existing = await githubGetFile(env, path);
  if (!existing) throw new HttpError(404, "Image was not found.");
  const result = await githubDeleteFile(env, path, existing.sha, `Remove team image ${path}`);
  await appendActivity(env, { type: "image.delete", message: `Removed ${path}.`, commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, message: "Image removed from GitHub.", commit: result.commit?.sha || null });
}

async function getSiteControl(request, env) {
  const published = await readJsonOrDefault(env, SITE_FILE, defaultSiteControl());
  return jsonResponse(request, env, 200, { ok: true, data: published });
}
async function getSiteAdmin(request, env) {
  const published = normalizeSiteControl(await readJsonOrDefault(env, SITE_FILE, defaultSiteControl()));
  const draft = normalizeSiteControl(await readJsonOrDefault(env, SITE_DRAFT_FILE, published));
  const historyDocument = await readJsonOrDefault(env, SITE_HISTORY_FILE, { version: 1, entries: [] });
  const activityDocument = await readJsonOrDefault(env, ACTIVITY_FILE, { version: 1, events: [] });
  return jsonResponse(request, env, 200, { ok: true, workerVersion: WORKER_VERSION, published, draft, history: Array.isArray(historyDocument.entries) ? historyDocument.entries : [], activity: Array.isArray(activityDocument.events) ? activityDocument.events : [] });
}
async function saveSiteDraft(request, env) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const draft = normalizeSiteControl(validateSiteControl(body.config));
  draft.updatedAt = new Date().toISOString();
  const result = await githubPutJson(env, SITE_DRAFT_FILE, draft, "Save TEL Admin v4 site-control draft");
  const activity = await appendActivity(env, { type: "draft.save", message: "Saved site-control draft.", commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, draft, commit: result.commit?.sha || null, activity });
}
async function publishSite(request, env) {
  const publishedBefore = normalizeSiteControl(await readJsonOrDefault(env, SITE_FILE, defaultSiteControl()));
  const draft = normalizeSiteControl(await readJsonOrDefault(env, SITE_DRAFT_FILE, publishedBefore));
  validateSiteControl(draft);
  const history = await pushHistorySnapshot(env, publishedBefore, "Before publish");
  const now = new Date().toISOString();
  const nextPublished = { ...draft, updatedAt: now, publishedAt: now };
  const result = await githubPutJson(env, SITE_FILE, nextPublished, "Publish TEL Admin v4 site controls");
  await githubPutJson(env, SITE_DRAFT_FILE, nextPublished, "Sync TEL Admin v4 draft after publish");
  const activity = await appendActivity(env, { type: "site.publish", message: summarizePublish(nextPublished), commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, published: nextPublished, commit: result.commit?.sha || null, history, activity });
}
async function rollbackSite(request, env) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) throw new HttpError(400, "A history version id is required.");
  const historyDocument = await readJsonOrDefault(env, SITE_HISTORY_FILE, { version: 1, entries: [] });
  const entries = Array.isArray(historyDocument.entries) ? historyDocument.entries : [];
  const target = entries.find((entry) => entry.id === id);
  if (!target?.config) throw new HttpError(404, "That history version was not found.");
  const publishedBefore = normalizeSiteControl(await readJsonOrDefault(env, SITE_FILE, defaultSiteControl()));
  await pushHistorySnapshot(env, publishedBefore, "Before rollback");
  const restored = normalizeSiteControl(target.config);
  const now = new Date().toISOString();
  restored.updatedAt = now;
  restored.publishedAt = now;
  const result = await githubPutJson(env, SITE_FILE, restored, `Rollback TEL site controls to ${id}`);
  await githubPutJson(env, SITE_DRAFT_FILE, restored, "Sync TEL Admin v4 draft after rollback");
  const activity = await appendActivity(env, { type: "site.rollback", message: `Restored site-control version ${id}.`, commit: result.commit?.sha || null });
  const latestHistory = await readJsonOrDefault(env, SITE_HISTORY_FILE, { version: 1, entries: [] });
  return jsonResponse(request, env, 200, { ok: true, published: restored, commit: result.commit?.sha || null, history: latestHistory.entries || [], activity });
}
async function pushHistorySnapshot(env, config, label) {
  const document = await readJsonOrDefault(env, SITE_HISTORY_FILE, { version: 1, entries: [] });
  const entries = Array.isArray(document.entries) ? document.entries : [];
  const createdAt = new Date().toISOString();
  entries.unshift({ id: `v-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6)}`, label, createdAt, commit: null, config: normalizeSiteControl(config) });
  const trimmed = entries.slice(0, HISTORY_LIMIT);
  await githubPutJson(env, SITE_HISTORY_FILE, { version: 1, entries: trimmed }, "Update TEL Admin v4 version history");
  return trimmed;
}
async function appendActivity(env, event) {
  const document = await readJsonOrDefault(env, ACTIVITY_FILE, { version: 1, events: [] });
  const events = Array.isArray(document.events) ? document.events : [];
  events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), type: cleanOptionalText(event.type, 80) || "admin.action", message: cleanOptionalText(event.message, 280) || "Admin action", commit: cleanOptionalText(event.commit, 80) || null });
  const trimmed = events.slice(0, ACTIVITY_LIMIT);
  await githubPutJson(env, ACTIVITY_FILE, { version: 1, events: trimmed }, "Update TEL Admin v4 activity log");
  return trimmed;
}
function summarizePublish(config) {
  const parts = [];
  if (config.announcement?.enabled) parts.push("announcement enabled");
  if (config.maintenance?.enabled) parts.push("maintenance enabled");
  const hidden = Object.entries(config.visibility || {}).filter(([, visible]) => visible === false).length;
  if (hidden) parts.push(`${hidden} homepage section${hidden === 1 ? "" : "s"} hidden`);
  return parts.length ? `Published site controls: ${parts.join(", ")}.` : "Published site controls.";
}
function validateSiteControl(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "config must be an object.");
  const config = normalizeSiteControl(input);
  const a = config.announcement;
  a.label = cleanOptionalText(a.label, 60) || "TEL UPDATE";
  a.title = cleanOptionalText(a.title, 120);
  a.message = cleanOptionalText(a.message, 500);
  a.linkText = cleanOptionalText(a.linkText, 60);
  a.linkUrl = cleanOptionalText(a.linkUrl, 240);
  a.startAt = cleanDateOrNull(a.startAt, "Announcement start time");
  a.endAt = cleanDateOrNull(a.endAt, "Announcement end time");
  if (a.enabled && !a.title) throw new HttpError(400, "An enabled announcement needs a headline.");
  if (a.linkText && !a.linkUrl) throw new HttpError(400, "Announcement CTA text requires a link.");
  if (a.linkUrl && /^(javascript|data|vbscript):/i.test(a.linkUrl)) throw new HttpError(400, "Announcement link is not allowed.");
  if (a.startAt && a.endAt && Date.parse(a.startAt) >= Date.parse(a.endAt)) throw new HttpError(400, "Announcement end time must be after the start time.");
  const m = config.maintenance;
  m.title = cleanOptionalText(m.title, 120) || "TEL is getting an update.";
  m.message = cleanOptionalText(m.message, 500) || "We’ll be back shortly.";
  m.eta = cleanOptionalText(m.eta, 120) || "Back shortly";
  return config;
}
function normalizeSiteControl(input) {
  const defaults = defaultSiteControl();
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const visibility = { ...defaults.visibility };
  for (const key of Object.keys(visibility)) visibility[key] = source.visibility?.[key] !== false;
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    publishedAt: typeof source.publishedAt === "string" ? source.publishedAt : null,
    announcement: { ...defaults.announcement, ...(source.announcement && typeof source.announcement === "object" ? source.announcement : {}), enabled: source.announcement?.enabled === true },
    maintenance: { ...defaults.maintenance, ...(source.maintenance && typeof source.maintenance === "object" ? source.maintenance : {}), enabled: source.maintenance?.enabled === true },
    visibility
  };
}
function cleanDateOrNull(value, label) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} is invalid.`); return date.toISOString(); }

async function getDeploymentStatus(request, env) {
  const data = await githubGetLatestCommit(env);
  const commit = { sha: data.sha || null, message: data.commit?.message || null, date: data.commit?.committer?.date || data.commit?.author?.date || null, url: data.html_url || null };
  return jsonResponse(request, env, 200, { ok: true, apiVersion: WORKER_VERSION, repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch: env.GITHUB_BRANCH, commit });
}
function githubHeaders(env) { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${getGitHubToken(env)}`, "User-Agent": "TEL-Website-Admin-Worker", "X-GitHub-Api-Version": API_VERSION }; }
function githubContentUrl(env, path) {
  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repository = encodeURIComponent(env.GITHUB_REPO);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${repository}/contents/${encodedPath}`;
}
async function githubGetFile(env, path) {
  const response = await fetch(`${githubContentUrl(env, path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, { headers: githubHeaders(env) });
  if (response.status === 404) return null;
  const data = await readGitHubResponse(response);
  if (Array.isArray(data) || data.type !== "file" || typeof data.content !== "string") throw new HttpError(502, `GitHub did not return a file for ${path}.`);
  return { sha: data.sha, text: decoder.decode(base64ToBytes(data.content.replace(/\s/g, ""))) };
}
async function readJsonOrDefault(env, path, fallback) { const file = await githubGetFile(env, path); if (!file) return structuredClone(fallback); return parseJsonFile(file, path); }
function parseJsonFile(file, path) { try { return JSON.parse(file.text); } catch { throw new HttpError(502, `${path} contains invalid JSON.`); } }
async function githubPutJson(env, path, data, message) {
  const existing = await githubGetFile(env, path);
  return githubPutFile(env, path, bytesToBase64(encoder.encode(`${JSON.stringify(data, null, 2)}\n`)), existing?.sha, message);
}
async function githubPutFile(env, path, base64Content, sha, message) {
  const payload = { message, content: base64Content, branch: env.GITHUB_BRANCH };
  if (sha) payload.sha = sha;
  const response = await fetch(githubContentUrl(env, path), { method: "PUT", headers: { ...githubHeaders(env), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return readGitHubResponse(response);
}
async function githubDeleteFile(env, path, sha, message) {
  const response = await fetch(githubContentUrl(env, path), { method: "DELETE", headers: { ...githubHeaders(env), "Content-Type": "application/json" }, body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH }) });
  return readGitHubResponse(response);
}
async function githubGetLatestCommit(env) {
  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repo = encodeURIComponent(env.GITHUB_REPO);
  const ref = encodeURIComponent(env.GITHUB_BRANCH);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}`, { headers: githubHeaders(env) });
  return readGitHubResponse(response);
}
async function readGitHubResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text || "Unknown GitHub response" }; }
  if (!response.ok) throw new HttpError(response.status === 409 ? 409 : 502, `GitHub API error (${response.status}): ${data.message || "Unknown error"}`);
  return data;
}
async function readJsonBody(request, maxBytes) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "Request is too large.");
  let text;
  try { text = await request.text(); } catch { throw new HttpError(400, "Could not read request body."); }
  if (encoder.encode(text).byteLength > maxBytes) throw new HttpError(413, "Request is too large.");
  try { return JSON.parse(text || "{}"); } catch { throw new HttpError(400, "Request body must be valid JSON."); }
}
function cleanText(value, maxLength, label) { const text = typeof value === "string" ? value.trim() : ""; if (!text) throw new HttpError(400, `${label} is required.`); if (text.length > maxLength) throw new HttpError(400, `${label} is too long.`); return text; }
function cleanOptionalText(value, maxLength) { const text = typeof value === "string" ? value.trim() : ""; if (text.length > maxLength) throw new HttpError(400, "A text field is too long."); return text; }
function clampInteger(value, fallback, minimum, maximum) { const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback; return Math.min(maximum, Math.max(minimum, number)); }
function slugify(value) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
function base64UrlEncode(bytes) { return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlDecode(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); return base64ToBytes(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)); }
function bytesToBase64(bytes) { let binary = ""; const chunkSize = 0x8000; for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize)); return btoa(binary); }
function base64ToBytes(base64) { const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return bytes; }
class HttpError extends Error { constructor(status, message) { super(message); this.name = "HttpError"; this.status = status; } }
