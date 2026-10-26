const fs = require('fs');
const path = require('path');
const dataset = JSON.parse(fs.readFileSync('./data/dataset.json', 'utf-8'));
const dir = './data/raw/nba';
const combineDir = './data/raw/combine';

// Build a lookup of REAL combine drill data
const realCombine = new Map();
for (const f of fs.readdirSync(combineDir).filter(f => f.endsWith('.json'))) {
  const records = JSON.parse(fs.readFileSync(path.join(combineDir, f), 'utf-8'));
  for (const r of records) {
    const key = r.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
    realCombine.set(key, r);
  }
}

const combinePositions = new Map();
for (const [k, v] of realCombine) {
  if (v.position) combinePositions.set(k, v.position);
}

function assignPosition(r) {
  const key = r.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const combinePos = combinePositions.get(key);
  const height = r.features.heightInches || 0;
  const ast = r.features.astPer40 || 0;
  const reb = r.features.rebPer40 || 0;
  const blk = r.features.blkPer40 || 0;
  if (combinePos) {
    const parts = combinePos.split('-');
    if (parts.length === 1) {
      if (parts[0] === 'PG' || parts[0] === 'SG') return 'Guard';
      if (parts[0] === 'SF') return 'Wing';
      return 'Big';
    }
    const hasGuard = parts.some(p => p === 'PG' || p === 'SG');
    const hasBig = parts.some(p => p === 'PF' || p === 'C');
    const hasWing = parts.some(p => p === 'SF');
    if (hasGuard && !hasBig && !hasWing) return 'Guard';
    if (hasBig && !hasGuard && !hasWing) return 'Big';
    if (hasWing && hasBig) {
      if (height >= 80) return 'Big';
      if (height > 0) return height >= 78 && (reb >= 8 || blk >= 1.5) ? 'Big' : 'Wing';
      return reb >= 8 || blk >= 1.5 ? 'Big' : 'Wing';
    }
    if (hasGuard && hasWing) {
      if (height >= 78) return 'Wing';
      if (height > 0) return 'Guard';
      return ast >= 4 ? 'Guard' : 'Wing';
    }
    if (height >= 80) return 'Big';
    if (height <= 76) return 'Guard';
    return 'Wing';
  }
  if (height > 0) {
    if (height >= 81 || (reb >= 10 && blk >= 2)) return 'Big';
    if (height <= 76 || (ast >= 5 && reb < 7)) return 'Guard';
    return 'Wing';
  }
  if (ast >= 4.5 && reb < 7) return 'Guard';
  if (reb >= 9 || blk >= 2) return 'Big';
  return 'Wing';
}

const bigs = [];
for (const entry of dataset) {
  if (entry.draftYear > 2020) continue;
  if (assignPosition(entry) !== 'Big') continue;
  const nbaPath = path.join(dir, entry.slug + '.json');
  if (!fs.existsSync(nbaPath)) continue;
  const d = JSON.parse(fs.readFileSync(nbaPath, 'utf-8'));
  const realSeasons = d.seasons.filter(s => s.season && s.season.match(/^\d{4}-\d{2}$/) && s.team && s.team !== '');
  let meaningful = 0;
  for (const s of realSeasons) {
    if ((s.minutesPerGame || 0) * (s.gamesPlayed || 0) >= 900) meaningful++;
  }
  const nameKey = entry.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const combine = realCombine.get(nameKey);
  bigs.push({ ...entry, meaningful, isBust: meaningful < 2, combine: combine || null });
}

function avg(arr) { return arr.length > 0 ? arr.reduce((s,v) => s+v, 0) / arr.length : 0; }
function correlation(x, y) {
  const n = x.length;
  if (n < 5) return 0;
  const xm = avg(x), ym = avg(y);
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++) {
    num += (x[i]-xm)*(y[i]-ym);
    dx += (x[i]-xm)**2;
    dy += (y[i]-ym)**2;
  }
  return dx>0&&dy>0 ? num/Math.sqrt(dx*dy) : 0;
}

const allStats = [
  {key: 'heightNoShoes', label: 'Height (no shoes)', lower: false},
  {key: 'weight', label: 'Weight', lower: false},
  {key: 'wingspan', label: 'Wingspan', lower: false},
  {key: 'standingReach', label: 'Standing Reach', lower: false},
  {key: 'laneAgility', label: 'Lane Agility', lower: true},
  {key: 'shuttleRun', label: 'Shuttle Run', lower: true},
  {key: 'sprint', label: '3/4 Sprint', lower: true},
  {key: 'standingVertical', label: 'Standing Vert', lower: false},
  {key: 'maxVertical', label: 'Max Vert', lower: false},
  {key: 'benchPress', label: 'Bench Press', lower: false},
  {key: 'handLength', label: 'Hand Length', lower: false},
  {key: 'handWidth', label: 'Hand Width', lower: false},
];

