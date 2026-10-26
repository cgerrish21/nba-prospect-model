/**
 * Script 10: Scrape 2026 Mock Draft Prospect College Stats
 * Reads: data/raw/drafts/2026-mock.json
 * Output: data/raw/college-2026/{slug}.json
 *
 * For each prospect, searches College Basketball Reference to find their slug,
 * then scrapes their stats page.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 5000;
const MAX_RETRIES = 5;
const MOCK_PATH = path.join(__dirname, '..', 'data', 'raw', 'drafts', '2026-mock.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'college-2026');

interface MockPick {
  pick: number;
  name: string;
  school: string;
  position: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url: string, attempt = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspectModel/1.0',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 429) {
        if (attempt < MAX_RETRIES) {
          const wait = 60000 * Math.pow(2, attempt);
          console.log(`  Rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          sleep(wait).then(() => fetchPage(url, attempt + 1).then(resolve).catch(reject));
          return;
        }
        reject(new Error('RATE_LIMITED'));
        return;
      }
      if (res.statusCode === 404) { reject(new Error('NOT_FOUND')); return; }
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const loc = res.headers.location;
        if (loc) {
          const redir = loc.startsWith('http') ? loc : `https://www.sports-reference.com${loc}`;
          fetchPage(redir, attempt).then(resolve).catch(reject);
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
  const regex = new RegExp(`data-stat="${dataStat}"[^>]*>(.*?)(?=<\\/t[dh]>|$)`);
  const match = html.match(regex);
  if (!match) return '';
  // Strip all HTML tags to get the text content
  return match[1].replace(/<[^>]*>/g, '').trim();
}

// Search CBB ref for the player slug
async function findSlug(name: string, school: string): Promise<string | null> {
  // Try the common slug format: firstname-lastname-N
  const parts = name.replace(/[^a-zA-Z\s\-']/g, '').toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;

  const first = parts[0].replace(/'/g, '');
  const last = parts[parts.length - 1].replace(/'/g, '');

  // Try -1, -2, -3
  for (let n = 1; n <= 3; n++) {
    const slug = `${first}-${last}-${n}`;
    const url = `https://www.sports-reference.com/cbb/players/${slug}.html`;
    try {
      const html = await fetchPage(url);
      // Verify this is the right player by checking school name
      const schoolLower = school.toLowerCase();
      const htmlLower = html.toLowerCase();
      if (htmlLower.includes(schoolLower) ||
          htmlLower.includes(schoolLower.replace('uconn', 'connecticut')) ||
          htmlLower.includes(schoolLower.replace('nc state', 'north carolina state')) ||
          htmlLower.includes(schoolLower.replace('st. john\'s', 'st. john'))) {
        return slug;
      }
      console.log(`    Slug ${slug} found but wrong school`);
      await sleep(DELAY_MS);
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') {
        // Try next number
        await sleep(DELAY_MS);
        continue;
      }
      throw e;
    }
  }

  // Try with middle initial/suffix removed
  if (parts.length > 2) {
    const slug = `${first}-${last}-1`;
    // Already tried above
  }

  // Try Jr/II/III suffix handling
  const nameClean = name.replace(/\s+(Jr\.|Jr|II|III|IV)$/i, '').trim();
  if (nameClean !== name) {
    return findSlug(nameClean, school);
  }

  return null;
}

function parseCollegePage(html: string, slug: string, name: string) {
  const seasons: any[] = [];

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
    // Only real seasons (YYYY-YY format)
    if (!seasonText.match(/^\d{4}-\d{2}$/)) continue;

    const schoolMatch = row.match(/data-stat="team_name_abbr"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    if (schoolMatch && schoolMatch[1].trim()) lastSchool = schoolMatch[1].trim();

    const confMatch = row.match(/data-stat="conf_abbr"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    if (confMatch && confMatch[1].trim()) lastConference = confMatch[1].trim();

    seasons.push({
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
    });
  }

  if (seasons.length === 0) return null;

  // Try to get advanced stats
  const advMatch = html.match(/<table[^>]*id="players_advanced"[^>]*>([\s\S]*?)<\/table>/);
  if (advMatch) {
    const advTbody = advMatch[1].substring(advMatch[1].indexOf('<tbody>') + 7);
    const advRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let advRow;
    let sIdx = 0;
    while ((advRow = advRowRegex.exec(advTbody)) !== null) {
      const row = advRow[1];
      if (row.includes('class="thead"') || row.includes('class="partial_table"')) continue;
      const year = extractCellValue(row, 'year_id');
      if (!year || !year.match(/^\d{4}-\d{2}$/)) continue;
      if (sIdx < seasons.length) {
        seasons[sIdx].usageRate = parseNum(extractCellValue(row, 'usg_pct')) || null;
        seasons[sIdx].trueShootingPct = parseNum(extractCellValue(row, 'ts_pct')) || null;
        seasons[sIdx].boxPlusMinus = parseNum(extractCellValue(row, 'bpm')) || null;
        seasons[sIdx].winSharesPer40 = parseNum(extractCellValue(row, 'ws_per_40')) || null;
        sIdx++;
      }
    }
  }

  // Class year = number of seasons
  const classYear = seasons.length;
  const lastSeason = seasons[seasons.length - 1];

  return {
    slug,
    name,
    school: lastSeason.school,
    conference: lastSeason.conference,
    classYear,
    seasons,
  };
}

async function main() {
  const prospects: MockPick[] = JSON.parse(fs.readFileSync(MOCK_PATH, 'utf-8'));
  console.log(`Loaded ${prospects.length} prospects from 2026 mock draft`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let scraped = 0;
  let cached = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const p of prospects) {
    // Skip international non-college players
    if (['New Zealand Breakers', 'Melbourne'].includes(p.school)) {
      console.log(`  [${p.pick}] ${p.name} — international, skipping`);
      failed++;
      failures.push(`${p.name} (international)`);
      continue;
    }

    // Check cache
    const existing = fs.readdirSync(OUTPUT_DIR).find((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
      return data.name === p.name;
    });
    if (existing) {
      console.log(`  [${p.pick}] ${p.name} — cached`);
      cached++;
      continue;
    }

    console.log(`  [${p.pick}] ${p.name} (${p.school}) — searching...`);

    try {
      const slug = await findSlug(p.name, p.school);
      if (!slug) {
        console.log(`    ✗ Could not find slug`);
        failed++;
        failures.push(`${p.name} (no slug found)`);
        continue;
      }

      console.log(`    Found slug: ${slug}`);
      const url = `https://www.sports-reference.com/cbb/players/${slug}.html`;
      const html = await fetchPage(url);
      const data = parseCollegePage(html, slug, p.name);

      if (!data) {
        console.log(`    ✗ Could not parse stats`);
        failed++;
        failures.push(`${p.name} (parse failed)`);
        await sleep(DELAY_MS);
        continue;
      }

      // Add position from mock draft
      const output = { ...data, position: p.position, mockPick: p.pick };
      fs.writeFileSync(path.join(OUTPUT_DIR, `${slug}.json`), JSON.stringify(output, null, 2));
      console.log(`    ✓ ${data.seasons.length} seasons, latest: ${data.seasons[data.seasons.length - 1].pts} PPG`);
      scraped++;
    } catch (e: any) {
      console.log(`    ✗ Error: ${e.message}`);
      failed++;
      failures.push(`${p.name} (${e.message})`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone: ${scraped} scraped, ${cached} cached, ${failed} failed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main();
