/**
 * Script 1: Scrape NBA Draft History from Basketball-Reference
 * Source: https://www.basketball-reference.com/draft/NBA_{year}.html
 * Output: data/raw/drafts/{year}.json
 * Scope: 2005-2025, 3s between requests
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const FIRST_YEAR = 2005;
const LAST_YEAR = 2025;
const DELAY_MS = 3000;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');

interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string;
  age: number | null;
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
      if (res.statusCode === 429) {
        reject(new Error('Rate limited (429). Wait and retry.'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseDraftPage(html: string, year: number): DraftEntry[] {
  const entries: DraftEntry[] = [];

  // Basketball-Reference draft table rows
  // Look for <tr> rows within the draft table
  // Each row has: pick, team, player (with link), college, etc.
  const tableMatch = html.match(/<table[^>]*id="stats"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) {
    // Try alternate table id
    const altMatch = html.match(/<table[^>]*id="draft"[^>]*>([\s\S]*?)<\/table>/) ||
                     html.match(/<table[^>]*id="picks"[^>]*>([\s\S]*?)<\/table>/);
    if (!altMatch) {
      console.warn(`  No draft table found for ${year}`);
      return entries;
    }
    return parseDraftTableHTML(altMatch[1], year);
  }

  return parseDraftTableHTML(tableMatch[1], year);
}

function parseDraftTableHTML(tableHTML: string, year: number): DraftEntry[] {
  const entries: DraftEntry[] = [];

  // Extract tbody — handle unclosed </tbody> by grabbing everything after <tbody>
  const tbodyIdx = tableHTML.indexOf('<tbody>');
  const body = tbodyIdx >= 0 ? tableHTML.substring(tbodyIdx + 7) : tableHTML;

  // Match each data row
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(body)) !== null) {
    const rowHTML = rowMatch[1];

    // Skip header/separator rows
    if (rowHTML.includes('class="thead"') || rowHTML.includes('over_header')) continue;

    // Pick number: td data-stat="pick_overall" may contain <a> wrapping the number
    const pickMatch = rowHTML.match(/data-stat="pick_overall"[^>]*>(?:<[^>]*>)*\s*(\d+)/);
    const pick = pickMatch ? parseInt(pickMatch[1]) : 0;
    if (pick === 0) continue;

    // Player name and slug from data-stat="player" cell
    // Note: href may use single or double quotes
    const playerMatch = rowHTML.match(/data-stat="player"[^>]*>[\s\S]*?<a[^>]*href=['"]\/players\/[a-z]\/([^'"]+)\.html['"][^>]*>([^<]+)<\/a>/);
    if (!playerMatch) continue;

    const slug = playerMatch[1];
    const name = playerMatch[2].trim();

    // Team
    const teamMatch = rowHTML.match(/data-stat="team_id"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]+)/);
    const team = teamMatch ? teamMatch[1].trim() : '';

    // College — may be empty for international players
    const collegeMatch = rowHTML.match(/data-stat="college_name"[^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]*)/);
    const college = collegeMatch ? collegeMatch[1].trim() : '';

    // Age at draft — data-stat="age" contains decimal age like "19.2"
    const ageMatch = rowHTML.match(/data-stat="age"[^>]*>([^<]*)/);
    const age = ageMatch && ageMatch[1].trim() ? parseFloat(ageMatch[1].trim()) : null;

    entries.push({ year, pick, name, team, college, slug, age });
  }

  return entries;
}

async function scrapeYear(year: number): Promise<DraftEntry[]> {
  const url = `https://www.basketball-reference.com/draft/NBA_${year}.html`;
  console.log(`Scraping ${year} draft: ${url}`);

  const html = await fetchPage(url);
  const entries = parseDraftPage(html, year);
  console.log(`  Found ${entries.length} picks`);

  return entries;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalPlayers = 0;

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    try {
      const entries = await scrapeYear(year);
      const outPath = path.join(OUTPUT_DIR, `${year}.json`);
      fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
      totalPlayers += entries.length;
      console.log(`  Saved ${entries.length} entries to ${outPath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Error scraping ${year}: ${message}`);
    }

    if (year < LAST_YEAR) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone! Total: ${totalPlayers} players across ${LAST_YEAR - FIRST_YEAR + 1} drafts`);
}

main().catch(console.error);
