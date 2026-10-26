// Check how to find the international page link from the main NBA player page
const https = require('https');

// Test with Rubio (rubiori01) and Giannis (anMDokounmpo)
const players = [
  { name: 'Ricky Rubio', slug: 'rubiori01' },
  { name: 'Giannis Antetokounmpo', slug: 'anMDokounmpo01' }, // wrong, let me check
];

// Actually let's just check what international link is on a few player pages
function checkPlayer(slug) {
  return new Promise((resolve) => {
    const letter = slug.charAt(0);
    const url = `https://www.basketball-reference.com/players/${letter}/${slug}.html`;
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 ProspectModel/1.0' } };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Find international link
        const intlLinks = [...data.matchAll(/href="(\/international\/players\/[^"]+)"/g)];
        if (intlLinks.length > 0) {
          resolve({ slug, intlUrl: intlLinks[0][1], found: true });
        } else {
          resolve({ slug, intlUrl: null, found: false });
        }
      });
    }).on('error', () => resolve({ slug, intlUrl: null, found: false }));
  });
}

async function main() {
  // Test a few international players
  const slugs = ['rubiori01', 'anMDokounmpo01', 'doncilu01', 'jokicni01', 'goMDobert01'];
  // Wait, these slugs might be wrong. Let me just check from our draft data.
  const fs = require('fs');
  const path = require('path');
  const draftsDir = path.join(__dirname, '..', 'data', 'raw', 'drafts');
  const entries = [];
  for (const f of fs.readdirSync(draftsDir)) {
    if (f.endsWith('.json')) entries.push(...JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf-8')));
  }

  // Find international players (no college)
  const intl = entries.filter(e => !e.college || e.college === '');
  console.log(`Found ${intl.length} international players`);
  console.log('Checking first 5 for international page links...\n');

  for (const entry of intl.slice(0, 5)) {
    console.log(`${entry.name} (${entry.year} #${entry.pick}) slug=${entry.slug}`);
    const result = await checkPlayer(entry.slug);
    console.log(`  International URL: ${result.intlUrl || 'NOT FOUND'}`);
    await new Promise(r => setTimeout(r, 4000));
  }
}

main();
