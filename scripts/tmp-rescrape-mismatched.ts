/**
 * Re-scrape college stats for players flagged by the audit as having wrong data.
 * Uses school validation to ensure we get the right person.
 * Tries URL suffixes -1 through -8 for common names.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 6000;
const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const COLLEGE_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');
const AUDIT_FILE = path.join(__dirname, '..', 'data', 'college-audit.json');

interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string;
}

interface CollegeSeason {
  season: string;
  school: string;
  conference: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgPct: number;
  threePtPct: number;
  ftPct: number;
  threePM: number;
  fta: number;
  usageRate: number | null;
  trueShootingPct: number | null;
  boxPlusMinus: number | null;
  winSharesPer40: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspectModel/1.0' },
    }, (res) => {
      if (res.statusCode === 404) { reject(new Error('NOT_FOUND')); return; }
      if (res.statusCode === 429) { reject(new Error('RATE_LIMITED')); return; }
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (location) {
          const redirectUrl = location.startsWith('http') ? location : `https://www.sports-reference.com${location}`;
          fetchPage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP_${res.statusCode}`)); return; }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseNum(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function extractCellValue(html: string, dataStat: string): string {
  const regex = new RegExp(`data-stat="${dataStat}"[^>]*>(?:<[^>]*>)?([^<]*)`);
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

function parseCollegePage(html: string, slug: string, name: string) {
  const seasons: CollegeSeason[] = [];

  const tableMatch = html.match(/<table[^>]*id="players_per_game"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return null;

  const tbodyIdx = tableMatch[1].indexOf('<tbody>');
  const tbodyContent = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx + 7) : tableMatch[1];
  if (!tbodyContent) return null;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  let lastSchool = '';
  let lastConference = '';

  while ((rowMatch = rowRegex.exec(tbodyContent)) !== null) {
    const row = rowMatch[1];
    if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;

    const seasonText = extractCellValue(row, 'year_id');
    if (!seasonText) continue;
    if (seasonText.includes('Yr') || seasonText.includes('yr')) continue;

    const schoolMatch = row.match(/data-stat="team_name_abbr"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    if (schoolMatch && schoolMatch[1].trim()) lastSchool = schoolMatch[1].trim();

    const confMatch = row.match(/data-stat="conf_abbr"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    if (confMatch && confMatch[1].trim()) lastConference = confMatch[1].trim();

    const season: CollegeSeason = {
      season: seasonText.trim(),
      school: lastSchool,
      conference: lastConference,
      gamesPlayed: parseNum(extractCellValue(row, 'games')),
      gamesStarted: parseNum(extractCellValue(row, 'games_started')),
      minutesPerGame: parseNum(extractCellValue(row, 'mp_per_g')),
      pts: parseNum(extractCellValue(row, 'pts_per_g')),
      reb: parseNum(extractCellValue(row, 'trb_per_g')),
      ast: parseNum(extractCellValue(row, 'ast_per_g')),
      stl: parseNum(extractCellValue(row, 'stl_per_g')),
      blk: parseNum(extractCellValue(row, 'blk_per_g')),
      tov: parseNum(extractCellValue(row, 'tov_per_g')),
      fgPct: parseNum(extractCellValue(row, 'fg_pct')),
      threePtPct: parseNum(extractCellValue(row, 'fg3_pct')),
      ftPct: parseNum(extractCellValue(row, 'ft_pct')),
      threePM: parseNum(extractCellValue(row, 'fg3_per_g')),
      fta: parseNum(extractCellValue(row, 'fta_per_g')),
      usageRate: null,
      trueShootingPct: null,
      boxPlusMinus: null,
      winSharesPer40: null,
    };

    seasons.push(season);
  }

  if (seasons.length === 0) return null;

  // Advanced stats
  const advMatch = html.match(/<table[^>]*id="players_advanced"[^>]*>([\s\S]*?)<\/table>/);
  if (advMatch) {
    const advTbodyIdx = advMatch[1].indexOf('<tbody>');
    const advBody = advTbodyIdx >= 0 ? advMatch[1].substring(advTbodyIdx + 7) : advMatch[1];
    if (advBody) {
      let advIdx = 0;
      const advRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
      let advRowMatch;
      while ((advRowMatch = advRowRegex.exec(advBody)) !== null) {
        const row = advRowMatch[1];
        if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;
        const sText = extractCellValue(row, 'year_id');
        if (sText && (sText.includes('Yr') || sText.includes('yr'))) continue;
        if (advIdx < seasons.length) {
          const usg = extractCellValue(row, 'usg_pct');
          const ts = extractCellValue(row, 'ts_pct');
          const bpm = extractCellValue(row, 'bpm');
          const ws40 = extractCellValue(row, 'ws_per_40');
          if (usg) seasons[advIdx].usageRate = parseNum(usg);
          if (ts) seasons[advIdx].trueShootingPct = parseNum(ts);
          if (bpm) seasons[advIdx].boxPlusMinus = parseNum(bpm);
          if (ws40) seasons[advIdx].winSharesPer40 = parseNum(ws40);
        }
        advIdx++;
      }
    }
  }

  const realSeasons = seasons.filter(s => s.season !== 'Career' && !s.season.includes('Yr'));
  const classYear = Math.min(realSeasons.length || seasons.length, 4);
  const lastSeason = realSeasons.length > 0 ? realSeasons[realSeasons.length - 1] : seasons[seasons.length - 1];

  return {
    slug,
    name,
    school: lastSeason.school || lastSchool,
    conference: lastSeason.conference || lastConference,
    classYear,
    seasons,
    teamPTS: null as number | null,
    teamREB: null as number | null,
    teamAST: null as number | null,
  };
}

// School matching with aliases and fuzzy matching
function normalizeSchool(name: string): string {
  return name.trim().toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

const SCHOOL_ALIASES: Record<string, string[]> = {
  'UNC': ['North Carolina'],
  'North Carolina': ['UNC'],
  'UConn': ['Connecticut'],
  'Connecticut': ['UConn'],
  'USC': ['Southern California'],
  'LSU': ['Louisiana State'],
  'SMU': ['Southern Methodist'],
  'BYU': ['Brigham Young'],
  'Brigham Young': ['BYU'],
  'Ole Miss': ['Mississippi'],
  'Pitt': ['Pittsburgh'],
  'Miami (FL)': ['Miami'],
  'Miami': ['Miami (FL)'],
  'UMass': ['Massachusetts'],
  'Louisiana': ['Louisiana–Lafayette', 'Louisiana-Lafayette'],
  "Saint Mary's": ["St. Mary's"],
  "St. Mary's": ["Saint Mary's"],
};

function schoolsMatch(expected: string, scraped: string): boolean {
  if (!expected || !scraped) return false;
  const ne = normalizeSchool(expected);
  const ns = normalizeSchool(scraped);
  if (ne === ns) return true;
  // Strip common suffixes
  const strip = (s: string) => s.replace(/\s+(university|college)$/i, '');
  if (strip(ne) === strip(ns)) return true;
  // Substring match
  if (ne.length > 3 && ns.length > 3 && (ne.includes(ns) || ns.includes(ne))) return true;
  // Aliases
  const aliases = SCHOOL_ALIASES[expected] || [];
  for (const alias of aliases) {
    if (normalizeSchool(alias) === ns) return true;
  }
  return false;
}

async function main() {
  // Load audit mismatches
  const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
  const mismatches: Array<{ slug: string; name: string; year: number; pick: number; expected: string }> = audit.mismatches;

  // Filter to only year mismatches and definite wrong players (skip Damyean Dotson transfer case)
  const toRescrape = mismatches.filter(m => {
    // Damyean Dotson transferred Oregon→Houston, data is correct
    if (m.slug === 'dotsoda01') return false;
    return true;
  });

  // Load draft data to get college info
  const draftMap = new Map<string, DraftEntry>();
  const draftFiles = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.json') && !f.includes('mock'));
  for (const file of draftFiles) {
    const entries: DraftEntry[] = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, file), 'utf-8'));
    for (const e of entries) draftMap.set(e.slug, e);
  }

  console.log(`Re-scraping ${toRescrape.length} mismatched players...\n`);

  let fixed = 0;
  let notFound = 0;
  const failures: string[] = [];

  for (let i = 0; i < toRescrape.length; i++) {
    const m = toRescrape[i];
    const draft = draftMap.get(m.slug);
    if (!draft) { console.log(`  No draft entry for ${m.slug}`); continue; }

    // Skip if already fixed from a previous run
    const existingPath = path.join(COLLEGE_DIR, `${draft.slug}.json`);
    if (fs.existsSync(existingPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
        const existingSchools = (existing.seasons || [])
          .filter((s: any) => s.season !== 'Career')
          .map((s: any) => s.school);
        existingSchools.push(existing.school);
        if (existingSchools.some((s: string) => schoolsMatch(draft.college, s))) {
          console.log(`[${i + 1}/${toRescrape.length}] ${draft.name} — already fixed (${existing.school}) ✓`);
          fixed++;
          continue;
        }
      } catch {}
    }

    console.log(`[${i + 1}/${toRescrape.length}] ${draft.name} (${draft.year} #${draft.pick}) — expected: ${draft.college}`);

    // Build URLs to try
    const parts = draft.name.toLowerCase().split(' ').filter(Boolean);
    const urls: string[] = [];
    if (parts.length >= 2) {
      const first = parts[0].replace(/[^a-z]/g, '');
      const last = parts.slice(1).join('-').replace(/[^a-z-]/g, '');
      for (let n = 1; n <= 8; n++) {
        urls.push(`https://www.sports-reference.com/cbb/players/${first}-${last}-${n}.html`);
      }
    }
    urls.push(`https://www.sports-reference.com/cbb/players/${draft.slug}.html`);

    let found = false;
    for (const url of urls) {
      try {
        const html = await fetchPage(url);
        const data = parseCollegePage(html, draft.slug, draft.name);
        if (data) {
          // Check all season schools + top-level school
          const allSchools = data.seasons.filter(s => s.season !== 'Career').map(s => s.school);
          allSchools.push(data.school);
          const match = allSchools.some(s => schoolsMatch(draft.college, s));

          if (match) {
            const outPath = path.join(COLLEGE_DIR, `${draft.slug}.json`);
            fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
            const real = data.seasons.filter(s => s.season !== 'Career');
            const last = real[real.length - 1];
            console.log(`  ✓ Found at ${url.split('/').pop()}: ${data.school} — ${last?.pts || '?'} PPG, ${last?.ftPct || '?'} FT%`);
            found = true;
            fixed++;
            break;
          } else {
            // Wrong player at this URL, try next
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'NOT_FOUND') continue;
        if (msg === 'RATE_LIMITED') {
          console.log('  Rate limited, waiting 120s...');
          await sleep(120000);
          continue;
        }
      }
      await sleep(DELAY_MS);
    }

    if (!found) {
      console.log(`  ✗ Not found after trying ${urls.length} URLs`);
      notFound++;
      failures.push(`${draft.name} (${draft.year} #${draft.pick}, ${draft.college})`);
    }

    // Extra delay between players
    await sleep(1000);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`RESULTS: Fixed ${fixed}, Not found ${notFound}`);
  if (failures.length > 0) {
    console.log(`\nFailed to find correct data for:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch(console.error);
