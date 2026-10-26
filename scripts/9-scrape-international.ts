/**
 * Script 9: Scrape International (Pre-NBA) Stats from Basketball-Reference
 *
 * Two-step process per player:
 *   1. Fetch NBA player page → extract /international/players/{slug}.html link
 *   2. Fetch international page → parse per-game stats table
 *
 * Source: https://www.basketball-reference.com/international/players/{slug}.html
 * Output: data/raw/international/{nba-slug}.json
 * Scope: Drafted players with no college listed (international + prep-to-pro)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 5000;
const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'international');

interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string;
}

interface IntlSeason {
  season: string;
  team: string;
  league: string;
  country: string;
  gamesPlayed: number;
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
}

interface IntlPlayerData {
  slug: string;
  name: string;
  intlSlug: string;
  seasons: IntlSeason[];
  /** Aggregated pre-draft stats (all seasons before NBA draft year) */
  preDraftAvg: {
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
  } | null;
  totalPreDraftGames: number;
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
          const redirectUrl = location.startsWith('http')
            ? location
            : `https://www.basketball-reference.com${location}`;
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
  const regex = new RegExp(`data-stat="${dataStat}"\\s*[^>]*>(?:<[^>]*>)?([^<]*)`);
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

/** Extract the international player page URL from the NBA player page */
function findIntlLink(nbaPageHtml: string): string | null {
  // Links can be absolute or relative
  const match = nbaPageHtml.match(
    /href="(?:https?:\/\/www\.basketball-reference\.com)?(\/international\/players\/[^"]+\.html)"/
  );
  return match ? match[1] : null;
}

/** Parse the international per-game stats table */
function parseIntlPage(
  html: string,
  slug: string,
  name: string,
  draftYear: number
): IntlPlayerData | null {
  const seasons: IntlSeason[] = [];

  // The all-competitions per-game table: id="player-stats-per_game-all-"
  let tableMatch = html.match(
    /<table[^>]*id="player-stats-per_game-all-"[^>]*>([\s\S]*?)<\/table>/
  );
  if (!tableMatch) {
    // Fallback: first table
    tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  }
  if (!tableMatch) return null;

  const tbodyIdx = tableMatch[1].indexOf('<tbody>');
  const tbodyContent = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx + 7) : tableMatch[1];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tbodyContent)) !== null) {
    const row = rowMatch[1];
    if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;

    const seasonText = extractCellValue(row, 'season');
    if (!seasonText || seasonText.includes('Career') || seasonText.includes('Total')) continue;

    const gp = parseNum(extractCellValue(row, 'g'));
    if (gp === 0) continue;

    seasons.push({
      season: seasonText.trim(),
      team: extractCellValue(row, 'team'),
      league: extractCellValue(row, 'league'),
      country: extractCellValue(row, 'country'),
      gamesPlayed: gp,
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
    });
  }

  if (seasons.length === 0) return null;

  // Filter to pre-draft seasons only.
  // Draft year N means the player was drafted in summer of year N.
  // A season like "2017-18" ends in spring 2018 → pre-draft for 2018 draft.
  const preDraftSeasons = seasons.filter((s) => {
    const match = s.season.match(/^(\d{4})-/);
    if (!match) return false;
    const seasonStartYear = parseInt(match[1]);
    // Season "2017-18" → start=2017, ends in 2018 → pre-draft if draftYear >= 2018
    return seasonStartYear < draftYear;
  });

  // Compute weighted average of pre-draft seasons
  let preDraftAvg: IntlPlayerData['preDraftAvg'] = null;
  const totalPreDraftGames = preDraftSeasons.reduce((s, sz) => s + sz.gamesPlayed, 0);

  if (totalPreDraftGames > 0) {
    preDraftAvg = {
      pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
      fgPct: 0, threePtPct: 0, ftPct: 0, threePM: 0,
    };
    for (const s of preDraftSeasons) {
      const w = s.gamesPlayed / totalPreDraftGames;
      preDraftAvg.pts += s.pts * w;
      preDraftAvg.reb += s.reb * w;
      preDraftAvg.ast += s.ast * w;
      preDraftAvg.stl += s.stl * w;
      preDraftAvg.blk += s.blk * w;
      preDraftAvg.tov += s.tov * w;
      preDraftAvg.fgPct += s.fgPct * w;
      preDraftAvg.threePtPct += s.threePtPct * w;
      preDraftAvg.ftPct += s.ftPct * w;
      preDraftAvg.threePM += s.threePM * w;
    }
  }

  // Extract intl slug from the URL we fetched
  const intlSlugMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="[^"]*\/international\/players\/([^"]+)\.html"/);
  const intlSlug = intlSlugMatch ? intlSlugMatch[1] : '';

  return {
    slug,
    name,
    intlSlug,
    seasons: preDraftSeasons, // only keep pre-draft
    preDraftAvg,
    totalPreDraftGames,
  };
}

