"use strict";

(() => {
  const teamSection = document.querySelector("#team");
  if (!teamSection) return;

  const leadershipGrid = teamSection.querySelector(".leadership-grid");
  const teamGrid = teamSection.querySelector(".team-grid");
  if (!leadershipGrid || !teamGrid) return;

  const photoClassById = {
    "humaira-rashid": "team-photo-humaira",
    "maverick-alam": "team-photo-maverick",
    "abhiraj-bhattacharya": "team-photo-abhiraj",
    "tanishka-dhatrak": "team-photo-tanishka"
  };

  const createCard = (member, index) => {
    const article = document.createElement("article");
    article.className = `founder-card with-photo glass-panel reveal visible${index % 3 === 1 ? " delay-1" : index % 3 === 2 ? " delay-2" : ""}`;

    // Older CSS hid the fifth hardcoded team card. Dynamic cards must always be visible.
    article.style.setProperty("display", "flex", "important");

    const label = document.createElement("span");
    label.className = "founder-index";
    label.textContent = member.label || (member.section === "leadership" ? "LEADERSHIP" : "TEAM");

    const photoWrap = document.createElement("div");
    photoWrap.className = "founder-photo";

    const image = document.createElement("img");
    image.src = member.image || "tel-logo.webp";
    image.alt = member.alt || `${member.name || "TEL team member"}, ${member.role || "TEL"}`;
    image.loading = "lazy";
    image.decoding = "async";

    if (photoClassById[member.id]) {
      image.classList.add(photoClassById[member.id]);
    }

    photoWrap.appendChild(image);

    const info = document.createElement("div");
    info.className = "founder-info";

    const name = document.createElement("h3");
    name.textContent = member.name || "TEL team member";

    const role = document.createElement("p");
    role.className = "role";
    role.textContent = member.role || "TEL";

    info.append(name, role);

    if (member.quote) {
      const quote = document.createElement("p");
      quote.className = "team-quote";
      quote.textContent = `“${member.quote}”`;
      info.appendChild(quote);
    }

    article.append(label, photoWrap, info);
    return article;
  };

  const renderMembers = (grid, members) => {
    const fragment = document.createDocumentFragment();
    members.forEach((member, index) => fragment.appendChild(createCard(member, index)));
    grid.replaceChildren(fragment);
  };

  const loadTeam = async () => {
    try {
      const response = await fetch(`data/team.json?v=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) throw new Error(`Team data request failed (${response.status})`);

      const documentData = await response.json();
      const members = Array.isArray(documentData.members)
        ? documentData.members
            .filter((member) => member && member.active !== false)
            .sort((a, b) => Number(a.order || 999) - Number(b.order || 999))
        : [];

      renderMembers(leadershipGrid, members.filter((member) => member.section === "leadership"));
      renderMembers(teamGrid, members.filter((member) => member.section !== "leadership"));
    } catch (error) {
      console.warn("TEL team data could not be loaded. Keeping the built-in fallback cards.", error);
    }
  };

  loadTeam();
})();
