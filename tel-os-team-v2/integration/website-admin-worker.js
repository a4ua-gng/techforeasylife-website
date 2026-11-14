/* Shared public-site and admin content model. No credentials or service calls. */
const TELBrandModel = (() => {
  const defaults = {
    version: 1,
    tel: {
      headline: 'Ideas.', outline: 'Made real.',
      intro: 'Learning worth experiencing. Businesses worth building. We turn curiosity into useful work through TEL Education and TeMark.',
      mission: 'Make meaningful technology and thoughtful ideas easier to understand, experience and use.',
      instagram: 'techforeasylife.in',
      journeyIntro: 'TEL started with a smart-home idea. Each project, prototype and fresh start has shaped the company we are building today.',
      smartHomeVideo: ''
    },
    education: {
      name: 'TEL Education', status: 'coming_soon',
      intro: 'Our first rocket has flown. TEL Education brings model rocket products, practical STEM and the SafeFlight learning system together. Our public launch is coming soon.',
      detail: 'From the model rocket kit to guided preparation through SafeFlight, we are building experiences that make classroom ideas tangible. Our first flight is complete; now we are preparing to share TEL Education with the public.',
      opening: 'Coming soon',
      launchNote: 'First flight complete. Our public opening date will be announced here.',
      flightVideo: 'https://youtu.be/c0egvCz12nI',
      schoolEnquiriesOpen: true,
      schoolYear: '2027'
    },
    temark: {
      name: 'TeMark by TEL', instagram: 'temarkk__',
      email: 'business.telmark@gmail.com', emailVerified: false,
      ctaTitle: 'Become our client today.',
      ctaIntro: 'Tell us about your business, your audience and what you want to achieve. Let’s discuss where TeMark can help.',
      ctaLabel: 'Start a project enquiry',
      intro: 'The creative and marketing venture of TEL. We learn how your business works, then bring strategy, campaigns, content and design together around it.',
      approach: 'Every business has its own customers, location and ambitions. We take time to understand those details, shape a content plan, create the work and keep learning as the business grows.'
    },
    business: {legalName:'', address:'', registration:'', privacyEmail:'techforeasylife.operations@gmail.com', grievanceName:'', grievanceEmail:'', phone:''},
    services: [
      { id:'strategy', title:'Marketing strategy & campaigns', detail:'Business understanding, marketing direction, campaign planning and coordination across the brand’s communication.' },
      { id:'social', title:'Social media management', detail:'Content planning, calendars, publishing and a consistent presence across business accounts.' },
      { id:'content', title:'Reels & content production', detail:'Short-form video, photography, editing and content shaped around the business.' },
      { id:'design', title:'Graphic design & campaigns', detail:'Branded creatives, launch communication, seasonal posts and campaign visuals.' },
      { id:'web', title:'Websites & digital presence', detail:'Clear websites and digital touchpoints that help people understand a business and make enquiries.' },
      { id:'reporting', title:'Performance tracking & reporting', detail:'Following marketing and social performance, reviewing campaign activity and using the findings to shape the next plan.' }
    ],
    clients: [
      {id:'sk-group',name:'SK Group',sector:'Business group',status:'current',visible:true,detail:'We manage overall marketing strategy and coordination for SK Group, including campaign planning, social media, content, branded creatives and performance tracking.',services:['Marketing strategy','Campaign planning','Social media management','Content & design','Performance tracking & reporting']},
      {id:'gs-motors',name:'GS Motors',sector:'Automotive',status:'current',visible:true,detail:'Social media management and creative content that introduce the business, its offerings and its customer experience.',services:['Social media management','Reels & content','Graphic design']},
      {id:'gs-riders',name:'GS Riders',sector:'Automotive',status:'current',visible:true,detail:'Social media management, business-led storytelling and visual content for its online presence.',services:['Social media management','Reels & content','Branded creatives']},
      {id:'osom-motors',name:'OSOM Motors',sector:'Automotive',status:'current',visible:true,detail:'Content planning and social media management, with creatives built around the business and its audience.',services:['Social media management','Content planning','Graphic design']},
      {id:'dental-care',name:'Dental Care, GS Road',sector:'Healthcare',status:'current',visible:true,detail:'Social media content and graphic design that introduce the practice and communicate its services clearly.',services:['Social media content','Graphic design','Digital communication']},
      {id:'sk-resort',name:'Upcoming resort · SK Group',sector:'Hospitality',status:'upcoming',visible:true,detail:'SK Group’s upcoming resort is a future addition to our work. It is shown here as an upcoming engagement.',services:['Planned brand communication','Planned social media presence']}
    ],
    dealershipBrands:['tvs','royal-enfield','montra'],
    upcomingBrands:['yamaha'],
    milestones:[
      {id:'beginnings',year:'2022',title:'A first idea. A habit of building.',detail:'TEL’s first smart-home project begins the journey, with a simple ambition: make useful technology easier to experience.'},
      {id:'first-flight',year:'2023',title:'Try. Learn. Fly.',detail:'Early rocket prototyping brings a setback and then a breakthrough. The first attempt fails; the second flies.'},
      {id:'new-horizons',year:'2024',title:'New horizons. A fresh team.',detail:'TEL reaches Delhi, receives seed support and rebuilds with a new student team.'},
      {id:'rocket-kit',year:'2025',title:'From a prototype to a product.',detail:'The TEL Rocket Kit becomes the flagship learning product, turning the team’s practical experience into a clearer product direction.'},
      {id:'two-ventures',year:'2026',title:'Different paths. One TEL.',detail:'TEL prepares its school learning module and SafeFlight pathway, while TeMark grows its work with businesses across strategy, campaigns, social media and design. TEL Education’s public launch is still ahead.'}
    ]
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const str = (value, fallback='') => typeof value === 'string' ? value.trim() : fallback;
  const clone = value => JSON.parse(JSON.stringify(value));
  const brands = ['tvs','royal-enfield','montra','yamaha','ashok-leyland'];
  const isPublicVideoUrl = value => {
    try {const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
  };
  const isVideoUrl = value => {
    try {
      const url=new URL(value);
      if(url.protocol!=='https:')return false;
      if(url.hostname==='youtu.be')return /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname);
      return ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)&&url.pathname==='/watch'&&/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v')||'');
    }catch{return false;}
  };
  function normalize(input) {
    const source=object(input);
    const section=(key,keys)=>Object.fromEntries(keys.map(k=>[k,str(object(source[key])[k],defaults[key][k])]));
    return {
      version:1,
      tel:section('tel',['headline','outline','intro','mission','instagram','journeyIntro','smartHomeVideo']),
      education:{...section('education',['name','status','intro','detail','opening','launchNote','flightVideo','schoolYear']),schoolEnquiriesOpen:typeof object(source.education).schoolEnquiriesOpen==='boolean'?source.education.schoolEnquiriesOpen:defaults.education.schoolEnquiriesOpen},
      temark:{...section('temark',['name','instagram','email','intro','approach','ctaTitle','ctaIntro','ctaLabel']),emailVerified:typeof object(source.temark).emailVerified==='boolean'?source.temark.emailVerified:defaults.temark.emailVerified},
      business:section('business',['legalName','address','registration','privacyEmail','grievanceName','grievanceEmail','phone']),
      services:(Array.isArray(source.services)?source.services:defaults.services).map((item,index)=>{const s=object(item);return{id:str(s.id,`service-${index+1}`),title:str(s.title),detail:str(s.detail)};}),
      clients:(Array.isArray(source.clients)?source.clients:defaults.clients).map((item,index)=>{const s=object(item);return{id:str(s.id,`client-${index+1}`),name:str(s.name),sector:str(s.sector),status:str(s.status,'current'),visible:s.visible!==false,detail:str(s.detail),services:Array.isArray(s.services)?s.services.map(v=>str(v)).filter(Boolean):[]};}),
      dealershipBrands:Array.isArray(source.dealershipBrands)?[...new Set(source.dealershipBrands.map(v=>str(v)))]:[...defaults.dealershipBrands],
      upcomingBrands:Array.isArray(source.upcomingBrands)?[...new Set(source.upcomingBrands.map(v=>str(v)))]:[...defaults.upcomingBrands],
      milestones:(Array.isArray(source.milestones)?source.milestones:defaults.milestones).map((item,index)=>{const value=object(item);return{id:str(value.id,`milestone-${index+1}`),year:str(value.year),title:str(value.title),detail:str(value.detail)};})
    };
  }
  function validate(input) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('TEL content must be an object.');
    if(input.services!==undefined&&!Array.isArray(input.services))throw new Error('Services must be a list.');
    if(input.clients!==undefined&&!Array.isArray(input.clients))throw new Error('Clients must be a list.');
    if(input.dealershipBrands!==undefined&&!Array.isArray(input.dealershipBrands))throw new Error('Dealership brands must be a list.');
    if(input.upcomingBrands!==undefined&&!Array.isArray(input.upcomingBrands))throw new Error('Upcoming brands must be a list.');
    if(input.milestones!==undefined&&!Array.isArray(input.milestones))throw new Error('Milestones must be a list.');
    const data=normalize(input);
    const text=(value,max,label,required=true)=>{if(required&&!value)throw new Error(`${label} is required.`);if(value.length>max)throw new Error(`${label} is too long.`);};
    text(data.tel.headline,90,'TEL headline');text(data.tel.outline,90,'TEL outline');text(data.tel.intro,600,'TEL introduction');text(data.tel.mission,700,'TEL mission');
    text(data.tel.journeyIntro,500,'Journey introduction');
    text(data.tel.smartHomeVideo,400,'Smart-home video link',false);
    if(data.tel.smartHomeVideo&&!isPublicVideoUrl(data.tel.smartHomeVideo))throw new Error('Enter a valid HTTPS link for the smart-home video.');
    if(!/^[A-Za-z0-9._]{1,30}$/.test(data.tel.instagram))throw new Error('Enter TEL’s Instagram handle without @, spaces or a URL.');
    text(data.education.name,80,'Education name');text(data.education.intro,600,'Education introduction');text(data.education.detail,700,'Education details');
    text(data.education.opening,100,'Public opening');text(data.education.launchNote,300,'Launch update');
    if(input.education?.schoolEnquiriesOpen!==undefined&&typeof input.education.schoolEnquiriesOpen!=='boolean')throw new Error('School enquiry availability must be true or false.');
    if(!/^20\d{2}$/.test(data.education.schoolYear))throw new Error('Enter a four-digit school enquiry year.');
    if(!isVideoUrl(data.education.flightVideo))throw new Error('Enter a valid HTTPS YouTube video link for the first flight.');
    if(!['coming_soon','active'].includes(data.education.status))throw new Error('Choose a valid TEL Education status.');
    text(data.temark.name,80,'TeMark name');text(data.temark.intro,600,'TeMark introduction');text(data.temark.approach,900,'TeMark approach');
    if(!/^[A-Za-z0-9._]{1,30}$/.test(data.temark.instagram))throw new Error('Enter an Instagram handle without @, spaces or a URL.');
    if(input.temark?.emailVerified!==undefined&&typeof input.temark.emailVerified!=='boolean')throw new Error('TeMark email confirmation must be true or false.');
    if(data.temark.email&&!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(data.temark.email))throw new Error('Enter a valid TeMark email address.');
    if(data.temark.emailVerified&&!data.temark.email)throw new Error('Add the confirmed TeMark email address.');
    text(data.temark.email,200,'TeMark email',false);
    text(data.temark.ctaTitle,100,'TeMark call to action');text(data.temark.ctaIntro,350,'TeMark enquiry introduction');text(data.temark.ctaLabel,60,'TeMark enquiry button');
    for(const [key,value]of Object.entries(data.business))text(value,key==='address'?600:200,'Business '+key,false);
    for(const key of ['privacyEmail','grievanceEmail'])if(data.business[key]&&!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(data.business[key]))throw new Error('Enter a valid '+key+' address.');
    if(data.services.length>10)throw new Error('Up to 10 services are allowed.');
    if(data.clients.length>40)throw new Error('Up to 40 client entries are allowed.');
    const ids=new Set();
    for(const [kind,items]of[['Service',data.services],['Client',data.clients]])for(const item of items){
      if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(item.id))throw new Error(`${kind} has an invalid ID.`);
      const key=kind+':'+item.id;if(ids.has(key))throw new Error(`Duplicate ${kind.toLowerCase()} ID.`);ids.add(key);
      text(item.name??item.title,120,`${kind} name`);text(item.detail,800,`${kind} description`);
      if(kind==='Client'){
        text(item.sector,100,'Client sector');if(!['current','upcoming'].includes(item.status))throw new Error('Choose Current or Upcoming for each client.');
        if(item.services.length>8)throw new Error('Each client can have up to 8 service labels.');for(const service of item.services)text(service,100,'Service label');
      }
    }
    if(data.dealershipBrands.length>brands.length||data.dealershipBrands.some(id=>!brands.includes(id)))throw new Error('Choose a supported dealership brand.');
    if(data.upcomingBrands.length>brands.length||data.upcomingBrands.some(id=>!brands.includes(id)))throw new Error('Choose a supported upcoming brand.');
    if(data.upcomingBrands.some(id=>data.dealershipBrands.includes(id)))throw new Error('A dealership brand must be either current or coming soon.');
    if(data.milestones.length>12)throw new Error('Up to 12 journey milestones are allowed.');
    const milestoneIds=new Set();
    for(const milestone of data.milestones){
      if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(milestone.id)||milestoneIds.has(milestone.id))throw new Error('Journey milestones need unique valid IDs.');milestoneIds.add(milestone.id);
      text(milestone.year,20,'Milestone year');text(milestone.title,120,'Milestone title');text(milestone.detail,700,'Milestone detail');
    }
    return data;
  }
  return Object.freeze({normalize,validate,isVideoUrl,isPublicVideoUrl,defaults:()=>clone(defaults),brands:Object.freeze([...brands])});
})();



