const fs = require('fs');
const path = require('path');
const dataset = JSON.parse(fs.readFileSync('./data/dataset.json', 'utf-8'));
const dir = './data/raw/nba';
const combineDir = './data/raw/combine';

// Build lookup of REAL combine drill data
const realCombine = new Map();
for (const f of fs.readdirSync(combineDir).filter(f => f.endsWith('.json'))) {
  const records = JSON.parse(fs.readFileSync(path.join(combineDir, f), 'utf-8'));
  for (const r of records) {
    const key = r.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
    realCombine.set(key, r);
  }
}
const combinePositions = new Map();
for (const [k, v] of realCombine) { if (v.position) combinePositions.set(k, v.position); }

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

// Build all players with NBA outcomes + real combine data
const allPlayers = [];
for (const entry of dataset) {
  if (entry.draftYear > 2020) continue;
  const nbaPath = path.join(dir, entry.slug + '.json');
  if (!fs.existsSync(nbaPath)) continue;
  const d = JSON.parse(fs.readFileSync(nbaPath, 'utf-8'));
  const rs = d.seasons.filter(s => s.season && s.season.match(/^\d{4}-\d{2}$/) && s.team && s.team !== '');
  let meaningful = 0;
  for (const s of rs) { if ((s.minutesPerGame || 0) * (s.gamesPlayed || 0) >= 900) meaningful++; }
  const nk = entry.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  allPlayers.push({
    ...entry,
    meaningful,
    isBust: meaningful < 2,
    position: assignPosition(entry),
    combine: realCombine.get(nk) || null,
  });
}