async function scrapePlayer(
  entry: DraftEntry
): Promise<IntlPlayerData | null> {
  const letter = entry.slug.charAt(0);
  const nbaUrl = `https://www.basketball-reference.com/players/${letter}/${entry.slug}.html`;

  const MAX_RETRIES = 5;

  // Step 1: Fetch NBA page to find international link
  let intlPath: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const nbaHtml = await fetchPage(nbaUrl);
      intlPath = findIntlLink(nbaHtml);
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') {
        // No NBA page — try constructing intl URL from name directly
        const parts = entry.name.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
          .split(' ').filter(Boolean);
        if (parts.length >= 2) {
          const first = parts[0].replace(/[^a-z]/g, '');
          const last = parts.slice(1).join('-').replace(/[^a-z-]/g, '');
          intlPath = `/international/players/${first}-${last}-1.html`;
        }
        break;
      }
      if (msg === 'RATE_LIMITED') {
        const waitTime = 60000 * Math.pow(2, attempt);
        console.log(`  Rate limited on NBA page (attempt ${attempt + 1}), waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      console.error(`  Error fetching NBA page: ${msg}`);
      return null;
    }
  }

  if (!intlPath) {
    console.log(`  No international link found for ${entry.name}`);
    return null;
  }

  // Step 2: Fetch international page
  await sleep(DELAY_MS);
  const intlUrl = `https://www.basketball-reference.com${intlPath}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const intlHtml = await fetchPage(intlUrl);
      const data = parseIntlPage(intlHtml, entry.slug, entry.name, entry.year);
      if (data) {
        console.log(
          `  Found ${entry.name}: ${data.seasons.length} pre-draft seasons, ` +
          `${data.totalPreDraftGames} games` +
          (data.preDraftAvg ? `, ${data.preDraftAvg.pts.toFixed(1)} PPG` : '')
        );
        return data;
      }
      console.log(`  No parseable international stats for ${entry.name}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') {
        console.log(`  No international page at ${intlPath}`);
        return null;
      }
      if (msg === 'RATE_LIMITED') {
        const waitTime = 60000 * Math.pow(2, attempt);
        console.log(`  Rate limited on intl page (attempt ${attempt + 1}), waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      console.error(`  Error fetching intl page: ${msg}`);
      return null;
    }
  }

  console.log(`  Failed after retries for ${entry.name}`);
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

  // Filter to players with no college (international + prep-to-pro)
  const intlEntries = allEntries.filter((e) => !e.college || e.college === '');
  console.log(`Found ${intlEntries.length} no-college draft entries to check for international stats`);

  let scraped = 0;
  let skipped = 0;
  let noData = 0;

  for (let i = 0; i < intlEntries.length; i++) {
    const entry = intlEntries[i];
    const outPath = path.join(OUTPUT_DIR, `${entry.slug}.json`);

    // Skip if already scraped
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${intlEntries.length}] ${entry.name} (${entry.year} #${entry.pick})`);
    const data = await scrapePlayer(entry);

    if (data && data.totalPreDraftGames > 0) {
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      scraped++;
    } else {
      noData++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Scraped: ${scraped}, Skipped (cached): ${skipped}, No data: ${noData}`);
}

main().catch(console.error);
