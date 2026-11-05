export const levels = ["Ownership", "Executive", "Department leads", "Team members"];

export const authority = [
  {
    id: "founder", level: 0, title: "Founder", personId: "harsh-das", x: -.35, z: 12,
    summary: "Harsh sets TEL’s company-wide direction and holds the primary ownership authority.",
    facts: {
      "Scope": "Company direction, ownership decisions and TeMark oversight.",
      "Can assign": "Set priorities across TEL and direct or redirect TeMark work. Inform the lead when the change affects their work.",
      "Consent": "Get Co-founder consent before deploying Education, Product Development or HR work, except under a documented acting handover."
    }
  },
  {
    id: "cofounder", level: 0, title: "Co-founder", personId: "devangi-das", x: .35, z: -12,
    summary: "Devangi holds the Co-founder role and oversees TEL Education, Product Development and HR.",
    facts: {
      "Scope": "Set priorities for Education, Product Development and HR.",
      "Can assign": "Direct work within that portfolio through the COO and leads.",
      "Consent": "Get Founder consent before assigning work in TeMark or on the Founder side of Finance."
    }
  },
  {
    id: "ceo", level: 1, title: "CEO", personId: "harsh-das", x: -.35, z: 12,
    summary: "As CEO, Harsh turns company direction into operating decisions and delivery priorities.",
    facts: {
      "Scope": "Execute company plans, lead TeMark delivery priorities and resolve escalations.",
      "Can assign": "Set outcomes, deadlines and owners within the Founder’s delegated operating scope.",
      "Works with": "The COO on shared priorities and the relevant owner on work that crosses portfolios."
    }
  },
  {
    id: "coo", level: 1, title: "COO", personId: "devangi-das", x: .35, z: -12,
    summary: "As COO, Devangi runs operations and coordinates delivery across TEL Education, Product Development and HR.",
    facts: {
      "Scope": "Delivery, team coordination, handovers and HR operations.",
      "Can assign": "Delegate daily work inside the Co-founder’s portfolio and confirm owners and deadlines.",
      "Works with": "The CEO on cross-portfolio work and continuity."
    }
  },
  {
    id: "temark", level: 2, title: "TeMark", personId: "tanishka-dhatrak", x: -.75, z: 16,
    summary: "Tanishka leads TeMark’s day-to-day work. The Founder owns its direction and major decisions.",
    facts: {
      "Daily work": "Assign jobs, plan campaigns and client delivery, review output and connect the team.",
      "Escalate": "Bring major commitments and unresolved client or delivery issues to the Founder or CEO.",
      "Cover": "Lead TeMark when both founders are away, within delegated limits."
    }
  },
  {
    id: "finance", level: 2, title: "Finance", personId: "maverick-alam", x: -.25, z: -8,
    summary: "Maverick leads routine finance work and supports both TEL portfolios.",
    facts: {
      "Daily work": "Keep records, review budgets and requests, and route payments for approval.",
      "Escalate": "Ask the relevant portfolio owner about priorities. Send conflicting requests to both founders.",
      "Cover": "Keep approved finance work moving within existing limits."
    }
  },
  {
    id: "education", level: 2, title: "Education / Product", caption: "COO oversight", x: .25, z: -16,
    summary: "TEL Education and Product Development sit in the Co-founder’s portfolio. The COO coordinates delivery.",
    facts: {
      "Daily work": "Coordinate product development, school programmes and education delivery.",
      "Escalate": "Route staffing and priority changes to the Co-founder or acting portfolio owner.",
      "Cover": "The founders designate cover for planned overlap. The chart lists the portfolio without assigning a permanent lead."
    }
  },
  {
    id: "hr", level: 2, title: "HR & Outreach", personId: "humaira-rashid", x: .75, z: 8,
    summary: "Humaira leads HR and Outreach under the Co-founder and connects people across TEL.",
    facts: {
      "Daily work": "Issue announcements, run HR discussions, maintain records and coordinate leave and handovers.",
      "Escalate": "Send issues beyond the HR remit to the Co-founder or another founder if there is a conflict.",
      "Cover": "Keep staff communications and HR operations running when both founders are away."
    }
  }
];

export const assignedPeople = new Map([
  ["harsh-das", { name: "Harsh Das", image: "harsh-das.webp" }],
  ["devangi-das", { name: "Devangi Das", image: "devangi-das.webp" }],
  ["tanishka-dhatrak", { name: "Tanishka Dhatrak", image: "tanishka-dhatrak.png" }],
  ["maverick-alam", { name: "Maverick Alam", image: "maverick-alam-corrected.webp" }],
  ["humaira-rashid", { name: "Humaira Rashid", image: "humaira-rashid.webp" }]
]);

export const reporting = [
  ["founder", "ceo"], ["cofounder", "coo"],
  ["ceo", "temark"], ["ceo", "finance"],
  ["coo", "education"], ["coo", "hr"], ["coo", "finance", "shared"]
];

export const approvals = [
  ["founder", "temark", "direct"], ["founder", "cofounder", "approval"],
  ["cofounder", "founder", "approval"],
  ["cofounder", "education", "direct"], ["cofounder", "hr", "direct"]
];

export const cover = {
  founder: {
    absent: ["founder", "ceo"],
    edges: [["coo", "temark", "acting"], ["coo", "finance", "acting"]],
    copy: "Devangi acts for both portfolios within the recorded handover. The leads continue their regular assignments."
  },
  cofounder: {
    absent: ["cofounder", "coo"],
    edges: [["ceo", "education", "acting"], ["ceo", "hr", "acting"]],
    copy: "Harsh acts for both portfolios within the recorded handover. The leads continue their regular assignments."
  },
  both: {
    absent: ["founder", "cofounder", "ceo", "coo"],
    edges: [["ceo", "temark", "acting"], ["ceo", "finance", "acting"], ["coo", "hr", "acting"]],
    copy: "Tanishka, Maverick and Humaira cover their respective teams. Education follows the named acting owner in the handover. Keep new commitments within existing approvals."
  }
};

export const modeText = {
  reporting: {
    title: "REPORTING",
    copy: "Solid lines show who delegates work. The bottom rail lists members at the same authority level. Project reporting follows the assigned lead.",
    legend: "Reporting and delegated authority",
    legendClass: "legend-reporting",
    second: "Shared Finance support",
    secondClass: "legend-shared"
  },
  approvals: {
    title: "APPROVALS",
    copy: "Each founder can direct work within their own portfolio. Dashed lines between the founders show that assigning work across portfolios needs the other founder’s consent.",
    legend: "Direct assignment",
    second: "Cross-portfolio consent",
    secondClass: "legend-approval"
  },
  cover: {
    title: "ACTING COVER",
    legend: "Temporary operating cover"
  }
};
