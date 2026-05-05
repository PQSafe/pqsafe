#!/usr/bin/env node
// daily-stats.js — Fetches download counters from npm, PyPI, and GitHub.
// Writes output to landing/stats/v1/index.json.
// Requires Node 20+ (built-in fetch). No external dependencies.
// Apache-2.0 © PQSafe

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "landing", "stats", "v1");
const OUT_FILE = join(OUT_DIR, "index.json");

// ── Package lists ──────────────────────────────────────────────────────────

const NPM_PACKAGES = [
  { name: "@pqsafe/openclaw",           postPublish: false },
  { name: "@pqsafe/mcp-server",         postPublish: false },
  { name: "@pqsafe/agent-pay",          postPublish: false },
  { name: "@pqsafe/mastra",             postPublish: false },
  // Planned — will return 404 until published:
  { name: "@pqsafe/agent-pay-langchain",postPublish: true  },
  { name: "@pqsafe/agent-pay-plaid",    postPublish: true  },
  { name: "@pqsafe/conformance",        postPublish: true  },
  { name: "@pqsafe/cli",               postPublish: true  },
];

const PYPI_PACKAGES = [
  "langchain-pqsafe",
  "crewai-pqsafe",
  "pqsafe-agent-pay",
];

const GITHUB_REPO = "PQSafe/pqsafe";

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "pqsafe-stats-bot/1.0", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function zero() {
  return { last_day: 0, last_week: 0, last_month: 0 };
}

// ── npm ────────────────────────────────────────────────────────────────────

async function fetchNpmPackage(pkg) {
  const enc = encodeURIComponent(pkg.name);
  const periods = ["last-day", "last-week", "last-month"];
  const entry = { ...zero(), published: !pkg.postPublish, version: null };

  // Download counts — all three periods in parallel
  const results = await Promise.allSettled(
    periods.map((p) =>
      fetchJSON(`https://api.npmjs.org/downloads/point/${p}/${enc}`)
    )
  );

  if (results[0].status === "rejected" && results[0].reason?.status === 404) {
    // Not yet published
    entry.published = false;
    return entry;
  }

  entry.published = true;
  const keys = ["last_day", "last_week", "last_month"];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      entry[keys[i]] = results[i].value.downloads ?? 0;
    }
  }

  // Grab version from registry (best-effort)
  try {
    const meta = await fetchJSON(
      `https://registry.npmjs.org/${enc}/latest`
    );
    entry.version = meta.version ?? null;
  } catch {
    // non-fatal
  }

  return entry;
}

async function fetchNpm() {
  const results = await Promise.allSettled(
    NPM_PACKAGES.map((pkg) => fetchNpmPackage(pkg))
  );
  const out = {};
  for (let i = 0; i < NPM_PACKAGES.length; i++) {
    const pkg = NPM_PACKAGES[i];
    if (results[i].status === "fulfilled") {
      out[pkg.name] = results[i].value;
    } else {
      console.error(`npm ${pkg.name} failed:`, results[i].reason?.message);
      out[pkg.name] = { ...zero(), published: false, version: null, error: true };
    }
  }
  return out;
}

// ── PyPI ───────────────────────────────────────────────────────────────────

async function fetchPypiPackage(pkg) {
  try {
    const data = await fetchJSON(`https://pypistats.org/api/packages/${pkg}/recent`);
    return {
      last_day:   data.data?.last_day   ?? 0,
      last_week:  data.data?.last_week  ?? 0,
      last_month: data.data?.last_month ?? 0,
      published:  true,
    };
  } catch (e) {
    if (e.status === 404) return { ...zero(), published: false };
    console.error(`PyPI ${pkg} failed:`, e.message);
    return { ...zero(), published: false, error: true };
  }
}

async function fetchPypi() {
  const results = await Promise.allSettled(
    PYPI_PACKAGES.map((pkg) => fetchPypiPackage(pkg))
  );
  const out = {};
  for (let i = 0; i < PYPI_PACKAGES.length; i++) {
    out[PYPI_PACKAGES[i]] = results[i].status === "fulfilled"
      ? results[i].value
      : { ...zero(), published: false, error: true };
  }
  return out;
}

// ── GitHub ─────────────────────────────────────────────────────────────────

async function fetchGitHub() {
  const headers = {};
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const data = await fetchJSON(
      `https://api.github.com/repos/${GITHUB_REPO}`,
      { headers }
    );
    return {
      stars:       data.stargazers_count  ?? 0,
      forks:       data.forks_count       ?? 0,
      open_issues: data.open_issues_count ?? 0,
      url:         `https://github.com/${GITHUB_REPO}`,
    };
  } catch (e) {
    console.error("GitHub fetch failed:", e.message);
    return { stars: 0, forks: 0, open_issues: 0, url: `https://github.com/${GITHUB_REPO}`, error: true };
  }
}

// ── Totals ─────────────────────────────────────────────────────────────────

function computeTotals(npm, pypi) {
  let npm_total_last_month = 0;
  let npm_total_last_week  = 0;
  let npm_total_last_day   = 0;
  let pypi_total_last_month = 0;
  let pypi_total_last_week  = 0;
  let pypi_total_last_day   = 0;

  for (const v of Object.values(npm)) {
    npm_total_last_month += v.last_month ?? 0;
    npm_total_last_week  += v.last_week  ?? 0;
    npm_total_last_day   += v.last_day   ?? 0;
  }
  for (const v of Object.values(pypi)) {
    pypi_total_last_month += v.last_month ?? 0;
    pypi_total_last_week  += v.last_week  ?? 0;
    pypi_total_last_day   += v.last_day   ?? 0;
  }

  return {
    npm_total_last_month,
    npm_total_last_week,
    npm_total_last_day,
    pypi_total_last_month,
    pypi_total_last_week,
    pypi_total_last_day,
    combined_last_month: npm_total_last_month + pypi_total_last_month,
    combined_last_week:  npm_total_last_week  + pypi_total_last_week,
    combined_last_day:   npm_total_last_day   + pypi_total_last_day,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching distribution stats…");

  const [npm, pypi, github] = await Promise.all([
    fetchNpm(),
    fetchPypi(),
    fetchGitHub(),
  ]);

  const totals = computeTotals(npm, pypi);

  const output = {
    updated: new Date().toISOString(),
    npm,
    pypi,
    github,
    totals,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log("Written:", OUT_FILE);
  console.log("Totals  (last month):", totals.combined_last_month, "combined,",
    totals.npm_total_last_month, "npm,", totals.pypi_total_last_month, "PyPI");
  console.log("GitHub  :", github.stars, "stars,", github.forks, "forks,", github.open_issues, "open issues");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
