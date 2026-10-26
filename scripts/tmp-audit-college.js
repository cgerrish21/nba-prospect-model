/**
 * Audit: Cross-reference college JSON files against draft data
 * Flags any player where scraped school != expected college from draft
 */

const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'raw', 'drafts');
const COLLEGE_DIR = path.join(__dirname, '..', 'data', 'raw', 'college');

// School name normalization map (draft data name → college page name variations)
const SCHOOL_ALIASES = {
  'UConn': ['Connecticut', 'UConn'],
  'Connecticut': ['Connecticut', 'UConn'],
  'USC': ['USC', 'Southern California'],
  'Southern California': ['USC', 'Southern California'],
  'LSU': ['LSU', 'Louisiana State'],
  'Louisiana State': ['LSU', 'Louisiana State'],
  'SMU': ['SMU', 'Southern Methodist'],
  'Southern Methodist': ['SMU', 'Southern Methodist'],
  'UCF': ['UCF', 'Central Florida'],
  'Central Florida': ['UCF', 'Central Florida'],
  'UNLV': ['UNLV', 'Nevada-Las Vegas'],
  'Nevada-Las Vegas': ['UNLV', 'Nevada-Las Vegas'],
  'VCU': ['VCU', 'Virginia Commonwealth'],
  'Virginia Commonwealth': ['VCU', 'Virginia Commonwealth'],
  'BYU': ['BYU', 'Brigham Young'],
  'Brigham Young': ['BYU', 'Brigham Young'],
  'Ole Miss': ['Ole Miss', 'Mississippi'],
  'Mississippi': ['Ole Miss', 'Mississippi'],
  'Pitt': ['Pitt', 'Pittsburgh'],
  'Pittsburgh': ['Pitt', 'Pittsburgh'],
  'Miami (FL)': ['Miami (FL)', 'Miami'],
  'Miami': ['Miami (FL)', 'Miami'],
  'NC State': ['NC State', 'North Carolina State'],
  'North Carolina State': ['NC State', 'North Carolina State'],
  'UTEP': ['UTEP', 'Texas-El Paso'],
  'Texas-El Paso': ['UTEP', 'Texas-El Paso'],
  'Saint Mary\'s (CA)': ['Saint Mary\'s', 'Saint Mary\'s (CA)', "St. Mary's", "St. Mary's (CA)"],
  'Saint Mary\'s': ['Saint Mary\'s', 'Saint Mary\'s (CA)', "St. Mary's", "St. Mary's (CA)"],
  "St. Mary's": ['Saint Mary\'s', 'Saint Mary\'s (CA)', "St. Mary's", "St. Mary's (CA)"],
  "St. Mary's (CA)": ['Saint Mary\'s', 'Saint Mary\'s (CA)', "St. Mary's", "St. Mary's (CA)"],
  'Saint Joseph\'s': ['Saint Joseph\'s', "St. Joseph's"],
  'St. John\'s': ['St. John\'s', "Saint John's", "St. John's (NY)"],
  'UCSB': ['UCSB', 'UC Santa Barbara'],
  'UC Santa Barbara': ['UCSB', 'UC Santa Barbara'],
  'UCLA': ['UCLA'],
  'UAB': ['UAB', 'Alabama-Birmingham'],
  'Alabama-Birmingham': ['UAB', 'Alabama-Birmingham'],
  'UT Martin': ['UT Martin', 'Tennessee-Martin'],
  'Tennessee-Martin': ['UT Martin', 'Tennessee-Martin'],
  // UNC variants
  'UNC': ['UNC', 'North Carolina'],
  'North Carolina': ['UNC', 'North Carolina'],
  // HTML entity artifacts from Basketball-Reference
  'Texas A&amp;M': ['Texas A&M', 'Texas A&amp;M'],
  'Texas A&M': ['Texas A&M', 'Texas A&amp;M'],
  'William &amp; Mary': ['William & Mary', 'William &amp; Mary'],
  'William & Mary': ['William & Mary', 'William &amp; Mary'],
  // University suffix variations
  'Rutgers University': ['Rutgers University', 'Rutgers'],
  'Rutgers': ['Rutgers University', 'Rutgers'],
  'Rice University': ['Rice University', 'Rice'],
  'Rice': ['Rice University', 'Rice'],
  'Marist College': ['Marist College', 'Marist'],
  'Marist': ['Marist College', 'Marist'],
  'Rider University': ['Rider University', 'Rider'],
  'Rider': ['Rider University', 'Rider'],
  'Morehead State University': ['Morehead State University', 'Morehead State'],
  'Morehead State': ['Morehead State University', 'Morehead State'],
  'Cleveland State University': ['Cleveland State University', 'Cleveland State'],
  'Cleveland State': ['Cleveland State University', 'Cleveland State'],
  'Georgia State University': ['Georgia State University', 'Georgia State'],
  'Georgia State': ['Georgia State University', 'Georgia State'],
  'Tennessee Technological University': ['Tennessee Technological University', 'Tennessee Tech'],
  'Tennessee Tech': ['Tennessee Technological University', 'Tennessee Tech'],
  'UMass': ['UMass', 'Massachusetts'],
  'Massachusetts': ['UMass', 'Massachusetts'],
  'Utah State University': ['Utah State University', 'Utah State'],
  'Utah State': ['Utah State University', 'Utah State'],
  'Ohio University': ['Ohio University', 'Ohio'],
  'Ohio': ['Ohio University', 'Ohio'],
  'Furman University': ['Furman University', 'Furman'],
  'Furman': ['Furman University', 'Furman'],
  'University of Akron': ['University of Akron', 'Akron'],
  'Akron': ['University of Akron', 'Akron'],
  // Louisiana variants
  'Louisiana': ['Louisiana', 'Louisiana–Lafayette', 'Louisiana-Lafayette'],
  'Louisiana–Lafayette': ['Louisiana', 'Louisiana–Lafayette', 'Louisiana-Lafayette'],
  'Louisiana-Lafayette': ['Louisiana', 'Louisiana–Lafayette', 'Louisiana-Lafayette'],
  // Other variations found in audit
  'University of Tennessee at Martin': ['University of Tennessee at Martin', 'UT Martin', 'Tennessee-Martin'],
  'University of North Texas': ['University of North Texas', 'North Texas'],
  'North Texas': ['University of North Texas', 'North Texas'],
  'Detroit Mercy': ['Detroit Mercy', 'Detroit'],
  'Detroit': ['Detroit Mercy', 'Detroit'],
};

