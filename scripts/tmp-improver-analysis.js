const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLEGE_DIR = path.join(DATA_DIR, 'raw', 'college');
const NBA_DIR = path.join(DATA_DIR, 'raw', 'nba');
const DRAFTS_DIR = path.join(DATA_DIR, 'raw', 'drafts');

// Load all draft entries
const allDraft = [];
for (const f of fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf-8'));
  allDraft.push(...data);
}

function avg(arr) { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function correlation(x, y) {
  const n = x.length;
  if (n < 5) return 0;
  const xm = avg(x), ym = avg(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xm) * (y[i] - ym);
    dx += (x[i] - xm) ** 2;
    dy += (y[i] - ym) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

// Build player records
const players = [];

for (const entry of allDraft) {
  if (entry.year > 2022) continue; // need 3+ NBA seasons
  if (entry.year < 2005) continue;

  const collegePath = path.join(COLLEGE_DIR, entry.slug + '.json');
  const nbaPath = path.join(NBA_DIR, entry.slug + '.json');
  if (!fs.existsSync(collegePath) || !fs.existsSync(nbaPath)) continue;

  const college = JSON.parse(fs.readFileSync(collegePath, 'utf-8'));
  const nba = JSON.parse(fs.readFileSync(nbaPath, 'utf-8'));

  const realSeasons = college.seasons.filter(s => s.season !== 'Career' && !s.season.includes('Yr'));
  if (realSeasons.length === 0) continue;
  const lastCollege = realSeasons[realSeasons.length - 1];

  // NBA seasons (real)
  const nbaSeasons = (nba.seasons || []).filter(s =>
    s.season && s.season.match(/^\d{4}-\d{2}$/) && s.team && s.team !== '' && s.team !== 'TOT'
  );

  // Meaningful NBA seasons (600+ total min in that season)
  const meaningfulNBA = nbaSeasons.filter(s => (s.minutesPerGame || 0) * (s.gamesPlayed || 0) >= 600);
  if (meaningfulNBA.length < 2) continue;

  // NBA FT% — best season with decent FTA volume (30+ FTA in the season as a rough proxy)
  // We don't have FTA per game in NBA data, but ftPct > 0 means they shot some
  const ftSeasons = meaningfulNBA.filter(s => s.ftPct > 0);
  const bestNBAFT = ftSeasons.length > 0 ? Math.max(...ftSeasons.map(s => s.ftPct)) : null;
  const avgNBAFT = ftSeasons.length > 0 ? avg(ftSeasons.map(s => s.ftPct)) : null;

  // NBA FG% — best season
  const fgSeasons = meaningfulNBA.filter(s => s.fgPct > 0);
  const bestNBAFG = fgSeasons.length > 0 ? Math.max(...fgSeasons.map(s => s.fgPct)) : null;

  // NBA peak PPG
  const peakPPG = meaningfulNBA.length > 0 ? Math.max(...meaningfulNBA.map(s => s.pts || 0)) : null;

  // NBA 3PM/game in best season (proxy for 3PT development even without %)
  const threePMSeasons = meaningfulNBA.filter(s => s.threePM >= 0);
  const peak3PM = threePMSeasons.length > 0 ? Math.max(...threePMSeasons.map(s => s.threePM)) : null;
  const avg3PM = threePMSeasons.length > 0 ? avg(threePMSeasons.map(s => s.threePM)) : null;

  // Meaningful career seasons count (900+ min)
  const meaningfulCount = nbaSeasons.filter(s =>
    (s.minutesPerGame || 0) * (s.gamesPlayed || 0) >= 900
  ).length;

  // College stats
  const collegeFT = lastCollege.ftPct || 0;
  const collegeFG = lastCollege.fgPct || 0;
  const college3PT = lastCollege.threePtPct || 0;
  const collegeTS = lastCollege.trueShootingPct || 0;
  const college3PM = lastCollege.threePM || 0;
  const collegeBPM = lastCollege.boxPlusMinus || 0;
  const collegeUSG = lastCollege.usageRate || 0;
  const collegeMPG = lastCollege.minutesPerGame || 0;
  const collegeFTA = lastCollege.fta || 0;
  const collegeWS40 = lastCollege.winSharesPer40 || 0;

  const mpg = collegeMPG || 1;
  const per40PTS = (lastCollege.pts / mpg) * 40;
  const per40AST = (lastCollege.ast / mpg) * 40;
  const per40STL = (lastCollege.stl / mpg) * 40;
  const per40BLK = (lastCollege.blk / mpg) * 40;
  const per40REB = (lastCollege.reb / mpg) * 40;
  const per40FTA = (collegeFTA / mpg) * 40;
  const astToTov = lastCollege.tov > 0 ? lastCollege.ast / lastCollege.tov : lastCollege.ast;

  // Deltas
  const deltaFT = bestNBAFT != null && collegeFT > 0.01 ? bestNBAFT - collegeFT : null;
  const deltaFG = bestNBAFG != null && collegeFG > 0.01 ? bestNBAFG - collegeFG : null;
  // 3PM growth: college 3PM/g vs NBA peak 3PM/g
  const delta3PM = peak3PM != null && college3PM > 0 ? peak3PM - college3PM : null;

  players.push({
    name: entry.name, pick: entry.pick, year: entry.year,
    classYear: realSeasons.length,
    college: {
      school: lastCollege.school,
      pts: lastCollege.pts, reb: lastCollege.reb, ast: lastCollege.ast,
      stl: lastCollege.stl, blk: lastCollege.blk, tov: lastCollege.tov,
      mpg: collegeMPG, fta: collegeFTA,
      fgPct: collegeFG, threePtPct: college3PT, ftPct: collegeFT,
      threePM: college3PM,
      ts: collegeTS, bpm: collegeBPM, usg: collegeUSG, ws40: collegeWS40,
      per40PTS, per40AST, per40STL, per40BLK, per40REB, per40FTA, astToTov,
    },
    nba: {
      bestFT: bestNBAFT, avgFT: avgNBAFT, bestFG: bestNBAFG,
      peakPPG, peak3PM, avg3PM,
      meaningfulSeasons: meaningfulCount,
    },
    deltaFT, deltaFG, delta3PM,
  });
}

console.log(`Loaded ${players.length} players with college + NBA data (2005-2022)\n`);

// ═══════════════════════════════════════════════════
// 1. BIGGEST FT% IMPROVERS
// ═══════════════════════════════════════════════════

const withFT = players.filter(p => p.deltaFT != null);
withFT.sort((a, b) => b.deltaFT - a.deltaFT);

console.log('='.repeat(130));
console.log('BIGGEST FT% IMPROVERS (college last season → NBA best season)');
console.log('='.repeat(130));
console.log('Name'.padEnd(24) + 'Pk'.padStart(3) + ' Yr' +
  '  C-FT%'.padStart(8) + '  N-FT%'.padStart(8) + '  Delta'.padStart(8) +
  '  C-FG%'.padStart(8) + '  N-FG%'.padStart(8) +
  '  C-3PT%'.padStart(9) + '  C-FTA/g'.padStart(10) +
  '  C-BPM'.padStart(8) + '  C-TS%'.padStart(8) + '  C-MPG'.padStart(8) +
  '  MnSzns'.padStart(8) + '  PkPPG'.padStart(7));
console.log('-'.repeat(130));

for (const p of withFT.slice(0, 35)) {
  console.log(
    p.name.substring(0, 23).padEnd(24) +
    String(p.pick).padStart(3) + ' ' + String(p.year).substring(2) +
    ('  ' + (p.college.ftPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFT * 100).toFixed(1) + '%').padStart(8) +
    ('  +' + (p.deltaFT * 100).toFixed(1)).padStart(8) +
    ('  ' + (p.college.fgPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFG != null ? (p.nba.bestFG * 100).toFixed(1) + '%' : '---')).padStart(8) +
    ('  ' + (p.college.threePtPct * 100).toFixed(1) + '%').padStart(9) +
    ('  ' + p.college.fta.toFixed(1)).padStart(10) +
    ('  ' + p.college.bpm.toFixed(1)).padStart(8) +
    ('  ' + (p.college.ts * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.college.mpg.toFixed(1)).padStart(8) +
    ('  ' + p.nba.meaningfulSeasons).padStart(8) +
    ('  ' + (p.nba.peakPPG || 0).toFixed(1)).padStart(7)
  );
}

console.log('\n  BIGGEST FT% DECLINERS:');
console.log('-'.repeat(130));
for (const p of withFT.slice(-20).reverse()) {
  console.log(
    p.name.substring(0, 23).padEnd(24) +
    String(p.pick).padStart(3) + ' ' + String(p.year).substring(2) +
    ('  ' + (p.college.ftPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFT * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.deltaFT * 100).toFixed(1)).padStart(8) +
    ('  ' + (p.college.fgPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFG != null ? (p.nba.bestFG * 100).toFixed(1) + '%' : '---')).padStart(8) +
    ('  ' + (p.college.threePtPct * 100).toFixed(1) + '%').padStart(9) +
    ('  ' + p.college.fta.toFixed(1)).padStart(10) +
    ('  ' + p.college.bpm.toFixed(1)).padStart(8) +
    ('  ' + (p.college.ts * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.college.mpg.toFixed(1)).padStart(8) +
    ('  ' + p.nba.meaningfulSeasons).padStart(8) +
    ('  ' + (p.nba.peakPPG || 0).toFixed(1)).padStart(7)
  );
}

// ═══════════════════════════════════════════════════
// 2. 3PM VOLUME GROWTH
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('BIGGEST 3PM/GAME GROWTH (college → NBA peak) — proxy for 3PT development');
console.log('='.repeat(130));

const with3PM = players.filter(p => p.delta3PM != null);
with3PM.sort((a, b) => b.delta3PM - a.delta3PM);

console.log('Name'.padEnd(24) + 'Pk'.padStart(3) + ' Yr' +
  '  C-3PM/g'.padStart(10) + '  N-Peak3PM'.padStart(12) + '  Delta'.padStart(8) +
  '  C-3PT%'.padStart(9) + '  C-FT%'.padStart(8) + '  C-FTA/g'.padStart(10) +
  '  C-BPM'.padStart(8) + '  C-TS%'.padStart(8) +
  '  MnSzns'.padStart(8) + '  PkPPG'.padStart(7));
console.log('-'.repeat(130));

for (const p of with3PM.slice(0, 30)) {
  console.log(
    p.name.substring(0, 23).padEnd(24) +
    String(p.pick).padStart(3) + ' ' + String(p.year).substring(2) +
    ('  ' + p.college.threePM.toFixed(1)).padStart(10) +
    ('  ' + p.nba.peak3PM.toFixed(1)).padStart(12) +
    ('  +' + p.delta3PM.toFixed(1)).padStart(8) +
    ('  ' + (p.college.threePtPct * 100).toFixed(1) + '%').padStart(9) +
    ('  ' + (p.college.ftPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.college.fta.toFixed(1)).padStart(10) +
    ('  ' + p.college.bpm.toFixed(1)).padStart(8) +
    ('  ' + (p.college.ts * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.nba.meaningfulSeasons).padStart(8) +
    ('  ' + (p.nba.peakPPG || 0).toFixed(1)).padStart(7)
  );
}

// ═══════════════════════════════════════════════════
// 3. SHARED MARKERS: FT improvers vs decliners
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('SHARED MARKERS: What do FT% improvers have in common?');
console.log('='.repeat(130));

const ftImprovers = withFT.filter(p => p.deltaFT >= 0.05);
const ftFlat = withFT.filter(p => Math.abs(p.deltaFT) < 0.02);
const ftDecliners = withFT.filter(p => p.deltaFT <= -0.05);

function printGroupStats(group, label) {
  if (group.length < 5) { console.log(`  ${label}: n=${group.length} (too small)`); return; }
  const stats = [
    ['FT%', g => avg(g.map(p => p.college.ftPct))],
    ['FG%', g => avg(g.map(p => p.college.fgPct))],
    ['3PT%', g => avg(g.map(p => p.college.threePtPct))],
    ['TS%', g => avg(g.map(p => p.college.ts))],
    ['FTA/g', g => avg(g.map(p => p.college.fta))],
    ['FTA/40', g => avg(g.map(p => p.college.per40FTA))],
    ['BPM', g => avg(g.map(p => p.college.bpm))],
    ['USG%', g => avg(g.map(p => p.college.usg))],
    ['WS/40', g => avg(g.map(p => p.college.ws40))],
    ['MPG', g => avg(g.map(p => p.college.mpg))],
    ['PTS/40', g => avg(g.map(p => p.college.per40PTS))],
    ['AST/40', g => avg(g.map(p => p.college.per40AST))],
    ['STL/40', g => avg(g.map(p => p.college.per40STL))],
    ['AST/TO', g => avg(g.map(p => p.college.astToTov))],
    ['ClassYr', g => avg(g.map(p => p.classYear))],
    ['Pick', g => avg(g.map(p => p.pick))],
    ['NBA Szns', g => avg(g.map(p => p.nba.meaningfulSeasons))],
    ['PeakPPG', g => avg(g.map(p => p.nba.peakPPG || 0))],
  ];
  console.log(`\n  ${label} (n=${group.length}):`);
  for (const [name, fn] of stats) {
    const val = fn(group);
    const isPct = ['FT%', 'FG%', '3PT%', 'TS%'].includes(name);
    const fmt = isPct ? (val * 100).toFixed(1) + '%' : val.toFixed(2);
    console.log(`    ${name.padEnd(10)} ${fmt.padStart(8)}`);
  }
}

printGroupStats(ftImprovers, 'FT IMPROVERS (+5%+ in NBA)');
printGroupStats(ftFlat, 'FT FLAT (±2%)');
printGroupStats(ftDecliners, 'FT DECLINERS (-5%+ in NBA)');

// ═══════════════════════════════════════════════════
// 4. CORRELATIONS: What college stats predict FT improvement?
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('CORRELATIONS: What college stats predict FT% improvement?');
console.log('='.repeat(130));

const ftDeltaArr = withFT.map(p => p.deltaFT);
const corrPairs = [
  ['College FT%', withFT.map(p => p.college.ftPct)],
  ['College FTA/g', withFT.map(p => p.college.fta)],
  ['College FTA/40', withFT.map(p => p.college.per40FTA)],
  ['College 3PT%', withFT.map(p => p.college.threePtPct)],
  ['College TS%', withFT.map(p => p.college.ts)],
  ['College BPM', withFT.map(p => p.college.bpm)],
  ['College USG%', withFT.map(p => p.college.usg)],
  ['College WS/40', withFT.map(p => p.college.ws40)],
  ['College MPG', withFT.map(p => p.college.mpg)],
  ['College PTS/40', withFT.map(p => p.college.per40PTS)],
  ['College AST/40', withFT.map(p => p.college.per40AST)],
  ['College STL/40', withFT.map(p => p.college.per40STL)],
  ['Draft Pick', withFT.map(p => p.pick)],
  ['Class Year', withFT.map(p => p.classYear)],
];

console.log('\n  Correlating with FT% delta (NBA best - college last):');
for (const [label, arr] of corrPairs) {
  const r = correlation(arr, ftDeltaArr);
  const sig = Math.abs(r) >= 0.20 ? ' ***' : Math.abs(r) >= 0.15 ? ' **' : Math.abs(r) >= 0.10 ? ' *' : '';
  console.log(`    ${label.padEnd(20)} r = ${r.toFixed(3).padStart(7)}${sig}`);
}

// Same for 3PM growth
console.log('\n  Correlating with 3PM/game growth (NBA peak - college):');
const pm3DeltaArr = with3PM.map(p => p.delta3PM);
const corr3PM = [
  ['College FT%', with3PM.map(p => p.college.ftPct)],
  ['College FTA/g', with3PM.map(p => p.college.fta)],
  ['College 3PT%', with3PM.map(p => p.college.threePtPct)],
  ['College 3PM/g', with3PM.map(p => p.college.threePM)],
  ['College TS%', with3PM.map(p => p.college.ts)],
  ['College BPM', with3PM.map(p => p.college.bpm)],
  ['College PTS/40', with3PM.map(p => p.college.per40PTS)],
  ['Draft Pick', with3PM.map(p => p.pick)],
  ['Class Year', with3PM.map(p => p.classYear)],
];
for (const [label, arr] of corr3PM) {
  const r = correlation(arr, pm3DeltaArr);
  const sig = Math.abs(r) >= 0.20 ? ' ***' : Math.abs(r) >= 0.15 ? ' **' : Math.abs(r) >= 0.10 ? ' *' : '';
  console.log(`    ${label.padEnd(20)} r = ${r.toFixed(3).padStart(7)}${sig}`);
}

// ═══════════════════════════════════════════════════
// 5. FT% BUCKET ANALYSIS
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('FT% BUCKET: How does college FT% predict NBA FT% and career outcomes?');
console.log('='.repeat(130));

const ftBuckets = [
  { label: 'FT% < 60%', min: 0, max: 0.60 },
  { label: 'FT% 60-68%', min: 0.60, max: 0.68 },
  { label: 'FT% 68-75%', min: 0.68, max: 0.75 },
  { label: 'FT% 75-82%', min: 0.75, max: 0.82 },
  { label: 'FT% 82%+', min: 0.82, max: 1.01 },
];

console.log('\n' + 'FT% Bucket'.padEnd(16) + '  N'.padStart(4) +
  '  C-FT%'.padStart(8) + '  N-FT%'.padStart(8) + '  Delta'.padStart(8) +
  '  Avg NBA 3PM'.padStart(14) + '  Peak PPG'.padStart(11) +
  '  Meaningful Szns'.padStart(18) + '  Bust Rate'.padStart(12));
console.log('-'.repeat(110));

for (const b of ftBuckets) {
  const bucket = withFT.filter(p => p.college.ftPct >= b.min && p.college.ftPct < b.max);
  if (bucket.length < 5) continue;
  const cft = avg(bucket.map(p => p.college.ftPct));
  const nft = avg(bucket.map(p => p.nba.bestFT));
  const delta = avg(bucket.map(p => p.deltaFT));
  const a3pm = avg(bucket.map(p => p.nba.avg3PM || 0));
  const ppg = avg(bucket.map(p => p.nba.peakPPG || 0));
  const ms = avg(bucket.map(p => p.nba.meaningfulSeasons));
  const busts = bucket.filter(p => p.nba.meaningfulSeasons < 2).length;

  console.log(
    b.label.padEnd(16) +
    String(bucket.length).padStart(4) +
    ('  ' + (cft * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (nft * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (delta > 0 ? '+' : '') + (delta * 100).toFixed(1)).padStart(8) +
    ('  ' + a3pm.toFixed(1)).padStart(14) +
    ('  ' + ppg.toFixed(1)).padStart(11) +
    ('  ' + ms.toFixed(1)).padStart(18) +
    ('  ' + busts + '/' + bucket.length + ' (' + (busts / bucket.length * 100).toFixed(0) + '%)').padStart(12)
  );
}

// ═══════════════════════════════════════════════════
// 6. AGE EFFECT
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('AGE EFFECT: Do younger players improve shooting more?');
console.log('='.repeat(130));

for (const [yr, label] of [[1, 'Freshmen'], [2, 'Sophomores'], [3, 'Juniors+']]) {
  const group = withFT.filter(p => yr < 3 ? p.classYear === yr : p.classYear >= yr);
  if (group.length < 10) continue;
  const dft = avg(group.map(p => p.deltaFT));
  const cft = avg(group.map(p => p.college.ftPct));
  const nft = avg(group.map(p => p.nba.bestFT));
  const d3pm = avg(group.filter(p => p.delta3PM != null).map(p => p.delta3PM));
  console.log(`  ${label} (n=${group.length}): college FT ${(cft * 100).toFixed(1)}% → NBA ${(nft * 100).toFixed(1)}% (${(dft > 0 ? '+' : '') + (dft * 100).toFixed(1)}%), 3PM growth: +${d3pm.toFixed(1)}/g`);
}

// ═══════════════════════════════════════════════════
// 7. THE DEMIN QUESTION: Poor college shooters who developed
// ═══════════════════════════════════════════════════

console.log('\n' + '='.repeat(130));
console.log('POOR COLLEGE SHOOTERS WHO DEVELOPED: FT% <72% in college, FT% >80% in NBA');
console.log('='.repeat(130));

const poorToGood = players.filter(p =>
  p.college.ftPct > 0.01 && p.college.ftPct < 0.72 &&
  p.nba.bestFT != null && p.nba.bestFT >= 0.80
);
poorToGood.sort((a, b) => b.deltaFT - a.deltaFT);

console.log(`\n${poorToGood.length} players went from <72% FT in college to >80% FT in NBA:`);
console.log('Name'.padEnd(24) + 'Pk'.padStart(3) + ' Yr' +
  '  C-FT%'.padStart(8) + '  N-FT%'.padStart(8) + '  FTA/g'.padStart(8) + '  C-FG%'.padStart(8) +
  '  C-3PT%'.padStart(9) + '  C-BPM'.padStart(8) + '  C-TS%'.padStart(8) +
  '  MnSzns'.padStart(8) + '  PkPPG'.padStart(7) + '  Class'.padStart(6));
console.log('-'.repeat(115));

for (const p of poorToGood) {
  console.log(
    p.name.substring(0, 23).padEnd(24) +
    String(p.pick).padStart(3) + ' ' + String(p.year).substring(2) +
    ('  ' + (p.college.ftPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFT * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.college.fta.toFixed(1)).padStart(8) +
    ('  ' + (p.college.fgPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.college.threePtPct * 100).toFixed(1) + '%').padStart(9) +
    ('  ' + p.college.bpm.toFixed(1)).padStart(8) +
    ('  ' + (p.college.ts * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.nba.meaningfulSeasons).padStart(8) +
    ('  ' + (p.nba.peakPPG || 0).toFixed(1)).padStart(7) +
    ('  ' + p.classYear + 'yr').padStart(6)
  );
}

// And the ones who stayed bad
console.log('\n\nPOOR COLLEGE SHOOTERS WHO STAYED BAD: FT% <72% in college, FT% <75% in NBA');
console.log('-'.repeat(115));

const stayedBad = players.filter(p =>
  p.college.ftPct > 0.01 && p.college.ftPct < 0.72 &&
  p.nba.bestFT != null && p.nba.bestFT < 0.75
);
stayedBad.sort((a, b) => a.nba.bestFT - b.nba.bestFT);

for (const p of stayedBad.slice(0, 25)) {
  console.log(
    p.name.substring(0, 23).padEnd(24) +
    String(p.pick).padStart(3) + ' ' + String(p.year).substring(2) +
    ('  ' + (p.college.ftPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.nba.bestFT * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.college.fta.toFixed(1)).padStart(8) +
    ('  ' + (p.college.fgPct * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + (p.college.threePtPct * 100).toFixed(1) + '%').padStart(9) +
    ('  ' + p.college.bpm.toFixed(1)).padStart(8) +
    ('  ' + (p.college.ts * 100).toFixed(1) + '%').padStart(8) +
    ('  ' + p.nba.meaningfulSeasons).padStart(8) +
    ('  ' + (p.nba.peakPPG || 0).toFixed(1)).padStart(7) +
    ('  ' + p.classYear + 'yr').padStart(6)
  );
}

// Compare the two groups
console.log('\n\nCOMPARISON: Poor college FT% who improved vs stayed bad');
console.log('-'.repeat(80));
function compareGroups(g1, l1, g2, l2) {
  const stats = [
    ['Draft Pick', g => avg(g.map(p => p.pick)), v => v.toFixed(1)],
    ['Class Year', g => avg(g.map(p => p.classYear)), v => v.toFixed(1)],
    ['College FT%', g => avg(g.map(p => p.college.ftPct)), v => (v * 100).toFixed(1) + '%'],
    ['College FTA/g', g => avg(g.map(p => p.college.fta)), v => v.toFixed(1)],
    ['College FTA/40', g => avg(g.map(p => p.college.per40FTA)), v => v.toFixed(1)],
    ['College FG%', g => avg(g.map(p => p.college.fgPct)), v => (v * 100).toFixed(1) + '%'],
    ['College 3PT%', g => avg(g.map(p => p.college.threePtPct)), v => (v * 100).toFixed(1) + '%'],
    ['College TS%', g => avg(g.map(p => p.college.ts)), v => (v * 100).toFixed(1) + '%'],
    ['College BPM', g => avg(g.map(p => p.college.bpm)), v => v.toFixed(1)],
    ['College USG%', g => avg(g.map(p => p.college.usg)), v => v.toFixed(1)],
    ['College MPG', g => avg(g.map(p => p.college.mpg)), v => v.toFixed(1)],
    ['College STL/40', g => avg(g.map(p => p.college.per40STL)), v => v.toFixed(1)],
    ['College AST/TO', g => avg(g.map(p => p.college.astToTov)), v => v.toFixed(2)],
    ['NBA Meaningful Szns', g => avg(g.map(p => p.nba.meaningfulSeasons)), v => v.toFixed(1)],
    ['NBA Peak PPG', g => avg(g.map(p => p.nba.peakPPG || 0)), v => v.toFixed(1)],
  ];

  console.log('  ' + 'Stat'.padEnd(22) + l1.padStart(14) + l2.padStart(14) + '  Diff'.padStart(10));
  console.log('  ' + '-'.repeat(60));
  for (const [name, fn, fmt] of stats) {
    const v1 = fn(g1);
    const v2 = fn(g2);
    console.log('  ' + name.padEnd(22) + fmt(v1).padStart(14) + fmt(v2).padStart(14) + ('  ' + fmt(v1 - v2)).padStart(10));
  }
}

if (poorToGood.length >= 5 && stayedBad.length >= 5) {
  compareGroups(poorToGood, 'Improved', stayedBad, 'Stayed Bad');
}
