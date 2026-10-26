/**
 * Script 4b: Scrape NBA Draft Combine Measurements from Basketball-Reference
 * Source: https://www.basketball-reference.com/draft/NBA_{year}_combine.html
 * Output: data/raw/combine/{year}.json
 * Fallback for when NBA.com API is blocked
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const FIRST_YEAR = 2005;
const LAST_YEAR = 2025;
const DELAY_MS = 4000;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'combine');

interface CombineEntry {
  name: string;
  year: number;
  heightNoShoes: number | null;
  weight: number | null;
  wingspan: number | null;
  standingReach: number | null;
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

function parseHeight(text: string): number | null {
  if (!text || text.trim() === '') return null;
  // Format: "6' 2.5"" or "6-2.5" or just a number
  const match = text.match(/(\d+)['\-]\s*(\d+\.?\d*)/);
  if (match) {
    return parseInt(match[1]) * 12 + parseFloat(match[2]);
  }
  const num = parseFloat(text);
  if (!isNaN(num)) {
    return num > 60 ? num : Math.round(num * 12);
  }
  return null;
}

function parseWeight(text: string): number | null {
  if (!text || text.trim() === '') return null;
  const num = parseFloat(text.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function extractCellValue(html: string, dataStat: string): string {
  const regex = new RegExp(`data-stat="${dataStat}"[^>]*>(?:<[^>]*>)?([^<]*)`);
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

function parseCombinePage(html: string, year: number): CombineEntry[] {
  const entries: CombineEntry[] = [];

  // Find the combine stats table
  const tableMatch = html.match(/<table[^>]*id="combine"[^>]*>([\s\S]*?)<\/table>/) ||
                     html.match(/<table[^>]*id="stats"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return entries;

  const tbodyIdx = tableMatch[1].indexOf('<tbody>');
  const body = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx + 7) : tableMatch[1];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(body)) !== null) {
    const row = rowMatch[1];
    if (row.includes('class="thead"') || row.includes('over_header')) continue;

    // Player name
    const nameMatch = row.match(/data-stat="player"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Height without shoes: data-stat="height_wo_shoes"
    const heightStr = extractCellValue(row, 'height_wo_shoes');
    // Weight: data-stat="weight"
    const weightStr = extractCellValue(row, 'weight');
    // Wingspan: data-stat="wingspan"
    const wingspanStr = extractCellValue(row, 'wingspan');
    // Standing reach: data-stat="standing_reach" or "standing_vertical_leap" — check both
    const reachStr = extractCellValue(row, 'standing_reach');

    entries.push({
      name,
      year,
      heightNoShoes: parseHeight(heightStr),
      weight: parseWeight(weightStr),
      wingspan: parseHeight(wingspanStr),
      standingReach: parseHeight(reachStr),
    });
  }

  return entries;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalPlayers = 0;

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const outPath = path.join(OUTPUT_DIR, `${year}.json`);

    // Skip if already scraped
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
      if (existing.length > 0) {
        console.log(`Already have ${year}: ${existing.length} players`);
        totalPlayers += existing.length;
        continue;
      }
    }

    // No combine in 2020 (COVID)
    if (year === 2020) {
      console.log(`Skipping ${year} (no combine due to COVID)`);
      fs.writeFileSync(outPath, JSON.stringify([]));
      continue;
    }

    const url = `https://www.basketball-reference.com/draft/NBA_${year}_combine.html`;
    console.log(`Scraping ${year} combine: ${url}`);

    try {
      const html = await fetchPage(url);
      const entries = parseCombinePage(html, year);
      fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
      totalPlayers += entries.length;
      console.log(`  Found ${entries.length} players`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'NOT_FOUND') {
        console.log(`  No combine page for ${year}`);
        fs.writeFileSync(outPath, JSON.stringify([]));
      } else if (msg === 'RATE_LIMITED') {
        console.log('  Rate limited, waiting 60s...');
        await sleep(60000);
        year--; // Retry
        continue;
      } else {
        console.log(`  Error: ${msg}`);
        fs.writeFileSync(outPath, JSON.stringify([]));
      }
    }

    if (year < LAST_YEAR) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone! Total combine records: ${totalPlayers}`);
}

main().catch(console.error);
