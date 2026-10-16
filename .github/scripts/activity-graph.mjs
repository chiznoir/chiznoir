// Renders the last DAYS of GitHub contributions as a self-hosted SVG line graph.
// Usage: GITHUB_TOKEN=... node activity-graph.mjs <login> <output.svg>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DAYS = 31;
const [login, outPath] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!login || !outPath || !token) {
  console.error("usage: GITHUB_TOKEN=... node activity-graph.mjs <login> <output.svg>");
  process.exit(2);
}

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const body = await res.json();
if (!res.ok || body.errors || !body.data?.user) {
  throw new Error(`GitHub GraphQL failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`);
}

const days = body.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .slice(-DAYS);

const W = 1200, H = 360;
const pad = { top: 72, right: 40, bottom: 56, left: 64 };
const plotW = W - pad.left - pad.right;
const plotH = H - pad.top - pad.bottom;

const max = Math.max(...days.map((d) => d.contributionCount));
const step = Math.max(1, Math.ceil(max / 4));
const yMax = step * 4;
const total = days.reduce((s, d) => s + d.contributionCount, 0);

const x = (i) => pad.left + (plotW * i) / (days.length - 1);
const y = (v) => pad.top + plotH - (plotH * v) / yMax;
const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);
const fmt = (n) => n.toFixed(1);

const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${fmt(px)} ${fmt(py)}`).join(" ");
const area = `${line} L${fmt(x(days.length - 1))} ${fmt(y(0))} L${fmt(x(0))} ${fmt(y(0))} Z`;

const grid = [0, 1, 2, 3, 4]
  .map((k) => {
    const v = step * k, gy = fmt(y(v));
    return `<line x1="${pad.left}" x2="${W - pad.right}" y1="${gy}" y2="${gy}" class="grid"/>` +
      `<text x="${pad.left - 14}" y="${gy}" class="axis" text-anchor="end" dominant-baseline="middle">${v}</text>`;
  })
  .join("");

const xLabels = days
  .map((d, i) => (i % 5 === 0 || i === days.length - 1)
    ? `<text x="${fmt(x(i))}" y="${H - pad.bottom + 26}" class="axis" text-anchor="middle">${d.date.slice(5).replace("-", "/")}</text>`
    : "")
  .join("");

const points = days
  .map((d, i) => `<circle cx="${fmt(pts[i][0])}" cy="${fmt(pts[i][1])}" r="3.5" class="pt"><title>${d.date}: ${d.contributionCount}</title></circle>`)
  .join("");

const range = `${days[0].date} → ${days[days.length - 1].date}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${login} contributions, last ${DAYS} days: ${total}">
<style>
  text { font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace; }
  .title { fill: #FAFAFA; font-size: 20px; font-weight: 600; }
  .sub { fill: #A1A1AA; font-size: 13px; }
  .axis { fill: #8B8B94; font-size: 12px; }
  .grid { stroke: #27272A; stroke-width: 1; }
  .line { fill: none; stroke: #FB7185; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
  .pt { fill: #121214; stroke: #FDA4AF; stroke-width: 2; }
</style>
<defs>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#E11D48" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#E11D48" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" rx="12" fill="#121214"/>
<text x="${pad.left}" y="38" class="title">Contributions · last ${DAYS} days</text>
<text x="${W - pad.right}" y="38" class="sub" text-anchor="end">${total} total · ${range}</text>
${grid}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" class="line"/>
${points}
${xLabels}
</svg>
`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, svg);
console.log(`wrote ${outPath} (${days.length} days, ${total} contributions)`);
