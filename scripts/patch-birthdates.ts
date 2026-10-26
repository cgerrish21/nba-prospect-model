/**
 * Patch birth dates into existing NBA career JSON files.
 * Fetches only the player page to extract birth date, then patches the JSON.
 * Does NOT re-scrape stats — just adds/updates the birthDate field.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const DELAY_MS = 5000;
const NBA_DIR = path.join(__dirname, '..', 'data', 'raw', 'nba');

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

function extractBirthDate(html: string): string | null {
  const dataBirth = html.match(/data-birth="(\d{4}-\d{2}-\d{2})"/);
  if (dataBirth) return dataBirth[1];

  const bornMatch = html.match(/Born:[\s\S]*?(\w+ \d{1,2}, \d{4})/);
  if (bornMatch) {
    const d = new Date(bornMatch[1]);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

async function main() {
  const files = fs.readdirSync(NBA_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} NBA player files`);

  let patched = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(NBA_DIR, files[i]);
    const player = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Skip if already has birthDate
    if (player.birthDate) {
      skipped++;
      continue;
    }

    const slug = files[i].replace('.json', '');
    const letter = slug.charAt(0);
    const url = `https://www.basketball-reference.com/players/${letter}/${slug}.html`;

    console.log(`[${i + 1}/${files.length}] ${player.name || slug}`);

    const MAX_RETRIES = 5;
    let birthDate: string | null = null;
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const html = await fetchPage(url);
        birthDate = extractBirthDate(html);
        success = true;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'RATE_LIMITED') {
          const waitTime = 60000 * Math.pow(2, attempt);
          console.log(`  Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${waitTime / 1000}s...`);
          await sleep(waitTime);
          continue;
        }
        console.error(`  Error fetching ${slug}: ${msg}`);
        break;
      }
    }

    if (success) {
      player.birthDate = birthDate;
      fs.writeFileSync(filePath, JSON.stringify(player, null, 2));
      console.log(`  birthDate: ${birthDate || 'not found on page'}`);
      patched++;
    } else {
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Patched: ${patched}, Already had birthDate: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