// For each range, show real combine data only
for (const rng of [
  {name: 'ALL 1ST ROUND BIGS (1-30)', min: 1, max: 30},
  {name: 'LOTTERY BIGS (1-14)', min: 1, max: 14},
  {name: 'LATE 1ST BIGS (15-30)', min: 15, max: 30},
]) {
  const bucket = bigs.filter(b => b.pick >= rng.min && b.pick <= rng.max && b.combine);
  const survs = bucket.filter(b => !b.isBust);
  const busts = bucket.filter(b => b.isBust);

  console.log('\n' + '='.repeat(95));
  console.log(rng.name + ' — REAL COMBINE DATA ONLY (' + busts.length + ' busts, ' + survs.length + ' survivors)');
  console.log('='.repeat(95));
  console.log('Stat'.padEnd(18) + 'r'.padStart(8) + 'N'.padStart(5) + '(S/B)'.padStart(8) + 'Surv'.padStart(9) + 'Bust'.padStart(9) + 'Diff'.padStart(9) + '  Note');
  console.log('-'.repeat(95));

  for (const stat of allStats) {
    const withData = bucket.filter(b => b.combine[stat.key] != null && b.combine[stat.key] !== 0 && b.combine[stat.key] !== '');
    if (withData.length < 10) continue;

    const sv = withData.filter(b => !b.isBust);
    const bv = withData.filter(b => b.isBust);
    if (bv.length < 3 || sv.length < 5) continue;

    const r = correlation(withData.map(b => Number(b.combine[stat.key])), withData.map(b => b.meaningful));
    const sa = avg(sv.map(b => Number(b.combine[stat.key])));
    const ba = avg(bv.map(b => Number(b.combine[stat.key])));
    const d = sa - ba;
    const pctDiff = sa !== 0 ? Math.abs(d/sa) * 100 : 0;

    let note = '';
    if (stat.lower) {
      if (d < 0 && pctDiff > 2) note = 'Survivors FASTER';
      else if (d > 0 && pctDiff > 2) note = 'Busts faster??';
    } else {
      if (d > 0 && pctDiff > 2) note = 'Survivors bigger/better';
      else if (d < 0 && pctDiff > 2) note = 'Busts bigger??';
    }

    console.log(
      stat.label.padEnd(18) +
      r.toFixed(3).padStart(8) +
      String(withData.length).padStart(5) +
      ('(' + sv.length + '/' + bv.length + ')').padStart(8) +
      sa.toFixed(1).padStart(9) +
      ba.toFixed(1).padStart(9) +
      ((d>0?'+':'') + d.toFixed(1)).padStart(9) +
      '  ' + note
    );
  }
}

// Bench press deep dive
function benchTier(reps) { if (reps >= 15) return '15+'; if (reps >= 10) return '10-14'; return '<10'; }

const all1stBench = bigs.filter(b => b.pick <= 30 && b.combine && b.combine.benchPress);
console.log('\n' + '='.repeat(70));
console.log('BUST RATE BY BENCH PRESS TIER — 1ST ROUND BIGS');
console.log('='.repeat(70));
for (const tier of ['15+', '10-14', '<10']) {
  const inTier = all1stBench.filter(b => benchTier(b.combine.benchPress) === tier);
  const busts = inTier.filter(b => b.isBust);
  const survs = inTier.filter(b => !b.isBust);
  console.log('  ' + tier.padEnd(6) + ': ' + busts.length + '/' + inTier.length + ' bust (' + (busts.length/inTier.length*100).toFixed(0) + '%)');
  console.log('    Survivors: ' + survs.map(b => b.name.substring(0,18) + '(' + b.combine.benchPress + ')').join(', '));
  console.log('    Busts:     ' + busts.map(b => b.name.substring(0,18) + '(' + b.combine.benchPress + ')').join(', '));
}

// Max vert for lottery bigs
const lotteryVert = bigs.filter(b => b.pick <= 14 && b.combine && b.combine.maxVertical);
const survVert = lotteryVert.filter(b => !b.isBust);
const bustVert = lotteryVert.filter(b => b.isBust);
console.log('\n' + '='.repeat(70));
console.log('MAX VERT — LOTTERY BIGS');
console.log('='.repeat(70));
console.log('Survivors avg: ' + (avg(survVert.map(b=>b.combine.maxVertical))).toFixed(1) + ' (N=' + survVert.length + ')');
console.log('Busts avg:     ' + (avg(bustVert.map(b=>b.combine.maxVertical))).toFixed(1) + ' (N=' + bustVert.length + ')');
console.log('  Bust details: ' + bustVert.map(b => b.name.substring(0,15) + '=' + b.combine.maxVertical).join(', '));

// Lane agility
const lotteryLane = bigs.filter(b => b.pick <= 14 && b.combine && b.combine.laneAgility);
const survLane = lotteryLane.filter(b => !b.isBust);
const bustLane = lotteryLane.filter(b => b.isBust);
console.log('\n' + '='.repeat(70));
console.log('LANE AGILITY — LOTTERY BIGS (lower = better)');
console.log('='.repeat(70));
console.log('Survivors avg: ' + (avg(survLane.map(b=>b.combine.laneAgility))).toFixed(2) + ' (N=' + survLane.length + ')');
console.log('Busts avg:     ' + (avg(bustLane.map(b=>b.combine.laneAgility))).toFixed(2) + ' (N=' + bustLane.length + ')');

