/**
 * Quick fix: re-scrape 6 players from 2025 draft with correct College Basketball Reference URLs
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');

const FIXES = [
  { slug: 'johnstr03', name: 'Tre Johnson', url: 'https://www.sports-reference.com/cbb/players/tre-johnson-2.html' },
  { slug: 'baileac01', name: 'Ace Bailey', url: 'https://www.sports-reference.com/cbb/players/airious-bailey-1.html' },
  { slug: 'demineg01', name: 'Egor Demin', url: 'https://www.sports-reference.com/cbb/players/egor-demin-1.html' },
  { slug: 'claytwa01', name: 'Walter Clayton', url: 'https://www.sports-reference.com/cbb/players/walter-claytonjr-1.html' },
  { slug: 'jakucka01', name: 'Kasparas Jakucionis', url: 'https://www.sports-reference.com/cbb/players/kasparas-jakucionis-1.html' },
  { slug: 'konanya01', name: 'Yanic Konan Niederhauser', url: 'https://www.sports-reference.com/cbb/players/yanic-konan-niederhauser-1.html' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspectModel/1.0' },
    }, (res) => {
      if (res.statusCode === 429) { reject(new Error('RATE_LIMITED')); return; }
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

  const realSeasons = seasons.filter(s => s.season !== 'Career');
  const classYear = Math.min(realSeasons.length, 4);
  const lastSeason = realSeasons[realSeasons.length - 1] || seasons[seasons.length - 1];

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

async function main() {
  for (const fix of FIXES) {
    console.log(`Scraping ${fix.name} from ${fix.url}...`);
    try {
      const html = await fetchPage(fix.url);
      const data = parseCollegePage(html, fix.slug, fix.name);
      if (data) {
        const outPath = path.join(OUTPUT_DIR, `${fix.slug}.json`);
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
        console.log(`  OK: ${data.seasons.length} seasons at ${data.school} (${data.conference})`);
        // Verify last season
        const last = data.seasons.filter(s => s.season !== 'Career');
        const lastS = last[last.length - 1];
        console.log(`  Last season: ${lastS.season} — ${lastS.pts} PPG, ${lastS.reb} RPG, ${lastS.ast} APG, ${lastS.minutesPerGame} MPG`);
      } else {
        console.log(`  FAILED: could not parse page`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR: ${msg}`);
    }
    await sleep(3500);
  }
}

main().catch(console.error);
