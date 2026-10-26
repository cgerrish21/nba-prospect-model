/**
 * Script 8: Scrape College Team Stats from Sports-Reference
 * Source: https://www.sports-reference.com/cbb/schools/{slug}/{year}.html
 * Output: data/raw/teams/{school-slug}_{season}.json
 * Purpose: Real team totals for production share (dominator rating)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 5000;
let consecutiveRateLimits = 0;
const COLLEGE_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'teams');

interface TeamStats {
  school: string;
  schoolSlug: string;
  season: string;
  games: number;
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
  stlPerGame: number;
  blkPerGame: number;
  tovPerGame: number;
  pace: number | null;
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

/**
 * Map school abbreviation to Sports-Reference URL slug.
 * SRef uses lowercase, hyphenated school names.
 */
const SCHOOL_SLUG_MAP: Record<string, string> = {
  // Common mappings where abbreviation differs from URL slug
  'UConn': 'connecticut',
  'UCONN': 'connecticut',
  'Connecticut': 'connecticut',
  'UNC': 'north-carolina',
  'LSU': 'louisiana-state',
  'USC': 'southern-california',
  'UCLA': 'ucla',
  'UNLV': 'nevada-las-vegas',
  'UCF': 'central-florida',
  'SMU': 'southern-methodist',
  'TCU': 'texas-christian',
  'VCU': 'virginia-commonwealth',
  'BYU': 'brigham-young',
  'UTEP': 'texas-el-paso',
  'UAB': 'alabama-birmingham',
  'Ole Miss': 'mississippi',
  'Miami (FL)': 'miami-fl',
  'Miami': 'miami-fl',
  'Saint Mary\'s': 'saint-marys-ca',
  'Saint Mary\'s (CA)': 'saint-marys-ca',
  "St. John's": 'st-johns-ny',
  "St. John's (NY)": 'st-johns-ny',
  "Saint Joseph's": 'saint-josephs',
  'NC State': 'north-carolina-state',
  'NCST': 'north-carolina-state',
  'Ohio St.': 'ohio-state',
  'Mich. St.': 'michigan-state',
  'Michigan State': 'michigan-state',
  'Penn State': 'penn-state',
  'Penn St.': 'penn-state',
  'Iowa State': 'iowa-state',
  'Iowa St.': 'iowa-state',
  'Kansas State': 'kansas-state',
  'Kansas St.': 'kansas-state',
  'Oklahoma State': 'oklahoma-state',
  'Oklahoma St.': 'oklahoma-state',
  'Oregon State': 'oregon-state',
  'Oregon St.': 'oregon-state',
  'Arizona State': 'arizona-state',
  'Arizona St.': 'arizona-state',
  'Florida State': 'florida-state',
  'Florida St.': 'florida-state',
  'Colorado State': 'colorado-state',
  'Colorado St.': 'colorado-state',
  'Fresno State': 'fresno-state',
  'Fresno St.': 'fresno-state',
  'San Diego State': 'san-diego-state',
  'San Diego St.': 'san-diego-state',
  'Boise State': 'boise-state',
  'Boise St.': 'boise-state',
  'Washington State': 'washington-state',
  'Wash. St.': 'washington-state',
  'Memphis St.': 'memphis',
  'Texas A&M': 'texas-am',
  'Wake Forest': 'wake-forest',
  'Boston College': 'boston-college',
  'Georgia Tech': 'georgia-tech',
  'Virginia Tech': 'virginia-tech',
  'West Virginia': 'west-virginia',
  'North Carolina': 'north-carolina',
  'South Carolina': 'south-carolina',
  'Mississippi State': 'mississippi-state',
  'Miss. St.': 'mississippi-state',
  'Murray State': 'murray-state',
  'Murray St.': 'murray-state',
  'Wichita State': 'wichita-state',
  'Wichita St.': 'wichita-state',
  'Weber State': 'weber-state',
  'Weber St.': 'weber-state',
  'Ball State': 'ball-state',
  'Ball St.': 'ball-state',
  'Kent State': 'kent-state',
  'Kent St.': 'kent-state',
  'Wright State': 'wright-state',
  'Wright St.': 'wright-state',
  'Portland State': 'portland-state',
  'Portland St.': 'portland-state',
  'Long Beach State': 'long-beach-state',
  'Long Beach St.': 'long-beach-state',
  'South Florida': 'south-florida',
  'North Texas': 'north-texas',
  'Central Michigan': 'central-michigan',
  'Western Kentucky': 'western-kentucky',
  'Eastern Washington': 'eastern-washington',
  'Middle Tennessee': 'middle-tennessee',
  'Southern Miss': 'southern-mississippi',
  'New Mexico': 'new-mexico',
  'New Mexico State': 'new-mexico-state',
  'New Mexico St.': 'new-mexico-state',
  'San Francisco': 'san-francisco',
  'Santa Clara': 'santa-clara',
  'Loyola Chicago': 'loyola-il',
  'Loyola (IL)': 'loyola-il',
  'George Mason': 'george-mason',
  'George Washington': 'george-washington',
  'Green Bay': 'green-bay',
  'Bowling Green': 'bowling-green-state',
  'South Alabama': 'south-alabama',
  'DePaul': 'depaul',
  'La Salle': 'la-salle',
  'UTSA': 'texas-san-antonio',
  'UT Arlington': 'texas-arlington',
  'UMass': 'massachusetts',
  'UIC': 'illinois-chicago',
  'IUPUI': 'iupui',
};