// Slowest survivors vs fastest busts
const survLaneSorted = survLane.sort((a,b) => b.combine.laneAgility - a.combine.laneAgility);
console.log('Slowest survivors: ' + survLaneSorted.slice(0,5).map(b => b.name.substring(0,15) + '=' + b.combine.laneAgility.toFixed(2)).join(', '));
console.log('Fastest busts:     ' + bustLane.sort((a,b) => a.combine.laneAgility - b.combine.laneAgility).map(b => b.name.substring(0,15) + '=' + b.combine.laneAgility.toFixed(2)).join(', '));

// Weight for late 1st
const late1stW = bigs.filter(b => b.pick >= 15 && b.pick <= 30 && b.combine && b.combine.weight);
function weightTier(w) { if (w >= 245) return '245+'; if (w >= 230) return '230-244'; return '<230'; }
console.log('\n' + '='.repeat(70));
console.log('BUST RATE BY WEIGHT — LATE 1ST BIGS');
console.log('='.repeat(70));
for (const tier of ['245+', '230-244', '<230']) {
  const inTier = late1stW.filter(b => weightTier(b.combine.weight) === tier);
  const busts = inTier.filter(b => b.isBust);
  console.log('  ' + tier.padEnd(8) + ': ' + busts.length + '/' + inTier.length + ' bust (' + (inTier.length > 0 ? (busts.length/inTier.length*100).toFixed(0) : 0) + '%)');
}

// Derived measurements
console.log('\n' + '='.repeat(95));
console.log('DERIVED MEASUREMENTS — 1ST ROUND BIGS');
console.log('='.repeat(95));

const firstRound = bigs.filter(b => b.pick <= 30 && b.combine && b.combine.wingspan && b.combine.heightNoShoes);
console.log('Name'.padEnd(22) + 'Pk'.padStart(3) + ' Bust' + ' MSz' + '  Ht'.padStart(5) + '  Wing'.padStart(6) + ' Wing-Ht'.padStart(8) + '  Reach'.padStart(7) + ' R-Ht'.padStart(7));
console.log('-'.repeat(75));

for (const p of firstRound.sort((a,b) => a.isBust === b.isBust ? a.pick - b.pick : a.isBust ? 1 : -1)) {
  const c = p.combine;
  const wingDiff = c.wingspan - c.heightNoShoes;
  const reachDiff = c.standingReach ? c.standingReach - c.heightNoShoes : null;
  console.log(
    p.name.substring(0,21).padEnd(22) +
    String(p.pick).padStart(3) +
    (p.isBust ? ' YES' : '  no') +
    String(p.meaningful).padStart(4) +
    c.heightNoShoes.toFixed(1).padStart(5) +
    c.wingspan.toFixed(1).padStart(6) +
    ((wingDiff > 0 ? '+' : '') + wingDiff.toFixed(1)).padStart(8) +
    (c.standingReach ? c.standingReach.toFixed(1) : '   ---').padStart(7) +
    (reachDiff != null ? ((reachDiff > 0 ? '+' : '') + reachDiff.toFixed(1)) : '   ---').padStart(7)
  );
}

// Show individual real combine data for lottery bigs who actually did drills
console.log('\n' + '='.repeat(130));
console.log('LOTTERY BIGS WITH REAL DRILL DATA (excluding players who skipped drills)');
console.log('='.repeat(130));

const lotteryWithDrills = bigs.filter(b => b.pick <= 14 && b.combine &&
  b.combine.laneAgility != null && b.combine.laneAgility !== 0);

console.log('Name'.padEnd(22) + 'Pk'.padStart(3) + ' Bust' + ' MSz' + '  Ht'.padStart(6) + '  Wt'.padStart(5) + '  Wing'.padStart(6) + '  Lane'.padStart(7) + '  Shut'.padStart(7) + '  Sprt'.padStart(7) + ' SVrt'.padStart(6) + ' MVrt'.padStart(6) + ' Bnch'.padStart(5));
console.log('-'.repeat(130));

for (const p of lotteryWithDrills.sort((a,b) => a.isBust === b.isBust ? a.pick - b.pick : a.isBust ? 1 : -1)) {
  const c = p.combine;
  const fmt = (v, dec) => v != null && v !== 0 && v !== '' ? (typeof v === 'number' ? v.toFixed(dec || 1) : String(v)) : '  ---';
  console.log(
    p.name.substring(0,21).padEnd(22) +
    String(p.pick).padStart(3) +
    (p.isBust ? ' YES' : '  no') +
    String(p.meaningful).padStart(4) +
    fmt(c.heightNoShoes).padStart(6) +
    fmt(c.weight, 0).padStart(5) +
    fmt(c.wingspan).padStart(6) +
    fmt(c.laneAgility, 2).padStart(7) +
    fmt(c.shuttleRun, 2).padStart(7) +
    fmt(c.sprint, 2).padStart(7) +
    fmt(c.standingVertical).padStart(6) +
    fmt(c.maxVertical).padStart(6) +
    fmt(c.benchPress, 0).padStart(5)
  );
}
