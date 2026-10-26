/**
 * Script 3: Scrape NBA Career Stats from Basketball-Reference
 * Source: https://www.basketball-reference.com/players/{letter}/{slug}.html
 * Output: data/raw/nba/{player-slug}.json
 * Fields: Per-game stats for first 4 NBA seasons
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 5000;
const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'nba');

interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string;
}

interface NBASeason {
  season: string;
  team: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  threePM: number;
  fgPct: number;
  ftPct: number;
  tov: number;
}

interface NBAPlayerData {
  slug: string;
  name: string;
  birthDate: string | null; // YYYY-MM-DD
  seasons: NBASeason[];
  first4Avg: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    threePM: number;
    fgPct: number;
    ftPct: number;
    tov: number;
  };
  totalGames: number;
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

function extractBirthDate(html: string): string | null {
  // BR uses <span id="necro-birth" data-birth="YYYY-MM-DD"> or
  // <span id="necro-birth"><a href="...">Month Day, Year</a></span>
  const dataBirth = html.match(/data-birth="(\d{4}-\d{2}-\d{2})"/);
  if (dataBirth) return dataBirth[1];

  // Fallback: parse from "Born: Month Day, Year" text
  const bornMatch = html.match(/Born:[\s\S]*?(\w+ \d{1,2}, \d{4})/);
  if (bornMatch) {
    const d = new Date(bornMatch[1]);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

function parseNBAPage(html: string, slug: string, name: string): NBAPlayerData | null {
  const seasons: NBASeason[] = [];
  const birthDate = extractBirthDate(html);

  // Find per-game stats table (BRef uses id="per_game_stats")
  const tableMatch = html.match(/<table[^>]*id="per_game_stats"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return null;

  // Extract tbody — handle missing </tbody> tag
  const tbodyIdx = tableMatch[1].indexOf('<tbody>');
  const tbodyContent = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx + 7) : tableMatch[1];
  if (!tbodyContent) return null;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tbodyContent)) !== null) {
    const row = rowMatch[1];
    if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;

    const seasonText = extractCellValue(row, 'year_id');
    if (!seasonText || seasonText.includes('Career')) continue;

    // Skip rows that are "Did Not Play" or "TOT" duplicate
    const gp = parseNum(extractCellValue(row, 'games'));
    if (gp === 0) continue;

    const teamMatch = row.match(/data-stat="team_name_abbr"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    const team = teamMatch ? teamMatch[1].trim() : '';

    // Skip TOT rows (total across multiple teams in a season) — take individual team rows
    // Actually, prefer TOT as it's the combined season stat
    // But if we have TOT, skip the individual team entries for that season
    const season: NBASeason = {
      season: seasonText.trim(),
      team,
      gamesPlayed: gp,
      minutesPerGame: parseNum(extractCellValue(row, 'mp_per_g')),
      pts: parseNum(extractCellValue(row, 'pts_per_g')),
      reb: parseNum(extractCellValue(row, 'trb_per_g')),
      ast: parseNum(extractCellValue(row, 'ast_per_g')),
      stl: parseNum(extractCellValue(row, 'stl_per_g')),
      blk: parseNum(extractCellValue(row, 'blk_per_g')),
      threePM: parseNum(extractCellValue(row, 'fg3_per_g')),
      fgPct: parseNum(extractCellValue(row, 'fg_pct')),
      ftPct: parseNum(extractCellValue(row, 'ft_pct')),
      tov: parseNum(extractCellValue(row, 'tov_per_g')),
    };

    seasons.push(season);
  }

  // Filter out career summary rows (e.g., "14 Yrs", "MIL (7 Yrs)") — keep only real YYYY-YY seasons
  const realSeasons = seasons.filter((s) => /^\d{4}-\d{2}$/.test(s.season));

  if (realSeasons.length === 0) return null;

  // De-duplicate seasons: if a season has TOT + team entries, keep only TOT
  const dedupedSeasons: NBASeason[] = [];
  const seasonMap = new Map<string, NBASeason[]>();
  for (const s of realSeasons) {
    const existing = seasonMap.get(s.season) || [];
    existing.push(s);
    seasonMap.set(s.season, existing);
  }
  for (const [, entries] of seasonMap) {
    const totEntry = entries.find((e) => e.team === 'TOT');
    dedupedSeasons.push(totEntry || entries[0]);
  }

  // Sort by season year (numeric, not alphabetical)
  dedupedSeasons.sort((a, b) => parseInt(a.season.substring(0, 4)) - parseInt(b.season.substring(0, 4)));

  // Take first 4 seasons, calculate weighted averages
  const first4 = dedupedSeasons.slice(0, 4);
  const totalGames = first4.reduce((s, season) => s + season.gamesPlayed, 0);

  // Games-weighted averages
  const first4Avg = {
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, threePM: 0, fgPct: 0, ftPct: 0, tov: 0,
  };

  if (totalGames > 0) {
    for (const s of first4) {
      const w = s.gamesPlayed / totalGames;
      first4Avg.pts += s.pts * w;
      first4Avg.reb += s.reb * w;
      first4Avg.ast += s.ast * w;
      first4Avg.stl += s.stl * w;
      first4Avg.blk += s.blk * w;
      first4Avg.threePM += s.threePM * w;
      first4Avg.fgPct += s.fgPct * w;
      first4Avg.ftPct += s.ftPct * w;
      first4Avg.tov += s.tov * w;
    }
  }

  return {
    slug,
    name,
    birthDate,
    seasons: dedupedSeasons,
    first4Avg,
    totalGames,
  };
}

async function scrapePlayer(entry: DraftEntry): Promise<NBAPlayerData | null> {
  // Build URL: /players/{first-letter-of-last-name}/{slug}.html
  const letter = entry.slug.charAt(0);
  const url = `https://www.basketball-reference.com/players/${letter}/${entry.slug}.html`;

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const html = await fetchPage(url);
      const data = parseNBAPage(html, entry.slug, entry.name);
      if (data) {
        console.log(`  Found ${entry.name}: ${data.seasons.length} NBA seasons, ${data.totalGames} games`);
        return data;
      }
      console.log(`  No NBA stats found for ${entry.name}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') {
        console.log(`  No NBA page for ${entry.name}`);
        return null;
      }
      if (msg === 'RATE_LIMITED') {
        const waitTime = 60000 * Math.pow(2, attempt); // 60s, 120s, 240s, 480s, 960s
        console.log(`  Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      console.error(`  Error: ${msg}`);
      return null;
    }
  }
  console.log(`  Failed after ${MAX_RETRIES} retries for ${entry.name}`);
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

  console.log(`Loaded ${allEntries.length} draft entries`);

  let scraped = 0;
  let skipped = 0;

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const outPath = path.join(OUTPUT_DIR, `${entry.slug}.json`);

    // Skip if already scraped
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${allEntries.length}] ${entry.name}`);
    const data = await scrapePlayer(entry);

    if (data) {
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      scraped++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Scraped: ${scraped}, Skipped (cached): ${skipped}`);
}

main().catch(console.error);
