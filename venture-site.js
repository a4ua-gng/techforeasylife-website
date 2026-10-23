"use strict";
(() => {
  const CONFIG_URL = "data/ventures.json";
  const page = document.body.dataset.page;
  if (page === "temark") {
    document.querySelector('a[href="temark.html"]')?.classList.add("active");
    document.querySelector('a[href="temark.html"]')?.setAttribute("aria-current", "page");
  }

  if (["product", "schools", "safety"].includes(page)) {
    const bar = document.createElement("div");
    bar.className = "tv-site-note";
    const text = document.createElement("span");
    text.textContent = "TEL Education · Full launch planned for early 2027. ";
    const link = document.createElement("a");
    link.href = "index.html#ventures";
    link.textContent = "Explore TEL's ventures ↗";
    bar.append(text, link);
    document.querySelector(".site-header")?.after(bar);
  }

  const setText = (selector, value) => {
    if (typeof value !== "string") return;
    document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  };
  function renderHeadline(node, value) {
    if (typeof value !== "string" || !value.trim()) return;
    const parts = value.includes("|") ? value.split("|", 2) : value.split(/\.\s+/, 2);
    if (parts.length !== 2) { node.textContent = value; return; }
    const before = parts[0].replace(/\s+$/, "");
    const after = parts[1].trim();
    node.replaceChildren(document.createTextNode(before.endsWith(".") ? before : before + "."), document.createElement("br"));
    const span = document.createElement("span");
    span.className = "tv-highlight";
    span.textContent = after;
    node.append(span);
  }
  function createPortfolioItem(item, index, home = false) {
    if (home) {
      const card = document.createElement("div");
      card.className = "tv-portfolio-pill";
      const title = document.createElement("strong"); title.textContent = item.name || "Business";
      const location = document.createElement("span"); location.textContent = item.location || "";
      card.append(title, location);
      return card;
    }
    const card = document.createElement("article");
    card.className = "tm-case-card";
    const number = document.createElement("span"); number.className = "tm-case-number";
    number.textContent = String(index + 1).padStart(2, "0") + " / " + (item.category || "PORTFOLIO").toUpperCase();
    const content = document.createElement("div");
    const heading = document.createElement("h3"); heading.textContent = item.name || "Business";
    const place = document.createElement("p"); place.textContent = item.location || "";
    content.append(heading, place);
    const note = document.createElement("small"); note.textContent = "Associated business location";
    card.append(number, content, note);
    return card;
  }
  async function loadVentureConfig() {
    try {
      const response = await fetch(CONFIG_URL + "?v=" + Date.now(), {cache:"no-store"});
      if (!response.ok) return;
      const data = await response.json();
      const strings = [
        ["company.eyebrow", data.company?.eyebrow],
        ["company.intro", data.company?.intro],
        ["company.mission", data.company?.mission],
        ["temark.eyebrow", data.temark?.eyebrow],
        ["temark.intro", data.temark?.intro],
        ["temark.statement", data.temark?.statement],
        ["temark.portfolioNote", data.temark?.portfolioNote]
      ];
      strings.forEach(([key,value]) => setText('[data-venture-key="' + key + '"]',value));
      if (data.company?.headline) document.querySelectorAll('[data-venture-key="company.headline"]').forEach(node => renderHeadline(node,data.company.headline));
      if (data.temark?.headline) document.querySelectorAll('[data-venture-key="temark.headline"]').forEach(node => renderHeadline(node,data.temark.headline));
      if (Array.isArray(data.ventures)) data.ventures.forEach(venture => {
        if (!["temark","education"].includes(venture.id)) return;
        setText('[data-venture-status="' + venture.id + '"]', venture.statusLabel);
        setText('[data-venture-name="' + venture.id + '"]', venture.name);
        setText('[data-venture-descriptor="' + venture.id + '"]', venture.descriptor);
        setText('[data-venture-description="' + venture.id + '"]', venture.description);
      });
      if (Array.isArray(data.temark?.portfolio)) {
        const items = data.temark.portfolio.slice(0,30).filter(i => i && typeof i.name === "string");
        const list = document.querySelector("#tm-portfolio-grid");
        if (list) list.replaceChildren(...items.map((it,i)=>createPortfolioItem(it,i)));
        const strip = document.querySelector(".tv-portfolio-logos");
        if (strip) strip.replaceChildren(...items.map((it,i)=>createPortfolioItem(it,i,true)));
      }
      if (Array.isArray(data.temark?.services)) {
        const list = document.querySelector("#tm-services-grid");
        if (list) list.replaceChildren(...data.temark.services.slice(0,12).map((service,i)=>{
          const article=document.createElement("article");article.className="tm-service";
          const no=document.createElement("span");no.className="tm-service-number";no.textContent=String(i+1).padStart(2,"0") + " / SERVICE";
          const content=document.createElement("div"),title=document.createElement("h3"),detail=document.createElement("p");
          title.textContent=service.title||"Service";detail.textContent=service.detail||"";content.append(title,detail);article.append(no,content);return article;
        }));
      }
      if (typeof data.temark?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.temark.email)) {
        document.querySelectorAll('a[href^="mailto:"][href*="teMark%20Creative"]').forEach(link => {
          link.href = "mailto:" + data.temark.email + "?subject=teMark%20Creative%20Services%20Enquiry";
        });
      }
    } catch (error) { console.warn("TEL venture content could not load; displaying page defaults.", error); }
  }
  loadVentureConfig();
})();