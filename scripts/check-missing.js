const fs = require('fs');
const path = require('path');

const draftsDir = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const nbaDir = path.join(__dirname, '..', 'data', 'raw', 'nba');

// Load all draft entries
const entries = [];
for (const f of fs.readdirSync(draftsDir)) {
  if (f.endsWith('.json')) {
    entries.push(...JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf-8')));
  }
}

// Check which slugs have NBA files
const nbaFiles = new Set(fs.readdirSync(nbaDir).map(f => f.replace('.json', '')));
const missing = entries.filter(e => !nbaFiles.has(e.slug));

console.log('Total draft entries:', entries.length);
console.log('Have NBA data:', nbaFiles.size);
console.log('Missing:', missing.length);
console.log('');

// Categorize missing
const intl = missing.filter(e => !e.college || e.college === '');
const withCollege = missing.filter(e => e.college && e.college !== '');

console.log('Missing + no college (international/never played):', intl.length);
console.log('Missing + has college (likely rate-limited or slug issue):', withCollege.length);
console.log('');

console.log('Missing with college (first 30):');
withCollege.slice(0, 30).forEach(e => {
  console.log(`  ${e.name} (${e.year} #${e.pick}) slug=${e.slug} college=${e.college}`);
});

console.log('');
console.log('Missing international (first 20):');
intl.slice(0, 20).forEach(e => {
  console.log(`  ${e.name} (${e.year} #${e.pick}) slug=${e.slug}`);
});

// Missing by year
const byYear = {};
const totalByYear = {};
for (const e of entries) {
  totalByYear[e.year] = (totalByYear[e.year] || 0) + 1;
}
for (const e of missing) {
  byYear[e.year] = (byYear[e.year] || 0) + 1;
}
console.log('\nMissing NBA data by draft year:');
for (const y of Object.keys(totalByYear).sort()) {
  const m = byYear[y] || 0;
  console.log(`  ${y}: ${m}/${totalByYear[y]} missing`);
}

// Also check team stats
const teamsDir = path.join(__dirname, '..', 'data', 'raw', 'teams');
const collegeDir = path.join(__dirname, '..', 'data', 'raw', 'college');
const teamFiles = new Set(fs.readdirSync(teamsDir).map(f => f.replace('.json', '')));
const collegeFiles = fs.readdirSync(collegeDir).filter(f => f.endsWith('.json'));

// Build expected team pairs
const pairsMap = new Map();
for (const f of collegeFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(collegeDir, f), 'utf-8'));
  const realSeasons = data.seasons.filter(s => s.season.indexOf('Career') === -1);
  if (realSeasons.length === 0) continue;
  const last = realSeasons[realSeasons.length - 1];
  if (!last.school) continue;
  const slug = last.school.toLowerCase().replace(/[()]/g, '').replace(/\./g, '').replace(/&/g, '').replace(/'/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  const key = `${slug}_${last.season}`;
  if (!pairsMap.has(key)) {
    pairsMap.set(key, { school: last.school, season: last.season, slug });
  }
}

const missingTeams = [...pairsMap.entries()].filter(([key]) => !teamFiles.has(key));
console.log('\n--- Team Stats ---');
console.log('Expected team/season pairs:', pairsMap.size);
console.log('Have team data:', teamFiles.size);
console.log('Missing team data:', missingTeams.length);
if (missingTeams.length > 0) {
  console.log('Missing teams (first 20):');
  missingTeams.slice(0, 20).forEach(([key, val]) => {
    console.log(`  ${val.school} ${val.season} → ${key}`);
  });
}