const API_VERSION = "2026-03-10";
const WORKER_VERSION = "4.3.0";
const TEAM_FILE = "data/team.json";
const IMAGE_DIRECTORY = "team-images";
const SITE_CONTENT_FILE = "data/site-content.json";
const SITE_VISUAL_DIRECTORY = "site-visuals";
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
      if (request.method === "POST" && path === "/api/login") return await login(request, env);
      if (request.method === "GET" && path === "/api/team") return await getTeam(request, env);
      if (request.method === "GET" && path === "/api/site-control") return await getSiteControl(request, env);
      if (request.method === "GET" && path === "/api/site-content") return await getSiteContent(request, env);

      const protectedRoutes = new Set([
        "PUT /api/team",
        "POST /api/images",
        "DELETE /api/images",
        "PUT /api/site-content",
        "POST /api/site-assets",
        "GET /api/admin/site",
        "PUT /api/admin/site/draft",
        "POST /api/admin/site/publish",
        "POST /api/admin/site/rollback",
        "GET /api/admin/deployment",
      ]);
      let adminPayload = null;
      const routeKey = `${request.method} ${path}`;
      if (protectedRoutes.has(routeKey)) {
        const auth = await requireAdmin(request, env);
        if (!auth.ok) return auth.response;
        adminPayload = auth.payload;
      }

      if (request.method === "PUT" && path === "/api/team") return await saveTeam(request, env, adminPayload);
      if (request.method === "POST" && path === "/api/images") return await uploadImage(request, env);
      if (request.method === "DELETE" && path === "/api/images") return await deleteImage(request, env, url);
      if (request.method === "PUT" && path === "/api/site-content") return await saveSiteContent(request, env);
      if (request.method === "POST" && path === "/api/site-assets") return await uploadSiteAsset(request, env);
      if (request.method === "GET" && path === "/api/admin/site") return await getSiteAdmin(request, env);
      if (request.method === "PUT" && path === "/api/admin/site/draft") return await saveSiteDraft(request, env);
      if (request.method === "POST" && path === "/api/admin/site/publish") return await publishSite(request, env);
      if (request.method === "POST" && path === "/api/admin/site/rollback") return await rollbackSite(request, env);
      if (request.method === "GET" && path === "/api/admin/deployment") return await getDeploymentStatus(request, env);

      return jsonResponse(request, env, 404, { ok: false, error: "Route not found." });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unexpected Worker error.";
      console.error(JSON.stringify({
        message: "TEL Admin API request failed",
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        error: message
      }));
      return jsonResponse(request, env, status, {
        ok: false,
        error: status===503&&message.startsWith("Publishing is unavailable.")?message:status >= 500 ? "The admin service could not complete this request." : message
      });
    }
  },
};

