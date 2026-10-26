/**
 * Script 2: Scrape College Stats from Basketball-Reference
 * Source: https://www.sports-reference.com/cbb/players/{slug}.html
 * Output: data/raw/college/{player-slug}.json
 * Scope: All drafted players from script 1 (skip international players)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 3000;
const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');

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

interface CollegePlayerData {
  slug: string;
  name: string;
  school: string;
  conference: string;
  classYear: number;
  seasons: CollegeSeason[];
  teamPTS: number | null;
  teamREB: number | null;
  teamAST: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspectModel/1.0',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 404) {
        reject(new Error('NOT_FOUND'));
        return;
      }
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMITED'));
        return;
      }
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (location) {
          // Follow redirect
          const redirectUrl = location.startsWith('http') ? location : `https://www.sports-reference.com${location}`;
          fetchPage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP_${res.statusCode}`));
        return;
      }
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

function parseCollegePage(html: string, slug: string, name: string): CollegePlayerData | null {
  const seasons: CollegeSeason[] = [];

  // Find the per-game stats table
  const tableMatch = html.match(/<table[^>]*id="players_per_game"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return null;

  // Extract tbody — handle missing </tbody> tag
  const tbodyIdx = tableMatch[1].indexOf('<tbody>');
  const tbodyContent = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx + 7) : tableMatch[1];
  if (!tbodyContent) return null;

  // Parse each season row
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  let lastSchool = '';
  let lastConference = '';

  while ((rowMatch = rowRegex.exec(tbodyContent)) !== null) {
    const row = rowMatch[1];
    if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;

    const seasonText = extractCellValue(row, 'year_id');
    if (!seasonText) continue;

    // Skip per-school subtotal rows for transfers (e.g. "Florida (2 Yrs)")
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

  // Try to parse advanced stats table
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

  const realSeasons = seasons.filter((s) => s.season !== 'Career' && !s.season.includes('Yr'));
  const classYear = Math.min(realSeasons.length || seasons.length, 4);
  const lastSeason = realSeasons.length > 0 ? realSeasons[realSeasons.length - 1] : seasons[seasons.length - 1];

  return {
    slug,
    name,
    school: lastSeason.school || lastSchool,
    conference: lastSeason.conference || lastConference,
    classYear,
    seasons,
    teamPTS: null,
    teamREB: null,
    teamAST: null,
  };
}

/**
 * Build the college player slug from their NBA slug.
 * Basketball-Reference uses different slug formats for NBA vs college.
 * We'll try multiple URL patterns.
 */
function getCollegeUrls(nbaSlug: string, name: string): string[] {
  // College Basketball Reference uses "firstname-lastname-N" slug format
  const urls: string[] = [];

  const parts = name.toLowerCase().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].replace(/[^a-z]/g, '');
    const last = parts.slice(1).join('-').replace(/[^a-z-]/g, '');

    // Try suffixes -1 through -6 (common names can have many disambiguations)
    for (let i = 1; i <= 6; i++) {
      urls.push(`https://www.sports-reference.com/cbb/players/${first}-${last}-${i}.html`);
    }
  }

  // Also try the NBA slug directly (sometimes matches)
  urls.push(`https://www.sports-reference.com/cbb/players/${nbaSlug}.html`);

  return urls;
}

// School name normalization for matching draft data against scraped data
const SCHOOL_ALIASES: Record<string, string[]> = {
  'UNC': ['North Carolina'],
  'North Carolina': ['UNC'],
  'UConn': ['Connecticut'],
  'Connecticut': ['UConn'],
  'USC': ['Southern California'],
  'Southern California': ['USC'],
  'LSU': ['Louisiana State'],
  'Louisiana State': ['LSU'],
  'SMU': ['Southern Methodist'],
  'Southern Methodist': ['SMU'],
  'UCF': ['Central Florida'],
  'Central Florida': ['UCF'],
  'UNLV': ['Nevada-Las Vegas'],
  'BYU': ['Brigham Young'],
  'Brigham Young': ['BYU'],
  'Ole Miss': ['Mississippi'],
  'Mississippi': ['Ole Miss'],
  'Pitt': ['Pittsburgh'],
  'Pittsburgh': ['Pitt'],
  'Miami (FL)': ['Miami'],
  'Miami': ['Miami (FL)'],
  'UMass': ['Massachusetts'],
  'Massachusetts': ['UMass'],
  'Louisiana': ['Louisiana–Lafayette', 'Louisiana-Lafayette'],
  'Louisiana–Lafayette': ['Louisiana', 'Louisiana-Lafayette'],
};

