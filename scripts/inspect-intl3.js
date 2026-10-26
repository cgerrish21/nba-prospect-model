const fs = require('fs');
const path = require('path');
const draftsDir = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const entries = [];
for (const f of fs.readdirSync(draftsDir)) {
  if (f.endsWith('.json')) entries.push(...JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf-8')));
}

// Show players with no college
const noCollege = entries.filter(e => !e.college || e.college === '');
console.log(`Total no-college: ${noCollege.length}`);
console.log('\nFirst 40:');
noCollege.slice(0, 40).forEach(e =>
  console.log(`  ${e.year} #${e.pick} ${e.name} | college: [${e.college || ''}]`)
);

// Now check a draft file to see all fields available
const sample = JSON.parse(fs.readFileSync(path.join(draftsDir, '2018.json'), 'utf-8'));
console.log('\n2018 sample entry (first):', JSON.stringify(sample[0], null, 2));

// Find known international players
const knownIntl = entries.filter(e =>
  ['Luka Dončić', 'Ricky Rubio', 'Nikola Jokić', 'Giannis Antetokounmpo', 'Rudy Gobert'].includes(e.name)
);
console.log('\nKnown international players:');
knownIntl.forEach(e => console.log(`  ${e.year} #${e.pick} ${e.name} | college: [${e.college || ''}] | slug: ${e.slug}`));