function defaultSiteControl() {
  return {
    version: 1,
    updatedAt: null,
    publishedAt: null,
    brandSite: TELBrandModel.defaults(),
    announcement: { enabled: false, label: "TEL UPDATE", title: "", message: "", linkText: "", linkUrl: "", startAt: null, endAt: null },
    maintenance: { enabled: false, title: "TEL is getting an update.", message: "We’ll be back shortly.", eta: "Back shortly" },
    careers: { applicationEmail: "techforeasylife.operations@gmail.com", generalApplicationsOpen: true, vacancies: [] },
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
      publicSiteContent: "GET /api/site-content",
      login: "POST /api/login",
      saveTeam: "PUT /api/team",
      uploadImage: "POST /api/images",
      saveSiteContent: "PUT /api/site-content",
      uploadSiteAsset: "POST /api/site-assets",
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
  if (request.method === "PUT" && new URL(request.url).pathname === "/api/team" && env.TEL_OS_TEAM_KEY) {
    const candidate = request.headers.get("X-TEL-OS-Team-Key") || "";
    const key = await importHmacKey(env.SESSION_SECRET);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(env.TEL_OS_TEAM_KEY));
    if (await crypto.subtle.verify("HMAC", key, signature, encoder.encode(candidate))) {
      const role=request.headers.get("X-TEL-OS-Role");
      if (!["founder","hr_lead","hr_member"].includes(role)) return {ok:false,response:jsonResponse(request,env,403,{ok:false,error:"A valid TEL OS editing role is required."})};
      return {ok:true,payload:{sub:"tel-os-team-editor",role}};
    }
  }
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
  const file = await githubGetFile(env, TEAM_FILE, {allowPublicTeamFallback:true});
  const publishingReady=file?.publishingReady!==false;
  const publishingNote=publishingReady?null:"Publishing is unavailable. Renew the website GitHub credential before saving Team changes.";
  if (!file||file.missing) return jsonResponse(request, env, 200, { ok: true, exists: false, revision: null, publishingReady,publishingNote,data: { version: 1, updatedAt: null, members: [] } });
  return jsonResponse(request, env, 200, { ok: true, exists: true, revision: file.sha,publishingReady,publishingNote,data: parseJsonFile(file, TEAM_FILE) });
}
async function saveTeam(request, env, adminPayload) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const members = validateMembers(body.members);
  const latest = await githubGetFile(env, TEAM_FILE, {requireTeamPublishing:true});
  const teamService = adminPayload?.sub === "tel-os-team-editor";
  if (teamService) {
    if (!Object.hasOwn(body,"expectedRevision")) throw new HttpError(400,"The current Team revision is required.");
    if (body.expectedRevision !== (latest?.sha || null)) throw new HttpError(409,"The public team changed. Reload it before saving.");
    if (adminPayload.role !== "founder") {
      const existing = latest ? validateMembers(parseJsonFile(latest,TEAM_FILE).members) : [];
      const before=existing.filter(member=>member.section==="leadership"), after=members.filter(member=>member.section==="leadership");
      if(before.length!==after.length||before.some(member=>{const next=after.find(candidate=>candidate.id===member.id);return !next||JSON.stringify(next)!==JSON.stringify(member);})) throw new HttpError(403,"Leadership changes require a founder.");
    }
  }
  const document = { version: 1, updatedAt: new Date().toISOString(), members };
  // Reuse the exact checked SHA so a concurrent edit produces a GitHub conflict.
  const result = await githubPutFile(env,TEAM_FILE,bytesToBase64(encoder.encode(`${JSON.stringify(document,null,2)}\n`)),latest?.sha,"Update TEL team data from Admin v4");
  await appendActivity(env, { type: "team.save", message: `Saved ${members.length} team member${members.length === 1 ? "" : "s"}.`, commit: result.commit?.sha || null });
  return jsonResponse(request, env, 200, { ok: true, message: "Team data saved to GitHub.", commit: result.commit?.sha || null, revision: result.content?.sha || null,publishingReady:true,publishingNote:null,data: document });
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