function normalizeSchool(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function schoolsMatch(expected: string, scraped: string): boolean {
  if (!expected || !scraped) return false;
  // Direct match (normalized)
  if (normalizeSchool(expected) === normalizeSchool(scraped)) return true;
  // HTML entity cleanup (e.g. Texas A&amp;M → Texas A&M)
  const cleanExpected = expected.replace(/&amp;/g, '&');
  const cleanScraped = scraped.replace(/&amp;/g, '&');
  if (normalizeSchool(cleanExpected) === normalizeSchool(cleanScraped)) return true;
  // Strip common suffixes: "University", "College", "State University"
  const stripSuffix = (s: string) => s.replace(/\s+(University|College)$/i, '');
  if (normalizeSchool(stripSuffix(cleanExpected)) === normalizeSchool(stripSuffix(cleanScraped))) return true;
  // Check aliases
  const aliases = SCHOOL_ALIASES[expected] || [];
  for (const alias of aliases) {
    if (normalizeSchool(alias) === normalizeSchool(scraped)) return true;
  }
  // Substring: "Rutgers University" contains "Rutgers", "Utah State University" contains "Utah State"
  const ne = normalizeSchool(cleanExpected);
  const ns = normalizeSchool(cleanScraped);
  if (ne.length > 3 && ns.length > 3 && (ne.includes(ns) || ns.includes(ne))) return true;
  return false;
}

async function scrapePlayer(
  entry: DraftEntry,
): Promise<CollegePlayerData | null> {
  // Skip international players (no college listed)
  if (!entry.college || entry.college === '' || entry.college === 'None') {
    console.log(`  Skipping ${entry.name} (international/no college)`);
    return null;
  }

  const urls = getCollegeUrls(entry.slug, entry.name);
  const candidates: CollegePlayerData[] = [];

  for (const url of urls) {
    try {
      const html = await fetchPage(url);
      const data = parseCollegePage(html, entry.slug, entry.name);
      if (data) {
        // Check if school matches expected college (including transfers — check all seasons)
        const allSchools = data.seasons
          .filter((s) => s.season !== 'Career')
          .map((s) => s.school);
        const anyMatch = allSchools.some((s) => schoolsMatch(entry.college, s))
          || schoolsMatch(entry.college, data.school);

        if (anyMatch) {
          console.log(`  Found ${entry.name}: ${data.seasons.length} seasons at ${data.school} ✓`);
          return data;
        } else {
          // Wrong player — keep looking
          candidates.push(data);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') continue;
      if (msg === 'RATE_LIMITED') {
        console.log('  Rate limited, waiting 60s...');
        await sleep(60000);
        continue;
      }
    }
    await sleep(DELAY_MS);
  }

  // Log what we found but couldn't match
  if (candidates.length > 0) {
    const tried = candidates.map((c) => c.school).join(', ');
    console.log(`  ✗ No school match for ${entry.name} (expected ${entry.college}, found: ${tried})`);
  } else {
    console.log(`  ✗ Could not find college page for ${entry.name}`);
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load all draft entries
  const draftFiles = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json'));
  const allEntries: DraftEntry[] = [];

  for (const file of draftFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, file), 'utf-8'));
    allEntries.push(...data);
  }

  console.log(`Loaded ${allEntries.length} draft entries from ${draftFiles.length} files`);

  let scraped = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const outPath = path.join(OUTPUT_DIR, `${entry.slug}.json`);

    // Skip if already scraped
    if (fs.existsSync(outPath)) {
      console.log(`  [${i + 1}/${allEntries.length}] Already have ${entry.name}`);
      skipped++;
      continue;
    }

    console.log(`  [${i + 1}/${allEntries.length}] ${entry.name} (${entry.year} #${entry.pick})`);

    const data = await scrapePlayer(entry);
    if (data) {
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      scraped++;
    } else {
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Scraped: ${scraped}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
