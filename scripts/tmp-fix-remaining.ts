/**
 * Fix remaining 15 mismatched college files with manually verified URLs.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');

const FIXES = [
  { slug: 'johnswe01', name: 'Wesley Johnson', url: 'https://www.sports-reference.com/cbb/players/wes-johnson-1.html' },
  { slug: 'thomptr01', name: 'Tristan Thompson', url: 'https://www.sports-reference.com/cbb/players/tristan-thompson-2.html' },
  { slug: 'davisjo06', name: 'Johnny Davis', url: 'https://www.sports-reference.com/cbb/players/jonathan-davis-3.html' },
  { slug: 'willija06', name: 'Jalen Williams', url: 'https://www.sports-reference.com/cbb/players/jalen-williams-13.html' },
  { slug: 'whalero01', name: 'Robert Whaley', url: 'https://www.sports-reference.com/cbb/players/robert-whaley-1.html' },
  { slug: 'jonesbo02', name: 'Bobby Jones', url: 'https://www.sports-reference.com/cbb/players/bobby-jones-2.html' },
  { slug: 'brownde03', name: 'Dee Brown', url: 'https://www.sports-reference.com/cbb/players/dee-brown-2.html' },
  { slug: 'millspa02', name: 'Patty Mills', url: 'https://www.sports-reference.com/cbb/players/patrick-mills-1.html' },
  { slug: 'tayloje03', name: 'Jeff Taylor', url: 'https://www.sports-reference.com/cbb/players/jeffery-taylor-1.html' },
  { slug: 'harrijo01', name: 'Joe Harris', url: 'https://www.sports-reference.com/cbb/players/joe-harris--1.html' },
  { slug: 'youngjo01', name: 'Joe Young', url: 'https://www.sports-reference.com/cbb/players/joseph-young-1.html' },
  { slug: 'johnsja05', name: 'Jalen Johnson', url: 'https://www.sports-reference.com/cbb/players/jalen-johnson-24.html' },
  { slug: 'thomaca02', name: 'Cam Thomas', url: 'https://www.sports-reference.com/cbb/players/cameron-thomas-1.html' },
  { slug: 'joneshe01', name: 'Herbert Jones', url: 'https://www.sports-reference.com/cbb/players/herb-jones-3.html' },
  { slug: 'johnsda08', name: 'David Johnson', url: 'https://www.sports-reference.com/cbb/players/david-johnson-13.html' },
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
  season: string; school: string; conference: string;
  gamesPlayed: number; gamesStarted: number; minutesPerGame: number;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgPct: number; threePtPct: number; ftPct: number; threePM: number; fta: number;
  usageRate: number | null; trueShootingPct: number | null;
  boxPlusMinus: number | null; winSharesPer40: number | null;
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

    seasons.push({
      season: seasonText.trim(), school: lastSchool, conference: lastConference,
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
      usageRate: null, trueShootingPct: null, boxPlusMinus: null, winSharesPer40: null,
    });
  }

  if (seasons.length === 0) return null;

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
    slug, name,
    school: lastSeason.school || lastSchool,
    conference: lastSeason.conference || lastConference,
    classYear, seasons,
    teamPTS: null as number | null,
    teamREB: null as number | null,
    teamAST: null as number | null,
  };
}

async function main() {
  let fixed = 0;
  let failed = 0;

  for (const fix of FIXES) {
    console.log(`[${fixed + failed + 1}/${FIXES.length}] ${fix.name} — ${fix.url.split('/').pop()}`);
    try {
      const html = await fetchPage(fix.url);
      const data = parseCollegePage(html, fix.slug, fix.name);
      if (data) {
        const outPath = path.join(OUTPUT_DIR, `${fix.slug}.json`);
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
        const real = data.seasons.filter(s => s.season !== 'Career');
        const last = real[real.length - 1];
        console.log(`  ✓ ${data.school} (${data.conference}) — ${last?.pts} PPG, ${(last?.ftPct * 100).toFixed(1)}% FT, ${last?.minutesPerGame} MPG`);
        fixed++;
      } else {
        console.log(`  ✗ Could not parse page`);
        failed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'RATE_LIMITED') {
        console.log(`  ⚠ Rate limited — waiting 120s...`);
        await sleep(120000);
        // Retry once
        try {
          const html = await fetchPage(fix.url);
          const data = parseCollegePage(html, fix.slug, fix.name);
          if (data) {
            fs.writeFileSync(path.join(OUTPUT_DIR, `${fix.slug}.json`), JSON.stringify(data, null, 2));
            const real = data.seasons.filter(s => s.season !== 'Career');
            const last = real[real.length - 1];
            console.log(`  ✓ (retry) ${data.school} — ${last?.pts} PPG, ${(last?.ftPct * 100).toFixed(1)}% FT`);
            fixed++;
          } else { console.log(`  ✗ Retry failed to parse`); failed++; }
        } catch { console.log(`  ✗ Retry failed`); failed++; }
      } else {
        console.log(`  ✗ ${msg}`);
        failed++;
      }
    }
    await sleep(4000);
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

main().catch(console.error);