async function getSiteContent(request, env) {
  const fallback = { version: 2, updatedAt: null, visuals: [] };
  const file = await githubGetFile(env, SITE_CONTENT_FILE);
  if (!file) return jsonResponse(request, env, 200, { ok: true, exists: false, data: fallback });
  const data = validateSiteContent(parseJsonFile(file, SITE_CONTENT_FILE));
  return jsonResponse(request, env, 200, { ok: true, exists: true, data });
}

async function saveSiteContent(request, env) {
  const body = await readJsonBody(request, MAX_JSON_BYTES);
  const data = validateSiteContent({
    version: 2,
    updatedAt: new Date().toISOString(),
    visuals: body.visuals
  });
  const result = await githubPutJson(env, SITE_CONTENT_FILE, data, "Update TEL website visuals from Admin v4.2");
  const activity = await appendActivity(env, {
    type: "visuals.save",
    message: `Saved ${data.visuals.length} website visual${data.visuals.length === 1 ? "" : "s"}.`,
    commit: result.commit?.sha || null
  });
  return jsonResponse(request, env, 200, {
    ok: true,
    message: "Website visual configuration saved to GitHub.",
    commit: result.commit?.sha || null,
    data,
    activity
  });
}

async function uploadSiteAsset(request, env) {
  const body = await readJsonBody(request, 8 * 1024 * 1024);
  const path = typeof body.path === "string" ? body.path.trim().toLowerCase() : "";
  const match = path.match(/^site-visuals\/([a-z0-9][a-z0-9-]{1,79})\.(jpg|png|webp)$/);
  if (!match || path.includes("..")) throw new HttpError(400, "A valid site-visuals image path is required.");

  const expectedType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[match[2]];
  if (body.contentType !== expectedType) throw new HttpError(400, "The image type does not match its file extension.");

  let base64 = typeof body.base64 === "string" ? body.base64.trim() : "";
  base64 = base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, "Image data is not valid base64.");
  if (Math.floor((base64.length * 3) / 4) > MAX_IMAGE_BYTES) throw new HttpError(413, "Image must be 5 MB or smaller.");

  const existing = await githubGetFile(env, path);
  const result = await githubPutFile(
    env,
    path,
    base64,
    existing?.sha,
    existing ? `Replace website visual ${match[1]}` : `Add website visual ${match[1]}`
  );
  const activity = await appendActivity(env, {
    type: "visual.upload",
    message: `Uploaded replacement visual ${path}.`,
    commit: result.commit?.sha || null
  });
  return jsonResponse(request, env, 200, {
    ok: true,
    message: "Website visual uploaded to GitHub.",
    path,
    commit: result.commit?.sha || null,
    activity
  });
}