function normalize(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function schoolsMatch(draftSchool, scrapedSchool) {
  if (!draftSchool || !scrapedSchool) return true; // can't compare

  // Direct match
  if (normalize(draftSchool) === normalize(scrapedSchool)) return true;

  // Check aliases
  const aliases = SCHOOL_ALIASES[draftSchool];
  if (aliases) {
    for (const alias of aliases) {
      if (normalize(alias) === normalize(scrapedSchool)) return true;
    }
  }

  // Reverse check
  const reverseAliases = SCHOOL_ALIASES[scrapedSchool];
  if (reverseAliases) {
    for (const alias of reverseAliases) {
      if (normalize(alias) === normalize(draftSchool)) return true;
    }
  }

  // Substring match for common patterns (e.g. "Texas" matches "Texas")
  const normDraft = normalize(draftSchool);
  const normScraped = normalize(scrapedSchool);

  // Transfer players: scraped school may be different from draft-listed school
  // because the draft lists where they last played. We check the last non-Career season.
  // This is handled at the caller level.

  return false;
}

function main() {
  // Load all draft entries
  const draftFiles = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.json') && !f.includes('mock'));
  const draftMap = new Map(); // slug → { name, college, year, pick }

  let totalDraftPicks = 0;
  for (const file of draftFiles) {
    const entries = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, file), 'utf-8'));
    for (const e of entries) {
      if (e.college && e.college.trim()) {
        draftMap.set(e.slug, { name: e.name, college: e.college.trim(), year: e.year, pick: e.pick });
        totalDraftPicks++;
      }
    }
  }

  console.log(`Draft data: ${totalDraftPicks} players with college listed\n`);

  // Check all college JSON files
  const collegeFiles = fs.readdirSync(COLLEGE_DIR).filter(f => f.endsWith('.json'));
  console.log(`College files: ${collegeFiles.length}\n`);

  const mismatches = [];
  const matches = [];
  const noReference = []; // college file exists but no draft entry
  const transferMatches = []; // scraped school differs but player transferred, last season matches

  for (const file of collegeFiles) {
    const slug = file.replace('.json', '');
    const college = JSON.parse(fs.readFileSync(path.join(COLLEGE_DIR, file), 'utf-8'));
    const draft = draftMap.get(slug);

    if (!draft) {
      noReference.push({ slug, scrapedSchool: college.school });
      continue;
    }

    const scrapedSchool = college.school;
    const expectedSchool = draft.college;

    // For transfers, check the last non-Career season's school too
    const realSeasons = (college.seasons || []).filter(s =>
      s.season !== 'Career' && !s.season.includes('Yr')
    );
    const lastSeasonSchool = realSeasons.length > 0
      ? realSeasons[realSeasons.length - 1].school
      : scrapedSchool;

    const topLevelMatch = schoolsMatch(expectedSchool, scrapedSchool);
    const lastSeasonMatch = schoolsMatch(expectedSchool, lastSeasonSchool);
    // For transfers: check ALL season schools, not just last
    const anySeasonMatch = realSeasons.some(s => schoolsMatch(expectedSchool, s.school));

    if (topLevelMatch || lastSeasonMatch || anySeasonMatch) {
      matches.push({ slug, name: draft.name, expected: expectedSchool, scraped: scrapedSchool });
    } else {
      // Check season years — if the last season doesn't overlap with the draft year, it's definitely wrong
      const lastSeasonYear = realSeasons.length > 0 ? realSeasons[realSeasons.length - 1].season : null;
      const draftYearStr = `${draft.year - 1}-${String(draft.year).slice(-2)}`;
      const yearMismatch = lastSeasonYear && !lastSeasonYear.includes(String(draft.year - 1));

      mismatches.push({
        slug,
        name: draft.name,
        year: draft.year,
        pick: draft.pick,
        expected: expectedSchool,
        scraped: scrapedSchool,
        lastSeasonSchool,
        lastSeason: lastSeasonYear,
        expectedSeason: draftYearStr,
        yearMismatch,
        seasons: realSeasons.length,
      });
    }
  }

  // Sort mismatches: lottery picks first, then by year
  mismatches.sort((a, b) => {
    if (a.pick <= 14 && b.pick > 14) return -1;
    if (b.pick <= 14 && a.pick > 14) return 1;
    return a.year - b.year || a.pick - b.pick;
  });

  console.log('=' .repeat(90));
  console.log(`MISMATCHES: ${mismatches.length} players with wrong school data`);
  console.log('=' .repeat(90));

  for (const m of mismatches) {
    const yearFlag = m.yearMismatch ? ' ⏰ YEAR MISMATCH' : '';
    console.log(
      `  ${m.year} #${String(m.pick).padStart(2)} ${m.name.padEnd(28)} ` +
      `Expected: ${m.expected.padEnd(22)} Got: ${m.scraped.padEnd(22)} ` +
      `(${m.lastSeason || '???'}, ${m.seasons} seasons)${yearFlag}`
    );
  }

  console.log(`\n${'='.repeat(90)}`);
  console.log(`SUMMARY`);
  console.log('='.repeat(90));
  console.log(`  Matches:     ${matches.length}`);
  console.log(`  Mismatches:  ${mismatches.length}`);
  console.log(`  No draft ref: ${noReference.length}`);
  console.log(`  Error rate:  ${(mismatches.length / (matches.length + mismatches.length) * 100).toFixed(1)}%`);

  // Check for missing college files (draft entry exists with college but no scraped file)
  let missing = 0;
  for (const [slug, draft] of draftMap) {
    if (!fs.existsSync(path.join(COLLEGE_DIR, `${slug}.json`))) {
      missing++;
    }
  }
  console.log(`  Missing files: ${missing} (draft entry with college but no scraped data)`);

  // Year mismatch subset
  const yearMismatches = mismatches.filter(m => m.yearMismatch);
  console.log(`  Year mismatches: ${yearMismatches.length} (definitely wrong player, not just wrong school name)`);

  // Export mismatches for further processing
  const outPath = path.join(__dirname, '..', 'data', 'college-audit.json');
  fs.writeFileSync(outPath, JSON.stringify({ mismatches, summary: {
    matches: matches.length,
    mismatches: mismatches.length,
    noReference: noReference.length,
    missing,
    errorRate: (mismatches.length / (matches.length + mismatches.length) * 100).toFixed(1) + '%',
  }}, null, 2));
  console.log(`\n  Full audit saved to ${outPath}`);
}

main();
