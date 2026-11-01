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
    careers: {
      applicationEmail: "techforeasylife.operations@gmail.com",
      generalApplicationsOpen: true,
      vacancies: [],
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
  let careerFilter = "all";
  let careerQuery = "";
  const ventureNames = { education: "TEL Education", temark: "TeMark", both: "TEL Education + TeMark" };

  loadStyles();
  loadVisualRuntime();
  window.addEventListener("message", handlePreviewMessage);
  loadPublishedConfig();
  document.querySelectorAll('[data-career-filter], [data-career-track]').forEach(button => button.addEventListener('click', () => {
    careerFilter = button.dataset.careerFilter || button.dataset.careerTrack;
    if (currentConfig) applyCareers(currentConfig.careers);
  }));
  document.querySelector('[data-career-search]')?.addEventListener('input', event => {
    careerQuery = event.target.value.trim().toLowerCase();
    if (currentConfig) applyCareers(currentConfig.careers);
  });

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
    if (event.source !== window.parent || (!globalThis.TEL_LOCAL_DEMO && (!isAdminPreview || event.origin !== location.origin))) return;
    if (!event.data || event.data.type !== "TEL_ADMIN_PREVIEW" || !event.data.config) return;
    applyConfig(mergeConfig(event.data.config));
  }

  function mergeConfig(input) {
    const safe = input && typeof input === "object" ? input : {};
    const careers = safe.careers && typeof safe.careers === "object" ? safe.careers : {};
    return {
      ...DEFAULTS,
      ...safe,
      announcement: { ...DEFAULTS.announcement, ...(safe.announcement || {}) },
      maintenance: { ...DEFAULTS.maintenance, ...(safe.maintenance || {}) },
      careers: {
        ...DEFAULTS.careers,
        ...careers,
        generalApplicationsOpen: careers.generalApplicationsOpen !== false,
        vacancies: Array.isArray(careers.vacancies) ? careers.vacancies.map(normalizeVacancy) : [],
      },
      visibility: { ...DEFAULTS.visibility, ...(safe.visibility || {}) },
    };
  }

  function applyConfig(config) {
    currentConfig = config;
    applyVisibility(config.visibility);
    applyAnnouncement(config.announcement);
    applyCareers(config.careers);
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
      hero: document.querySelector(".telh-hero, .telv-hero, .home-hero"),
      signalStrip: document.querySelector(".telv-principles, .signal-strip"),
      quickStart: document.querySelector(".quick-start"),
      mission: document.querySelector(".telh-purpose") || allSections.find((section) => section.classList.contains("split-section")) || null,
      flagship: document.querySelector(".telv-venture-grid, .project-grid")?.closest("section") || null,
      pathway: document.querySelector(".pathway")?.closest("section") || null,
      safety: document.querySelector(".safety-teaser"),
      leadership: document.querySelector(".telv-leadership, .team-teaser")?.closest("section"),
      careers: document.querySelector(".telv-career-row, .home-discover-grid")?.closest("section"),
      finalCta: document.querySelector("main > .telv-final, main > .final-cta"),
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
    const signal = document.querySelector(".telv-principles, .signal-strip");
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

  function normalizeVacancy(vacancy, index) {
    const source = vacancy && typeof vacancy === "object" ? vacancy : {};
    const openings = Number.isFinite(Number(source.openings)) ? Math.round(Number(source.openings)) : 1;
    return {
      id: String(source.id || `vacancy-${index + 1}`).slice(0, 60),
      role: String(source.role || "").trim().slice(0, 120),
      venture: ["education", "temark", "both"].includes(source.venture) ? source.venture : "both",
      department: String(source.department || "").trim().slice(0, 100),
      description: String(source.description || "").trim().slice(0, 500),
      location: String(source.location || "").trim().slice(0, 100),
      openings: Math.min(99, Math.max(1, openings)),
      active: source.active !== false,
    };
  }

  function applyCareers(careers) {
    if (document.body.dataset.page !== "careers") return;
    const email = isSafeEmail(careers.applicationEmail) ? careers.applicationEmail.trim() : DEFAULTS.careers.applicationEmail;
    const all = (Array.isArray(careers.vacancies) ? careers.vacancies : []).map(normalizeVacancy)
      .filter(vacancy => vacancy.active && vacancy.role && vacancy.department && vacancy.description);
    const vacancies = all.filter(vacancy => (careerFilter === 'all' || vacancy.venture === 'both' || vacancy.venture === careerFilter)
      && (!careerQuery || [vacancy.role, vacancy.department, vacancy.description, vacancy.location].join(' ').toLowerCase().includes(careerQuery)));
    const positions = vacancies.reduce((total, vacancy) => total + vacancy.openings, 0);
    document.querySelectorAll('[data-career-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.careerFilter === careerFilter)));
    document.querySelectorAll('[data-career-role-count]').forEach(node => node.textContent = String(vacancies.length));
    document.querySelectorAll('[data-career-position-count]').forEach(node => node.textContent = String(positions));
    const summary = document.querySelector('[data-career-board-summary]');
    if (summary) summary.textContent = vacancies.length
      ? `${vacancies.length} open role${vacancies.length === 1 ? '' : 's'} · ${positions} position${positions === 1 ? '' : 's'} · ${careerFilter === 'all' ? 'Across TEL Education & TeMark' : ventureNames[careerFilter]}`
      : (careerQuery ? 'No roles match your search. Try another skill or department.' : 'No specific role is listed for this venture right now.');
    const board = document.querySelector('[data-career-board]');
    if (board) {
      board.replaceChildren(...vacancies.map((vacancy,index) => createVacancyCard(vacancy,index,email)));
      if (!vacancies.length) board.append(createCareerEmptyState(careers.generalApplicationsOpen,email));
    }
    const generalSection = document.querySelector('[data-general-application-section]');
    if (generalSection) generalSection.hidden = !careers.generalApplicationsOpen;
    document.querySelectorAll('[data-general-application]').forEach(link => link.href = createGeneralApplicationLink(email));
  }

  function createVacancyCard(vacancy,index,email) {
    const card=document.createElement('article');card.className='career-vacancy-card telv-job';card.dataset.venture=vacancy.venture;
    const number=document.createElement('span');number.className='career-vacancy-index';number.textContent=String(index+1).padStart(2,'0');
    const main=document.createElement('div');main.className='career-vacancy-main';
    const department=document.createElement('span');department.textContent=ventureNames[vacancy.venture]+' / '+vacancy.department;
    const title=document.createElement('h3');title.textContent=vacancy.role;
    const meta=document.createElement('div');meta.className='career-vacancy-meta';
    if(vacancy.location){const location=document.createElement('span');location.textContent=vacancy.location;meta.append(location);}
    const details=document.createElement('details');details.className='telv-job-details';
    const summary=document.createElement('summary');summary.textContent="What you’ll do";
    const description=document.createElement('p');description.textContent=vacancy.description;details.append(summary,description);
    main.append(department,title,meta,details);
    const action=document.createElement('div');action.className='career-vacancy-action';
    const count=document.createElement('span');count.className='career-vacancy-count';count.textContent=`${vacancy.openings} ${vacancy.openings===1?'position':'positions'}`;
    const link=document.createElement('a');link.className='telv-button primary career-apply-button';link.href=createRoleApplicationLink(email,vacancy);link.textContent='Apply for this role ↗';action.append(count,link);
    card.append(number,main,action);return card;
  }
  function createCareerEmptyState(open,email) {
    const state=document.createElement('div');state.className='telv-job-empty';
    const title=document.createElement('h3');title.textContent=careerQuery?'No matching roles.':'Keep in touch.';
    const message=document.createElement('p');message.textContent=open?'Try another filter, or tell us what you can bring through a general application.':'Please check again for future opportunities.';state.append(title,message);
    if(open){const link=document.createElement('a');link.className='telv-text-link';link.href=createGeneralApplicationLink(email);link.textContent='Send a general application';state.append(link);}return state;
  }
  function applicationVenture(vacancy) {
    return vacancy?.venture && vacancy.venture !== 'both' ? ventureNames[vacancy.venture]
      : careerFilter !== 'all' ? ventureNames[careerFilter] : 'TEL Education / TeMark — please specify';
  }
  function createRoleApplicationLink(email,vacancy) {
    const venture=applicationVenture(vacancy);
    const body=['Hello TEL,','','I would like to apply for the following opening:',`Venture: ${venture}`,`Role: ${vacancy.role}`,`Department: ${vacancy.department}`,`Location / format: ${vacancy.location || 'Not specified'}`,'','Name:','Location and time zone:','Relevant experience:','Portfolio or work samples:','Weekly availability:','Why I am a good fit:',''].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent(venture+' application — '+vacancy.role)}&body=${encodeURIComponent(body)}`;
  }
  function createGeneralApplicationLink(email) {
    const venture=applicationVenture();
    const body=['Hello TEL,','','I would like to send a general application.',`Venture: ${venture}`,'','Name:','Location and time zone:','The contribution I can own:','Relevant skills:','Portfolio or work samples:','Weekly availability:',''].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent('General application — '+venture)}&body=${encodeURIComponent(body)}`;
  }

  function isSafeEmail(value) {
    return typeof value === "string" && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());
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

  function loadVisualRuntime() {
    if (document.querySelector('script[src="site-content-v4.js"]')) return;
    const script = document.createElement("script");
    script.src = "site-content-v4.js";
    script.defer = true;
    document.head.append(script);
  }

  window.TELSiteControl = {
    get config() { return currentConfig; },
    applyPreview(config) { if (isAdminPreview) applyConfig(mergeConfig(config)); },
  };
})();