function validateSiteContent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Site content must be an object.");
  if (!Array.isArray(input.visuals)) throw new HttpError(400, "visuals must be an array.");
  if (input.visuals.length > 100) throw new HttpError(400, "A maximum of 100 website visuals is allowed.");

  const seenIds = new Set();
  const visuals = input.visuals.map((visual, index) => {
    if (!visual || typeof visual !== "object" || Array.isArray(visual)) throw new HttpError(400, `Visual ${index + 1} is invalid.`);
    const id = cleanText(visual.id, 80, `Visual ${index + 1} id`).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw new HttpError(400, `Visual ${index + 1} has an invalid id.`);
    if (seenIds.has(id)) throw new HttpError(400, `Duplicate visual id: ${id}`);
    seenIds.add(id);

    const page = cleanText(visual.page, 100, `${id} page`);
    if (!/^[a-z0-9][a-z0-9-]*\.html$/i.test(page)) throw new HttpError(400, `${id} has an invalid page.`);
    const assetPath = cleanAssetPath(visual.assetPath, `${id} asset path`);
    const defaultAssetPath = cleanAssetPath(visual.defaultAssetPath, `${id} default asset path`);
    const fit = ["inherit", "contain", "cover", "fill", "none", "scale-down"].includes(visual.fit) ? visual.fit : "inherit";
    const labels = Array.isArray(visual.labels)
      ? visual.labels.slice(0, 20).map((label) => cleanOptionalText(label, 80)).filter(Boolean)
      : [];

    return {
      id,
      name: cleanOptionalText(visual.name, 120) || id,
      page,
      assetPath,
      defaultAssetPath: defaultAssetPath || assetPath,
      imageSelector: cleanOptionalText(visual.imageSelector, 500),
      alt: cleanOptionalText(visual.alt, 220),
      note: cleanOptionalText(visual.note, 300),
      fit,
      positionX: clampInteger(visual.positionX, 50, 0, 100),
      positionY: clampInteger(visual.positionY, 50, 0, 100),
      active: visual.active !== false,
      labels
    };
  });

  return {
    version: 2,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    visuals
  };
}