function schoolToSlug(school: string): string {
  if (SCHOOL_SLUG_MAP[school]) return SCHOOL_SLUG_MAP[school];

  // Try common transformations
  return school
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\./g, '')
    .replace(/&/g, '')
    .replace(/'/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function parseTeamPage(html: string, school: string, season: string): TeamStats | null {
  // Try the season-total_per_game table first
  const tableMatch = html.match(/<table[^>]*id="season-total_per_game"[^>]*>([\s\S]*?)<\/table>/);
  if (tableMatch) {
    // Find the "Team" row (not "Opponent" or "Rank")
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
      const row = rowMatch[1];
      const entity = extractCellValue(row, 'entity');
      if (entity === 'Team' || entity === 'School') {
        return {
          school,
          schoolSlug: schoolToSlug(school),
          season,
          games: parseNum(extractCellValue(row, 'games')),
          ptsPerGame: parseNum(extractCellValue(row, 'pts_per_g')),
          rebPerGame: parseNum(extractCellValue(row, 'trb_per_g')),
          astPerGame: parseNum(extractCellValue(row, 'ast_per_g')),
          stlPerGame: parseNum(extractCellValue(row, 'stl_per_g')),
          blkPerGame: parseNum(extractCellValue(row, 'blk_per_g')),
          tovPerGame: parseNum(extractCellValue(row, 'tov_per_g')),
          pace: null,
        };
      }
    }
  }

  // Fallback: try players_per_game tfoot
  const pgTable = html.match(/<table[^>]*id="players_per_game"[^>]*>([\s\S]*?)<\/table>/);
  if (pgTable) {
    const tfootMatch = pgTable[1].match(/<tfoot>([\s\S]*?)<\/tfoot>/);
    if (tfootMatch) {
      const row = tfootMatch[1];
      return {
        school,
        schoolSlug: schoolToSlug(school),
        season,
        games: parseNum(extractCellValue(row, 'games')),
        ptsPerGame: parseNum(extractCellValue(row, 'pts_per_g')),
        rebPerGame: parseNum(extractCellValue(row, 'trb_per_g')),
        astPerGame: parseNum(extractCellValue(row, 'ast_per_g')),
        stlPerGame: parseNum(extractCellValue(row, 'stl_per_g')),
        blkPerGame: parseNum(extractCellValue(row, 'blk_per_g')),
        tovPerGame: parseNum(extractCellValue(row, 'tov_per_g')),
        pace: null,
      };
    }
  }

  return null;
}

function seasonToYear(season: string): string {
  // Convert "2019-20" to "2020" (the year the season ends)
  const parts = season.split('-');
  if (parts.length === 2) {
    const century = parts[0].substring(0, 2);
    return century + parts[1];
  }
  return season;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Collect all unique school/season pairs from college data (last season only)
  const collegeFiles = fs.readdirSync(COLLEGE_DIR).filter((f) => f.endsWith('.json'));
  const pairsMap = new Map<string, { school: string; season: string }>();

  for (const file of collegeFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(COLLEGE_DIR, file), 'utf-8'));
    const realSeasons = data.seasons.filter((s: { season: string }) =>
      s.season.indexOf('Career') === -1 &&
      !s.season.match(/\(\d+ Yr/) &&                // filter "School (1 Yr)" summary rows
      !s.season.includes('Did not play') &&          // filter DNP rows
      s.season.match(/^\d{4}-\d{2}$/)                // must match YYYY-YY format
    );
    if (realSeasons.length === 0) continue;

    const lastSeason = realSeasons[realSeasons.length - 1];
    if (!lastSeason.school) continue;

    const key = `${lastSeason.school}|${lastSeason.season}`;
    if (!pairsMap.has(key)) {
      pairsMap.set(key, { school: lastSeason.school, season: lastSeason.season });
    }
  }

  const pairs = [...pairsMap.values()];
  console.log(`Found ${pairs.length} unique school/season pairs to scrape`);

  let scraped = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < pairs.length; i++) {
    const { school, season } = pairs[i];
    const slug = schoolToSlug(school);
    const year = seasonToYear(season);
    const outFile = `${slug}_${season}.json`;
    const outPath = path.join(OUTPUT_DIR, outFile);

    // Skip if already scraped
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    const url = `https://www.sports-reference.com/cbb/schools/${slug}/${year}.html`;
    console.log(`[${i + 1}/${pairs.length}] ${school} ${season} → ${slug}/${year}`);

    try {
      const html = await fetchPage(url);
      const stats = parseTeamPage(html, school, season);

      if (stats) {
        fs.writeFileSync(outPath, JSON.stringify(stats, null, 2));
        console.log(`  Team: ${stats.ptsPerGame} PPG, ${stats.rebPerGame} RPG, ${stats.astPerGame} APG`);
        scraped++;
        consecutiveRateLimits = 0;
      } else {
        console.log(`  Could not parse team stats`);
        failed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') {
        console.log(`  Not found (slug may be wrong: ${slug})`);
        failed++;
      } else if (msg === 'RATE_LIMITED') {
        consecutiveRateLimits++;
        const waitTime = 60000 * Math.min(consecutiveRateLimits, 8); // 60s, 120s, ... up to 480s
        console.log(`  Rate limited (${consecutiveRateLimits}x), waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        i--; // Retry this one
        continue;
      } else {
        console.log(`  Error: ${msg}`);
        failed++;
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Scraped: ${scraped}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
