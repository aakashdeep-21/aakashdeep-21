#!/usr/bin/env node
/**
 * Generates a GitHub stats card as a static SVG.
 *
 * Runs in GitHub Actions, writes to dist/stats.svg, and the workflow
 * commits the result. No server, no cold starts, no shared rate limit.
 *
 * Env:
 *   GH_TOKEN  - a token with public_repo / read:user scope
 *   GH_USER   - the username to profile
 *   THEME     - "midnight" (default) or "daylight"
 */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.GH_USER;
const THEME = process.env.THEME || "midnight";

if (!TOKEN || !USER) {
  console.error("Missing GH_TOKEN or GH_USER.");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Theme tokens                                                        */
/* ------------------------------------------------------------------ */

const THEMES = {
  midnight: {
    bg: "#171c28",
    surface: "#1f2430",
    rule: "#2a3140",
    dim: "#707a8c",
    text: "#cbccc6",
    bright: "#ffffff",
    amber: "#ffcc66",
    cyan: "#5ccfe6",
    // contribution ramp: cool at low volume, gold at your best days
    ramp: ["#232834", "#2d5a63", "#3d8f9e", "#5ccfe6", "#ffcc66"],
  },
  daylight: {
    bg: "#fafafa",
    surface: "#f0f0ef",
    rule: "#e0e0dd",
    dim: "#8a8f98",
    text: "#3b4048",
    bright: "#1a1d21",
    amber: "#e6a700",
    cyan: "#2b9eb8",
    ramp: ["#eaeaea", "#c4e3ea", "#7fc4d6", "#3ba3bd", "#e6a700"],
  },
};

const T = THEMES[THEME] || THEMES.midnight;

/* ------------------------------------------------------------------ */
/* GitHub GraphQL                                                      */
/* ------------------------------------------------------------------ */

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "self-hosted-stats-card",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const PROFILE_QUERY = `
  query ($login: String!, $after: String) {
    user(login: $login) {
      name
      login
      avatarUrl(size: 120)
      followers { totalCount }
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { contributionCount date }
          }
        }
      }
      repositories(
        first: 100
        after: $after
        ownerAffiliations: OWNER
        isFork: false
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        totalCount
        nodes {
          name
          stargazerCount
          forkCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

async function collect() {
  let after = null;
  let user = null;
  const repos = [];

  // Paginate through every owned, non-fork repo.
  do {
    const data = await gql(PROFILE_QUERY, { login: USER, after });
    if (!data.user) throw new Error(`No such user: ${USER}`);
    user = user || data.user;
    repos.push(...data.user.repositories.nodes);
    after = data.user.repositories.pageInfo.hasNextPage
      ? data.user.repositories.pageInfo.endCursor
      : null;
  } while (after);

  const c = user.contributionsCollection;

  const stars = repos.reduce((n, r) => n + r.stargazerCount, 0);
  const forks = repos.reduce((n, r) => n + r.forkCount, 0);

  // Aggregate language bytes across every repo.
  const langBytes = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      const prev = langBytes.get(node.name) || { size: 0, color: node.color };
      prev.size += size;
      langBytes.set(node.name, prev);
    }
  }

  const totalBytes = [...langBytes.values()].reduce((n, l) => n + l.size, 0) || 1;
  const languages = [...langBytes.entries()]
    .map(([name, l]) => ({
      name,
      color: l.color || T.dim,
      pct: (l.size / totalBytes) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);

  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays);

  // Inline the avatar so the SVG has zero external dependencies.
  let avatar = null;
  try {
    const img = await fetch(user.avatarUrl);
    if (img.ok) {
      const buf = Buffer.from(await img.arrayBuffer());
      const mime = img.headers.get("content-type") || "image/png";
      avatar = `data:${mime};base64,${buf.toString("base64")}`;
    }
  } catch {
    // Avatar is a nicety, not a requirement — carry on without it.
  }

  return {
    name: user.name || user.login,
    login: user.login,
    avatar,
    followers: user.followers.totalCount,
    repoCount: repos.length,
    stars,
    forks,
    commits: c.totalCommitContributions + c.restrictedContributionsCount,
    prs: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
    reviews: c.totalPullRequestReviewContributions,
    totalContributions: c.contributionCalendar.totalContributions,
    weeks: c.contributionCalendar.weeks,
    days,
    languages,
    streak: computeStreak(days),
  };
}

/* ------------------------------------------------------------------ */
/* Derived metrics                                                     */
/* ------------------------------------------------------------------ */

function computeStreak(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);

  let current = 0;
  let longest = 0;
  let run = 0;

  for (const d of sorted) {
    if (d.contributionCount > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  // Current streak: walk backwards, tolerating an empty today
  // (the day isn't over yet).
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i];
    if (d.contributionCount > 0) {
      current += 1;
    } else if (d.date === today) {
      continue;
    } else {
      break;
    }
  }

  return { current, longest };
}

/* ------------------------------------------------------------------ */
/* SVG rendering                                                       */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );

const fmt = (n) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");

function rampColor(count, max) {
  if (count === 0) return T.ramp[0];
  const q = count / Math.max(max, 1);
  if (q > 0.75) return T.ramp[4];
  if (q > 0.45) return T.ramp[3];
  if (q > 0.2) return T.ramp[2];
  return T.ramp[1];
}

function render(d) {
  const W = 820;
  const PAD = 34;
  const inner = W - PAD * 2;

  /* --- contribution grid geometry --- */
  const weeks = d.weeks.slice(-53);
  const gap = 3;
  const cell = Math.floor((inner - (weeks.length - 1) * gap) / weeks.length);
  const gridH = cell * 7 + gap * 6;
  const maxDay = Math.max(...d.days.map((x) => x.contributionCount), 1);

  let gridY = 0; // filled in below
  const H = 400;

  /* --- primary stat row --- */
  const stats = [
    { value: fmt(d.totalContributions), label: "contributions", accent: T.amber },
    { value: fmt(d.stars), label: "stars earned", accent: T.cyan },
    { value: fmt(d.prs), label: "pull requests", accent: T.cyan },
    { value: fmt(d.repoCount), label: "repositories", accent: T.cyan },
    { value: fmt(d.streak.current), label: "day streak", accent: T.amber },
  ];

  const colW = inner / stats.length;

  const statsSvg = stats
    .map((s, i) => {
      const x = PAD + colW * i;
      return `
    <text x="${x}" y="126" class="stat-num" fill="${s.accent}">${esc(s.value)}</text>
    <text x="${x}" y="146" class="stat-label">${esc(s.label)}</text>`;
    })
    .join("");

  /* --- contribution grid --- */
  gridY = 190;
  const gridSvg = weeks
    .map((week, wi) =>
      week.contributionDays
        .map((day) => {
          const di = new Date(day.date + "T00:00:00Z").getUTCDay();
          const x = PAD + wi * (cell + gap);
          const y = gridY + di * (cell + gap);
          return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${rampColor(
            day.contributionCount,
            maxDay
          )}"><title>${day.date}: ${day.contributionCount}</title></rect>`;
        })
        .join("")
    )
    .join("");

  /* --- language bar --- */
  const barY = gridY + gridH + 46;
  const top = d.languages.slice(0, 6);
  const otherPct = 100 - top.reduce((n, l) => n + l.pct, 0);

  let cursor = PAD;
  const segments = top
    .map((l) => {
      const w = (l.pct / 100) * inner;
      const seg = `<rect x="${cursor.toFixed(2)}" y="${barY}" width="${w.toFixed(
        2
      )}" height="9" fill="${l.color}"><title>${esc(l.name)} ${l.pct.toFixed(
        1
      )}%</title></rect>`;
      cursor += w;
      return seg;
    })
    .join("");

  const otherSeg =
    otherPct > 0.5
      ? `<rect x="${cursor.toFixed(2)}" y="${barY}" width="${(
          (otherPct / 100) *
          inner
        ).toFixed(2)}" height="9" fill="${T.rule}" />`
      : "";

  /* --- language legend, two rows of three --- */
  const legend = top
    .map((l, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = PAD + col * (inner / 3);
      const y = barY + 34 + row * 22;
      // Percentages sit in a fixed column so they read as a table, not prose.
      const pctX = x + inner / 3 - 26;
      return `
    <circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${l.color}" />
    <text x="${x + 16}" y="${y}" class="legend">${esc(l.name)}</text>
    <text x="${pctX}" y="${y}" class="legend-pct" text-anchor="end">${l.pct.toFixed(
        1
      )}%</text>`;
    })
    .join("");

  const totalH = barY + 34 + 22 * Math.ceil(top.length / 3) + 24;

  /* --- secondary line --- */
  const secondary = [
    `${fmt(d.commits)} commits`,
    `${fmt(d.reviews)} reviews`,
    `${fmt(d.issues)} issues`,
    `${fmt(d.forks)} forks`,
    `${fmt(d.followers)} followers`,
  ].join("   ·   ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" role="img" aria-label="GitHub statistics for ${esc(
    d.login
  )}">
  <style>
    .mono { font-family: ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Menlo, Consolas, monospace; }
    text { font-family: ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Menlo, Consolas, monospace; }
    .name      { font-size: 21px; font-weight: 700; fill: ${T.bright}; letter-spacing: -0.3px; }
    .handle    { font-size: 12px; fill: ${T.dim}; }
    .stat-num  { font-size: 27px; font-weight: 700; letter-spacing: -0.8px; font-variant-numeric: tabular-nums; }
    .stat-label{ font-size: 10px; fill: ${T.dim}; letter-spacing: 0.6px; }
    .eyebrow   { font-size: 9.5px; fill: ${T.dim}; letter-spacing: 1.4px; }
    .legend    { font-size: 11px; fill: ${T.text}; }
    .legend-pct{ font-size: 11px; fill: ${T.dim}; font-variant-numeric: tabular-nums; }
    .meta      { font-size: 10.5px; fill: ${T.dim}; letter-spacing: 0.2px; }
  </style>

  <rect width="${W}" height="${totalH}" rx="14" fill="${T.bg}" />
  <rect width="${W}" height="${totalH}" rx="14" fill="none" stroke="${T.rule}" stroke-width="1" />

  <!-- header -->
  <text x="${PAD}" y="52" class="name">${esc(d.name)}</text>
  <text x="${PAD}" y="70" class="handle">@${esc(d.login)}</text>

  ${
    d.avatar
      ? `<clipPath id="avaclip"><circle cx="${W - PAD - 22}" cy="52" r="22" /></clipPath>
  <image href="${d.avatar}" x="${W - PAD - 44}" y="30" width="44" height="44" clip-path="url(#avaclip)" preserveAspectRatio="xMidYMid slice" />
  <circle cx="${W - PAD - 22}" cy="52" r="22.5" fill="none" stroke="${T.rule}" stroke-width="1" />`
      : ""
  }

  <line x1="${PAD}" y1="90" x2="${W - PAD}" y2="90" stroke="${T.rule}" stroke-width="1" />

  <!-- headline stats -->
  ${statsSvg}

  <!-- contribution grid -->
  <text x="${PAD}" y="${gridY - 14}" class="eyebrow">LAST 12 MONTHS · LONGEST STREAK ${d.streak.longest} DAYS</text>
  ${gridSvg}

  <!-- language distribution -->
  <text x="${PAD}" y="${barY - 14}" class="eyebrow">LANGUAGE DISTRIBUTION BY BYTES</text>
  <clipPath id="barclip"><rect x="${PAD}" y="${barY}" width="${inner}" height="9" rx="4.5" /></clipPath>
  <g clip-path="url(#barclip)">${segments}${otherSeg}</g>
  ${legend}

  <!-- footer meta -->
  <text x="${PAD}" y="${totalH - 16}" class="meta">${esc(secondary)}</text>
  <text x="${W - PAD}" y="${totalH - 16}" class="meta" text-anchor="end">updated ${new Date()
    .toISOString()
    .slice(0, 10)}</text>
</svg>`;
}

/* ------------------------------------------------------------------ */

(async () => {
  const data = await collect();
  const svg = render(data);

  const outDir = path.join(process.cwd(), "dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `stats-${THEME}.svg`), svg);

  console.log(
    `Wrote dist/stats-${THEME}.svg — ${data.repoCount} repos, ` +
      `${data.stars} stars, ${data.totalContributions} contributions, ` +
      `${data.languages.length} languages.`
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