function cleanAssetPath(value, label) {
  const path = cleanOptionalText(value, 240);
  if (!path) return "";
  if (path.includes("..") || path.startsWith("/") || path.startsWith("//") || /^[a-z]+:/i.test(path)) {
    throw new HttpError(400, `${label} is unsafe.`);
  }
  if (!/^[a-zA-Z0-9_./-]+\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path)) {
    throw new HttpError(400, `${label} must point to an image file.`);
  }
  return path;
}

async function getSiteControl(request, env) {
  const published = normalizeSiteControl(await readJsonOrDefault(env, SITE_FILE, defaultSiteControl()));
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
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) throw new HttpError(400, "config must be an object.");
  let submitted = body.config;
  // Older admin clients must not erase the new TEL and client content.
  if (!Object.prototype.hasOwnProperty.call(submitted, "brandSite") || (Array.isArray(submitted.careers?.vacancies) && submitted.careers.vacancies.some(vacancy => vacancy && typeof vacancy === "object" && !Object.prototype.hasOwnProperty.call(vacancy, "venture")))) {
    const published = await readJsonOrDefault(env, SITE_FILE, defaultSiteControl());
    const previous = await readJsonOrDefault(env, SITE_DRAFT_FILE, published);
    submitted = { ...submitted, brandSite: submitted.brandSite || previous.brandSite || TELBrandModel.defaults() };
    if (Array.isArray(submitted.careers?.vacancies)) {
      submitted.careers = { ...submitted.careers, vacancies: submitted.careers.vacancies.map(vacancy => {
        if (!vacancy || typeof vacancy !== "object" || Array.isArray(vacancy)) return vacancy;
        return { ...vacancy, venture: vacancy.venture ?? previous.careers?.vacancies?.find(saved => saved.id === vacancy.id)?.venture ?? "both" };
      }) };
    }
  }
  const draft = normalizeSiteControl(validateSiteControl(submitted));
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
  const openRoles = config.careers?.vacancies?.filter((vacancy) => vacancy.active !== false) || [];
  const openPositions = openRoles.reduce((total, vacancy) => total + vacancy.openings, 0);
  if (openRoles.length) {
    parts.push(`${openRoles.length} career role${openRoles.length === 1 ? "" : "s"} / ${openPositions} position${openPositions === 1 ? "" : "s"} open`);
  } else if (config.careers?.generalApplicationsOpen) {
    parts.push("general career applications open");
  }
  const hidden = Object.entries(config.visibility || {}).filter(([, visible]) => visible === false).length;
  if (hidden) parts.push(`${hidden} homepage section${hidden === 1 ? "" : "s"} hidden`);
  return parts.length ? `Published site controls: ${parts.join(", ")}.` : "Published site controls.";
}
function validateSiteControl(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "config must be an object.");
  const config = normalizeSiteControl(input);
  try { config.brandSite = TELBrandModel.validate(input.brandSite ?? TELBrandModel.defaults()); } catch (error) { throw new HttpError(400, error.message || "Invalid TEL content."); }
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

  const c = config.careers;
  c.applicationEmail = cleanOptionalText(c.applicationEmail, 200).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.applicationEmail)) {
    throw new HttpError(400, "Careers needs a valid application email address.");
  }
  if (!Array.isArray(c.vacancies) || c.vacancies.length > 30) {
    throw new HttpError(400, "Careers can contain up to 30 vacancies.");
  }
  const seenVacancyIds = new Set();
  c.vacancies = c.vacancies.map((vacancy, index) => {
    if (!vacancy || typeof vacancy !== "object" || Array.isArray(vacancy)) {
      throw new HttpError(400, `Opening ${index + 1} is invalid.`);
    }
    if (!["education", "temark", "both"].includes(vacancy.venture)) throw new HttpError(400, `Opening ${index + 1} needs a valid venture.`);
    const role = cleanText(vacancy.role, 120, `Opening ${index + 1} role title`);
    const department = cleanText(vacancy.department, 100, `Opening ${index + 1} department`);
    const description = cleanText(vacancy.description, 500, `Opening ${index + 1} description`);
    const numericOpenings = Number(vacancy.openings);
    if (!Number.isInteger(numericOpenings) || numericOpenings < 1 || numericOpenings > 99) {
      throw new HttpError(400, `Opening ${index + 1} needs a vacant-position count from 1 to 99.`);
    }
    let id = cleanOptionalText(vacancy.id, 80).toLowerCase() || slugify(role) || `opening-${index + 1}`;
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw new HttpError(400, `Opening ${index + 1} has an invalid id.`);
    if (seenVacancyIds.has(id)) throw new HttpError(400, `Duplicate opening id: ${id}`);
    seenVacancyIds.add(id);
    return {
      id,
      role,
      venture: vacancy.venture,
      department,
      description,
      location: cleanOptionalText(vacancy.location, 100),
      openings: numericOpenings,
      active: vacancy.active !== false,
      order: clampInteger(vacancy.order, index + 1, 1, 999)
    };
  }).sort((left, right) => left.order - right.order);
  return config;
}
function normalizeSiteControl(input) {
  const defaults = defaultSiteControl();
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const visibility = { ...defaults.visibility };
  for (const key of Object.keys(visibility)) visibility[key] = source.visibility?.[key] !== false;
  const sourceCareers = source.careers && typeof source.careers === "object" && !Array.isArray(source.careers)
    ? source.careers
    : {};
  const vacancies = Array.isArray(sourceCareers.vacancies)
    ? sourceCareers.vacancies.map((vacancy, index) => normalizeVacancy(vacancy, index)).sort((left, right) => left.order - right.order)
    : [];
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    publishedAt: typeof source.publishedAt === "string" ? source.publishedAt : null,
    announcement: { ...defaults.announcement, ...(source.announcement && typeof source.announcement === "object" ? source.announcement : {}), enabled: source.announcement?.enabled === true },
    maintenance: { ...defaults.maintenance, ...(source.maintenance && typeof source.maintenance === "object" ? source.maintenance : {}), enabled: source.maintenance?.enabled === true },
    careers: {
      applicationEmail: typeof sourceCareers.applicationEmail === "string" ? sourceCareers.applicationEmail : defaults.careers.applicationEmail,
      generalApplicationsOpen: sourceCareers.generalApplicationsOpen !== false,
      vacancies
    },
    brandSite: TELBrandModel.normalize(source.brandSite),
    visibility
  };
}
function normalizeVacancy(vacancy, index) {
  const source = vacancy && typeof vacancy === "object" && !Array.isArray(vacancy) ? vacancy : {};
  return {
    id: typeof source.id === "string" ? source.id : `opening-${index + 1}`,
    role: typeof source.role === "string" ? source.role : "",
    venture: typeof source.venture === "string" ? source.venture : "both",
    department: typeof source.department === "string" ? source.department : "",
    description: typeof source.description === "string" ? source.description : "",
    location: typeof source.location === "string" ? source.location : "",
    openings: Number.isFinite(Number(source.openings)) ? Number(source.openings) : 1,
    active: source.active !== false,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1
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
async function githubGetFile(env, path, options={}) {
  const url=`${githubContentUrl(env,path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const headers=githubHeaders(env);
  let response=await fetch(url,{headers});
  let publishingReady=true;
  if(response.status===401&&path===TEAM_FILE){
    if(options.allowPublicTeamFallback===true){
      // Use the public raw host, avoiding the shared anonymous API rate limit.
      // This exact Team read is the only unauthenticated fallback; writes never use it.
      const rawUrl=`https://raw.githubusercontent.com/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/${encodeURIComponent(env.GITHUB_BRANCH)}/${TEAM_FILE}`;
      const raw=await fetch(rawUrl,{headers:{Accept:"application/json"}});
      if(raw.status===404)return {missing:true,publishingReady:false};
      if(!raw.ok)throw new HttpError(502,"The public Team data could not be read.");
      const reader=raw.body.getReader(),chunks=[];let length=0;
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_JSON_BYTES){await reader.cancel();throw new HttpError(502,"The public Team data is too large.");}chunks.push(value);}
      const content=new Uint8Array(length);let offset=0;
      for(const chunk of chunks){content.set(chunk,offset);offset+=chunk.byteLength;}
      const header=encoder.encode(`blob ${length}\0`),blob=new Uint8Array(header.byteLength+length);blob.set(header);blob.set(content,header.byteLength);
      const digest=new Uint8Array(await crypto.subtle.digest("SHA-1",blob));
      return {sha:Array.from(digest,b=>b.toString(16).padStart(2,"0")).join(""),text:decoder.decode(content),publishingReady:false};
    }else if(options.requireTeamPublishing===true){
      throw new HttpError(503,"Publishing is unavailable. Renew the website GitHub credential before saving Team changes.");
    }
  }
  if(response.status===404)return publishingReady?null:{missing:true,publishingReady:false};
  const data=await readGitHubResponse(response);
  if(Array.isArray(data)||data.type!=="file"||typeof data.content!=="string")throw new HttpError(502,`GitHub did not return a file for ${path}.`);
  return {sha:data.sha,text:decoder.decode(base64ToBytes(data.content.replace(/\s/g,""))),publishingReady};
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