function avg(arr) { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
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

const allStats = [
  { key: 'heightNoShoes', label: 'Height (no shoes)', lower: false },
  { key: 'weight', label: 'Weight', lower: false },
  { key: 'wingspan', label: 'Wingspan', lower: false },
  { key: 'standingReach', label: 'Standing Reach', lower: false },
  { key: 'laneAgility', label: 'Lane Agility', lower: true },
  { key: 'shuttleRun', label: 'Shuttle Run', lower: true },
  { key: 'sprint', label: '3/4 Sprint', lower: true },
  { key: 'standingVertical', label: 'Standing Vert', lower: false },
  { key: 'maxVertical', label: 'Max Vert', lower: false },
  { key: 'benchPress', label: 'Bench Press', lower: false },
  { key: 'handLength', label: 'Hand Length', lower: false },
  { key: 'handWidth', label: 'Hand Width', lower: false },
];

// Also add college stat comparisons to see them side by side
const collegeStats = [
  { key: 'ageAtDraft', label: 'Age at Draft' },
  { key: 'ptsPer40', label: 'PTS/40' },
  { key: 'rebPer40', label: 'REB/40' },
  { key: 'astPer40', label: 'AST/40' },
  { key: 'stlPer40', label: 'STL/40' },
  { key: 'blkPer40', label: 'BLK/40' },
  { key: 'freeThrowPct', label: 'FT%' },
  { key: 'trueShootingPct', label: 'TS%' },
  { key: 'boxPlusMinus', label: 'BPM' },
  { key: 'winSharesPer40', label: 'WS/40' },
  { key: 'minutesPerGame', label: 'College MPG' },
  { key: 'assistToTurnover', label: 'AST/TO' },
];

const positions = ['Guard', 'Wing', 'Big'];
const ranges = [
  { name: 'Lottery (1-14)', min: 1, max: 14 },
  { name: 'Late 1st (15-30)', min: 15, max: 30 },
];

for (const pos of positions) {
  console.log('\n' + '#'.repeat(100));
  console.log('###  ' + pos.toUpperCase() + 'S');
  console.log('#'.repeat(100));

  for (const rng of ranges) {
    const bucket = allPlayers.filter(b => b.position === pos && b.pick >= rng.min && b.pick <= rng.max && b.combine);
    const survs = bucket.filter(b => !b.isBust);
    const busts = bucket.filter(b => b.isBust);

    console.log('\n' + '='.repeat(95));
    console.log(pos.toUpperCase() + ' ' + rng.name + ' — REAL COMBINE DATA (' + busts.length + ' busts, ' + survs.length + ' survivors)');
    console.log('='.repeat(95));

    // Combine stats
    console.log('\nCOMBINE MEASUREMENTS & DRILLS:');
    console.log('Stat'.padEnd(18) + 'r'.padStart(8) + 'N'.padStart(5) + '(S/B)'.padStart(8) + 'Surv'.padStart(9) + 'Bust'.padStart(9) + 'Diff'.padStart(9) + ' %Diff'.padStart(7) + '  Signal');
    console.log('-'.repeat(95));

    for (const stat of allStats) {
      const withData = bucket.filter(b => b.combine[stat.key] != null && b.combine[stat.key] !== 0 && b.combine[stat.key] !== '');
      if (withData.length < 8) continue;
      const sv = withData.filter(b => !b.isBust);
      const bv = withData.filter(b => b.isBust);
      if (bv.length < 3 || sv.length < 3) continue;

      const r = correlation(withData.map(b => Number(b.combine[stat.key])), withData.map(b => b.meaningful));
      const sa = avg(sv.map(b => Number(b.combine[stat.key])));
      const ba = avg(bv.map(b => Number(b.combine[stat.key])));
      const d = sa - ba;
      const pctDiff = sa !== 0 ? Math.abs(d / sa) * 100 : 0;

      let signal = '';
      if (Math.abs(r) >= 0.20) signal = '***';
      else if (Math.abs(r) >= 0.15) signal = '**';
      else if (Math.abs(r) >= 0.10) signal = '*';

      console.log(
        stat.label.padEnd(18) +
        r.toFixed(3).padStart(8) +
        String(withData.length).padStart(5) +
        ('(' + sv.length + '/' + bv.length + ')').padStart(8) +
        sa.toFixed(1).padStart(9) +
        ba.toFixed(1).padStart(9) +
        ((d > 0 ? '+' : '') + d.toFixed(1)).padStart(9) +
        pctDiff.toFixed(1).padStart(6) + '%' +
        '  ' + signal
      );
    }

    // College stats for comparison
    console.log('\nCOLLEGE STATS (for comparison):');
    console.log('Stat'.padEnd(18) + 'r'.padStart(8) + 'N'.padStart(5) + '(S/B)'.padStart(8) + 'Surv'.padStart(9) + 'Bust'.padStart(9) + 'Diff'.padStart(9) + ' %Diff'.padStart(7) + '  Signal');
    console.log('-'.repeat(95));

    for (const stat of collegeStats) {
      const allInRange = allPlayers.filter(b => b.position === pos && b.pick >= rng.min && b.pick <= rng.max);
      const withData = allInRange.filter(b => {
        const val = b.features[stat.key];
        if (stat.key === 'ageAtDraft') return val != null;
        return val != null && val !== 0;
      });
      if (withData.length < 10) continue;
      const sv = withData.filter(b => !b.isBust);
      const bv = withData.filter(b => b.isBust);
      if (bv.length < 3 || sv.length < 3) continue;

      const r = correlation(withData.map(b => Number(b.features[stat.key])), withData.map(b => b.meaningful));
      const sa = avg(sv.map(b => Number(b.features[stat.key])));
      const ba = avg(bv.map(b => Number(b.features[stat.key])));
      const d = sa - ba;
      const pctDiff = sa !== 0 ? Math.abs(d / sa) * 100 : 0;

      let signal = '';
      if (Math.abs(r) >= 0.20) signal = '***';
      else if (Math.abs(r) >= 0.15) signal = '**';
      else if (Math.abs(r) >= 0.10) signal = '*';

      console.log(
        stat.label.padEnd(18) +
        r.toFixed(3).padStart(8) +
        String(withData.length).padStart(5) +
        ('(' + sv.length + '/' + bv.length + ')').padStart(8) +
        sa.toFixed(1).padStart(9) +
        ba.toFixed(1).padStart(9) +
        ((d > 0 ? '+' : '') + d.toFixed(1)).padStart(9) +
        pctDiff.toFixed(1).padStart(6) + '%' +
        '  ' + signal
      );
    }
  }

  // Notable individual combine data for this position
  console.log('\n' + '='.repeat(130));
  console.log(pos.toUpperCase() + ' — INDIVIDUAL COMBINE DATA (1st round, real drills only)');
  console.log('='.repeat(130));

  const firstRoundWithDrills = allPlayers.filter(b =>
    b.position === pos && b.pick <= 30 && b.combine && b.combine.laneAgility
  );

  console.log(
    'Name'.padEnd(22) + 'Pk'.padStart(3) + ' Bust' + ' MSz' +
    '  Ht'.padStart(6) + '  Wt'.padStart(5) + '  Wing'.padStart(6) +
    '  Lane'.padStart(7) + '  Shut'.padStart(7) + '  Sprt'.padStart(7) +
    ' SVrt'.padStart(6) + ' MVrt'.padStart(6) + ' Bnch'.padStart(5)
  );
  console.log('-'.repeat(130));

  for (const p of firstRoundWithDrills.sort((a, b) => a.isBust === b.isBust ? a.pick - b.pick : a.isBust ? 1 : -1)) {
    const c = p.combine;
    const fmt = (v, dec) => v != null && v !== 0 && v !== '' ? (typeof v === 'number' ? v.toFixed(dec || 1) : String(v)) : '  ---';
    console.log(
      p.name.substring(0, 21).padEnd(22) +
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
}
