/**
 * NBA Success Analysis — Positional, bucketed, no fantasy nonsense.
 *
 * Questions we're answering:
 * 1. What's the bust rate by position × draft range?
 * 2. What college markers predict long-term NBA survival?
 * 3. What do players who outperform their draft slot have in common?
 * 4. What are the red flags for busts?
 *
 * Outputs: data/success-analysis.json for the frontend
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATASET_PATH = path.join(DATA_DIR, 'dataset.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'success-analysis.json');

interface TrainingRecord {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
  isInternational: boolean;
  features: Record<string, number | boolean>;
  target: Record<string, number>;
  totalNBAGames: number;
}

// ── Normalize mixed-format percentages (some stored as 0.33, some as 33) ──

const PCT_KEYS = ['trueShootingPct', 'freeThrowPct', 'threePtPct'];

function normalizeRecord(r: TrainingRecord): TrainingRecord {
  const features = { ...r.features };
  for (const key of PCT_KEYS) {
    const val = features[key];
    if (typeof val === 'number' && val > 1) {
      features[key] = val / 100;
    }
  }
  return { ...r, features };
}

// ── Position assignment ──

function assignPosition(r: TrainingRecord, combinePositions: Map<string, string>): 'Guard' | 'Wing' | 'Big' {
  const key = r.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const combinePos = combinePositions.get(key);
  const height = (r.features.heightInches as number) || 0;
  const ast = (r.features.astPer40 as number) || 0;
  const reb = (r.features.rebPer40 as number) || 0;
  const blk = (r.features.blkPer40 as number) || 0;

  if (combinePos) {
    const parts = combinePos.split('-');

    // Single position — trust it
    if (parts.length === 1) {
      if (parts[0] === 'PG' || parts[0] === 'SG') return 'Guard';
      if (parts[0] === 'SF') return 'Wing';
      return 'Big';
    }

    // Multi-position (e.g., SF-PF, PG-SG) — use height + stats to disambiguate
    const hasGuard = parts.some((p) => p === 'PG' || p === 'SG');
    const hasBig = parts.some((p) => p === 'PF' || p === 'C');
    const hasWing = parts.some((p) => p === 'SF');

    // PG-SG or SG-PG — always Guard
    if (hasGuard && !hasBig && !hasWing) return 'Guard';
    // PF-C or C-PF — always Big
    if (hasBig && !hasGuard && !hasWing) return 'Big';

    // SF-PF or PF-SF — use height to break tie (6'8"+ = Big, else Wing)
    if (hasWing && hasBig) {
      if (height >= 80) return 'Big';   // 6'8"+
      if (height > 0) return height >= 78 && (reb >= 8 || blk >= 1.5) ? 'Big' : 'Wing';
      return reb >= 8 || blk >= 1.5 ? 'Big' : 'Wing';
    }

    // SG-SF or SF-SG — use height (6'6"+ with low ast = Wing, else Guard)
    if (hasGuard && hasWing) {
      if (height >= 78) return 'Wing';  // 6'6"+
      if (height > 0) return 'Guard';
      return ast >= 4 ? 'Guard' : 'Wing';
    }

    // PG-PF or other unusual combos — use height
    if (height >= 80) return 'Big';
    if (height <= 76) return 'Guard';
    return 'Wing';
  }

  // No combine data — infer from height + stats
  if (height > 0) {
    if (height >= 81 || (reb >= 10 && blk >= 2)) return 'Big';      // 6'9"+
    if (height <= 76 || (ast >= 5 && reb < 7)) return 'Guard';       // 6'4" or less
    return 'Wing';
  }

  // No height — use stats only
  if (ast >= 4.5 && reb < 7) return 'Guard';
  if (reb >= 9 || blk >= 2) return 'Big';
  return 'Wing';
}

function loadCombinePositions(): Map<string, string> {
  const combineDir = path.join(DATA_DIR, 'raw', 'combine');
  const map = new Map<string, string>();
  if (!fs.existsSync(combineDir)) return map;

  for (const f of fs.readdirSync(combineDir).filter((f) => f.endsWith('.json'))) {
    const records = JSON.parse(fs.readFileSync(path.join(combineDir, f), 'utf-8'));
    for (const r of records) {
      const key = r.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (r.position) map.set(key, r.position);
    }
  }
  return map;
}

// ── Success metrics ──

// Minutes-based success definition:
// A season counts as "meaningful" if the player logged 900+ total minutes
// (roughly 55 games × 16 MPG or 70 games × 13 MPG — a real rotation role).
//
// Bust = fewer than 2 seasons of 900+ minutes
// Survivor = 2+ seasons of 900+ minutes
//
// Tiers based on how many 900+ minute seasons:
//   - Out: 0 meaningful seasons (never stuck)
//   - Fringe: 1 meaningful season (one-year wonder or barely hung on)
//   - Rotation: 2-4 meaningful seasons (solid but not long-term)
//   - Starter: 5+ meaningful seasons (long-term contributor)

const MIN_SEASON_MINUTES = 900;

type SuccessTier = 'Out' | 'Fringe' | 'Rotation' | 'Starter';

interface SeasonMinutes {
  season: string;
  totalMinutes: number;
}

function loadPlayerSeasonMinutes(slug: string): SeasonMinutes[] {
  const nbaPath = path.join(DATA_DIR, 'raw', 'nba', slug + '.json');
  if (!fs.existsSync(nbaPath)) return [];
  const data = JSON.parse(fs.readFileSync(nbaPath, 'utf-8'));
  const result: SeasonMinutes[] = [];
  for (const s of data.seasons || []) {
    // Only real NBA seasons (format: "2013-14"), skip career totals
    if (!s.season?.match(/^\d{4}-\d{2}$/)) continue;
    if (!s.team || s.team === '') continue;
    const totalMin = (s.minutesPerGame || 0) * (s.gamesPlayed || 0);
    result.push({ season: s.season, totalMinutes: Math.round(totalMin) });
  }
  return result;
}

function countMeaningfulSeasons(seasonMins: SeasonMinutes[]): number {
  return seasonMins.filter(s => s.totalMinutes >= MIN_SEASON_MINUTES).length;
}

function successTier(meaningfulSeasons: number): SuccessTier {
  if (meaningfulSeasons === 0) return 'Out';
  if (meaningfulSeasons === 1) return 'Fringe';
  if (meaningfulSeasons <= 4) return 'Rotation';
  return 'Starter';
}

type DraftRange = 'Top 5' | 'Lottery (6-14)' | 'Late 1st (15-30)' | '2nd Round (31-60)';

function draftRange(pick: number): DraftRange {
  if (pick <= 5) return 'Top 5';
  if (pick <= 14) return 'Lottery (6-14)';
  if (pick <= 30) return 'Late 1st (15-30)';
  return '2nd Round (31-60)';
}

function correlation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    denX += (x[i] - xMean) ** 2;
    denY += (y[i] - yMean) ** 2;
  }
  return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Main ──

function main() {
  const records: TrainingRecord[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));

  // Filter to players with enough NBA time to evaluate (drafted 2020 or earlier = at least 4 seasons)
  // 2021+ players don't have enough career data to judge
  const evaluable = records.filter((r) => r.draftYear <= 2020).map(normalizeRecord);
  console.log(`Evaluable players (drafted 2005-2020): ${evaluable.length}`);

  const combinePositions = loadCombinePositions();

  // Assign positions + compute minutes-based success tiers
  const players = evaluable.map((r) => {
    const seasonMins = loadPlayerSeasonMinutes(r.slug);
    const meaningful = countMeaningfulSeasons(seasonMins);
    return {
      ...r,
      position: assignPosition(r, combinePositions),
      tier: successTier(meaningful),
      meaningfulSeasons: meaningful,
      seasonMins,
      totalCareerMinutes: seasonMins.reduce((s, m) => s + m.totalMinutes, 0),
      range: draftRange(r.pick),
    };
  });

  const posCounts = { Guard: 0, Wing: 0, Big: 0 };
  for (const p of players) posCounts[p.position]++;
  console.log('Position distribution:', posCounts);

  // Sanity check: show tier distribution and known reference players
  const tierCounts = { Out: 0, Fringe: 0, Rotation: 0, Starter: 0 };
  for (const p of players) tierCounts[p.tier]++;
  console.log('Tier distribution:', tierCounts);

  const refs = ['Jrue Holiday', 'Draymond Green', 'Luka Doncic', 'Kyle Kuzma', 'Marcus Smart',
    'Tim Hardaway Jr', 'Kevon Looney', 'Markelle Fultz', 'James Wiseman', 'Anthony Bennett',
    'Greg Oden', 'Hasheem Thabeet', 'Jimmer Fredette', 'Adam Morrison', 'Patty Mills',
    'Georges Niang', 'Isaiah Hartenstein', 'Robert Williams', 'Pat Connaughton'];
  console.log('\n── Reference Players ──');
  console.log('Name'.padEnd(24) + 'Pick'.padStart(4) + '  Tier'.padEnd(13) + 'Meaningful Szns' + '  Career Min');
  for (const ref of refs) {
    const p = players.find(r => r.name.toLowerCase().includes(ref.toLowerCase()));
    if (!p) continue;
    console.log(
      p.name.padEnd(24) +
      String(p.pick).padStart(4) + '  ' +
      p.tier.padEnd(10) +
      String(p.meaningfulSeasons).padStart(8) + '        ' +
      String(p.totalCareerMinutes).padStart(8)
    );
  }

  // ═══════════════════════════════════════════════════════
  // 1. BUST RATES by Position × Draft Range
  // ═══════════════════════════════════════════════════════

  const positions: Array<'Guard' | 'Wing' | 'Big'> = ['Guard', 'Wing', 'Big'];
  const ranges: DraftRange[] = ['Top 5', 'Lottery (6-14)', 'Late 1st (15-30)', '2nd Round (31-60)'];
  const tiers: SuccessTier[] = ['Starter', 'Rotation', 'Fringe', 'Out'];

  const bustRates: Array<{
    position: string;
    range: string;
    total: number;
    distribution: Record<string, number>;
    bustRate: number; // Out + Fringe
    medianGames: number;
    names: { starters: string[]; busts: string[] };
  }> = [];

  for (const pos of positions) {
    for (const range of ranges) {
      const bucket = players.filter((p) => p.position === pos && p.range === range);
      if (bucket.length < 3) continue;

      const dist: Record<string, number> = {};
      for (const t of tiers) {
        dist[t] = bucket.filter((p) => p.tier === t).length / bucket.length;
      }

      const starters = bucket.filter((p) => p.tier === 'Starter')
        .sort((a, b) => b.meaningfulSeasons - a.meaningfulSeasons)
        .slice(0, 5).map((p) => `${p.name} (${p.meaningfulSeasons})`);
      const busts = bucket.filter((p) => p.tier === 'Out')
        .sort((a, b) => a.meaningfulSeasons - b.meaningfulSeasons)
        .slice(0, 5).map((p) => `${p.name} (${p.meaningfulSeasons})`);

      bustRates.push({
        position: pos,
        range,
        total: bucket.length,
        distribution: dist,
        bustRate: (dist.Out || 0) + (dist.Fringe || 0),
        medianGames: median(bucket.map((p) => p.meaningfulSeasons)),
        names: { starters, busts },
      });
    }
  }

  console.log('\n── Bust Rates (bust = <2 seasons of 900+ min) ──');
  for (const b of bustRates) {
    console.log(`  ${b.position.padEnd(6)} ${b.range.padEnd(20)} N=${String(b.total).padStart(3)}  Bust=${(b.bustRate * 100).toFixed(0).padStart(3)}%  Median=${String(b.medianGames).padStart(3)} meaningful seasons`);
  }

  // ═══════════════════════════════════════════════════════
  // 2. WHAT MARKERS PREDICT SUCCESS? (by position)
  // ═══════════════════════════════════════════════════════

  const markerKeys = [
    'ageAtDraft', 'classYear',
    'ptsPer40', 'rebPer40', 'astPer40', 'stlPer40', 'blkPer40', 'threePer40', 'tovPer40', 'ftaPer40',
    'trueShootingPct', 'freeThrowPct', 'threePtPct', 'assistToTurnover',
    'pointsShare', 'reboundsShare', 'assistsShare', 'usageRate',
    'heightInches', 'weightLbs', 'wingspanInches', 'standingReachInches',
    'laneAgility', 'shuttleRun', 'sprint', 'standingVertical', 'maxVertical', 'benchPress',
    'minutesPerGame', 'gamesPlayed',
    'ptsTrajectory', 'usageTrajectory',
    'boxPlusMinus', 'winSharesPer40',
  ];

  const markerLabels: Record<string, string> = {
    ageAtDraft: 'Age at Draft', classYear: 'Class Year',
    ptsPer40: 'PTS/40', rebPer40: 'REB/40', astPer40: 'AST/40', stlPer40: 'STL/40',
    blkPer40: 'BLK/40', threePer40: '3PM/40', tovPer40: 'TOV/40', ftaPer40: 'FTA/40',
    trueShootingPct: 'True Shooting %', freeThrowPct: 'FT%', threePtPct: '3PT%',
    assistToTurnover: 'AST/TO',
    pointsShare: 'Points Share', reboundsShare: 'Reb Share', assistsShare: 'Ast Share',
    usageRate: 'Usage Rate',
    heightInches: 'Height', weightLbs: 'Weight', wingspanInches: 'Wingspan',
    standingReachInches: 'Standing Reach',
    laneAgility: 'Lane Agility', shuttleRun: 'Shuttle Run', sprint: 'Sprint',
    standingVertical: 'Standing Vert', maxVertical: 'Max Vert', benchPress: 'Bench Press',
    minutesPerGame: 'MPG', gamesPlayed: 'Games Played',
    ptsTrajectory: 'PTS Trajectory', usageTrajectory: 'Usage Trajectory',
    boxPlusMinus: 'Box +/-', winSharesPer40: 'Win Shares/40',
  };

  // For each position, correlate each marker with totalNBAGames
  const successMarkers: Array<{
    position: string;
    markers: Array<{
      key: string;
      label: string;
      correlation: number;
      starterAvg: number;
      bustAvg: number;
      diff: number;
      n: number;
    }>;
  }> = [];

  for (const pos of positions) {
    const bucket = players.filter((p) => p.position === pos);
    const markers: typeof successMarkers[0]['markers'] = [];

    for (const key of markerKeys) {
      // Filter to players with the marker available (non-zero for most, always for age/class)
      const withData = bucket.filter((p) => {
        const val = p.features[key];
        if (key === 'ageAtDraft' || key === 'classYear') return val != null;
        return val != null && val !== 0;
      });

      if (withData.length < 20) continue;

      const vals = withData.map((p) => Number(p.features[key]) || 0);
      const games = withData.map((p) => p.totalNBAGames);
      const r = correlation(vals, games);

      // Starter vs Bust averages
      const starters = withData.filter((p) => p.tier === 'Starter');
      const busts = withData.filter((p) => p.tier === 'Out');
      const starterAvg = starters.length > 0 ? starters.reduce((s, p) => s + (Number(p.features[key]) || 0), 0) / starters.length : 0;
      const bustAvg = busts.length > 0 ? busts.reduce((s, p) => s + (Number(p.features[key]) || 0), 0) / busts.length : 0;

      markers.push({
        key,
        label: markerLabels[key] || key,
        correlation: r,
        starterAvg,
        bustAvg,
        diff: starterAvg - bustAvg,
        n: withData.length,
      });
    }

    markers.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    successMarkers.push({ position: pos, markers });
  }

  console.log('\n── Top Success Markers by Position ──');
  for (const { position, markers } of successMarkers) {
    console.log(`\n  ${position}:`);
    for (const m of markers.slice(0, 8)) {
      console.log(`    ${m.label.padEnd(20)} r=${m.correlation.toFixed(3).padStart(7)}  Starter=${m.starterAvg.toFixed(1).padStart(6)}  Bust=${m.bustAvg.toFixed(1).padStart(6)}  Diff=${m.diff > 0 ? '+' : ''}${m.diff.toFixed(1)}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 3. OUTPERFORMANCE — Who beats their draft slot?
  // ═══════════════════════════════════════════════════════

  // Expected games by pick (simple regression from the data)
  const pickGames: Map<number, number[]> = new Map();
  for (const p of players) {
    const bucket = pickGames.get(p.pick) || [];
    bucket.push(p.totalNBAGames);
    pickGames.set(p.pick, bucket);
  }

  // Compute expected meaningful seasons for each draft range
  const rangeExpected: Record<string, number> = {};
  for (const range of ranges) {
    const bucket = players.filter((p) => p.range === range);
    rangeExpected[range] = median(bucket.map((p) => p.meaningfulSeasons));
  }

  // Outperformance score: actual meaningful seasons / expected for their range
  // > 1.0 = outperformed, < 1.0 = underperformed
  const outperformers = players
    .filter((p) => rangeExpected[p.range] > 0)
    .map((p) => ({
      name: p.name,
      pick: p.pick,
      draftYear: p.draftYear,
      position: p.position,
      range: p.range,
      totalGames: p.totalNBAGames,
      meaningfulSeasons: p.meaningfulSeasons,
      expected: rangeExpected[p.range],
      outperformanceRatio: p.meaningfulSeasons / rangeExpected[p.range],
      features: p.features,
    }));

  // Top outperformers by position
  const topOutperformers: Array<{
    position: string;
    range: string;
    players: Array<{
      name: string;
      pick: number;
      draftYear: number;
      totalGames: number;
      expected: number;
      ratio: number;
    }>;
  }> = [];

  for (const pos of positions) {
    for (const range of ranges) {
      const bucket = outperformers
        .filter((p) => p.position === pos && p.range === range)
        .sort((a, b) => b.outperformanceRatio - a.outperformanceRatio);

      if (bucket.length < 3) continue;

      topOutperformers.push({
        position: pos,
        range,
        players: bucket.slice(0, 8).map((p) => ({
          name: p.name,
          pick: p.pick,
          draftYear: p.draftYear,
          totalGames: p.totalGames,
          meaningfulSeasons: p.meaningfulSeasons,
          expected: p.expected,
          ratio: p.outperformanceRatio,
        })),
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // 4. OUTPERFORMER vs UNDERPERFORMER TRAITS (by position)
  // ═══════════════════════════════════════════════════════

  const outperformerTraits: Array<{
    position: string;
    traits: Array<{
      key: string;
      label: string;
      outperformerAvg: number;
      underperformerAvg: number;
      diff: number;
      correlation: number;
    }>;
  }> = [];

  for (const pos of positions) {
    const bucket = outperformers.filter((p) => p.position === pos);
    // Top and bottom quartile by outperformance ratio
    const sorted = [...bucket].sort((a, b) => b.outperformanceRatio - a.outperformanceRatio);
    const q = Math.floor(sorted.length / 4);
    const topQ = sorted.slice(0, q);
    const bottomQ = sorted.slice(-q);

    const traits: typeof outperformerTraits[0]['traits'] = [];

    for (const key of markerKeys) {
      const topVals = topQ.map((p) => Number(p.features[key]) || 0).filter((v) => v !== 0);
      const botVals = bottomQ.map((p) => Number(p.features[key]) || 0).filter((v) => v !== 0);
      if (topVals.length < 5 || botVals.length < 5) continue;

      const topAvg = topVals.reduce((s, v) => s + v, 0) / topVals.length;
      const botAvg = botVals.reduce((s, v) => s + v, 0) / botVals.length;

      // Correlation of marker with outperformance ratio
      const allVals = bucket.map((p) => Number(p.features[key]) || 0);
      const allRatios = bucket.map((p) => p.outperformanceRatio);
      const validIdx = allVals.map((v, i) => v !== 0 ? i : -1).filter((i) => i >= 0);
      const r = correlation(
        validIdx.map((i) => allVals[i]),
        validIdx.map((i) => allRatios[i])
      );

      traits.push({
        key,
        label: markerLabels[key] || key,
        outperformerAvg: topAvg,
        underperformerAvg: botAvg,
        diff: topAvg - botAvg,
        correlation: r,
      });
    }

    traits.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    outperformerTraits.push({ position: pos, traits });
  }

  console.log('\n── Outperformer Traits by Position ──');
  for (const { position, traits } of outperformerTraits) {
    console.log(`\n  ${position} (top quartile vs bottom quartile):`);
    for (const t of traits.slice(0, 8)) {
      console.log(`    ${t.label.padEnd(20)} r=${t.correlation.toFixed(3).padStart(7)}  Top=${t.outperformerAvg.toFixed(1).padStart(6)}  Bot=${t.underperformerAvg.toFixed(1).padStart(6)}  Diff=${t.diff > 0 ? '+' : ''}${t.diff.toFixed(1)}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 5. RED FLAGS — What busts have in common (by position)
  // ═══════════════════════════════════════════════════════

  const redFlags: Array<{
    position: string;
    range: string;
    bustCount: number;
    survivorCount: number;
    flags: Array<{
      label: string;
      bustAvg: number;
      survivorAvg: number;
      diff: number;
      isPct: boolean;
    }>;
  }> = [];

  for (const pos of positions) {
    for (const range of ['Top 5', 'Lottery (6-14)', 'Late 1st (15-30)'] as DraftRange[]) {
      const bucket = players.filter((p) => p.position === pos && p.range === range);
      const busts = bucket.filter((p) => p.tier === 'Out' || p.tier === 'Fringe');
      const survivors = bucket.filter((p) => p.tier === 'Starter' || p.tier === 'Rotation');

      if (busts.length < 3 || survivors.length < 3) continue;

      const flags: typeof redFlags[0]['flags'] = [];
      const checkKeys = [
        { key: 'ageAtDraft', label: 'Age at Draft', isPct: false },
        { key: 'freeThrowPct', label: 'FT%', isPct: true },
        { key: 'trueShootingPct', label: 'True Shooting %', isPct: true },
        { key: 'stlPer40', label: 'STL/40', isPct: false },
        { key: 'assistToTurnover', label: 'AST/TO', isPct: false },
        { key: 'ptsPer40', label: 'PTS/40', isPct: false },
        { key: 'winSharesPer40', label: 'Win Shares/40', isPct: false },
        { key: 'boxPlusMinus', label: 'Box +/-', isPct: false },
        { key: 'usageRate', label: 'Usage Rate', isPct: false },
        { key: 'minutesPerGame', label: 'MPG', isPct: false },
        { key: 'threePtPct', label: '3PT%', isPct: true },
        { key: 'laneAgility', label: 'Lane Agility', isPct: false },
        { key: 'maxVertical', label: 'Max Vert', isPct: false },
        { key: 'sprint', label: 'Sprint', isPct: false },
      ];

      for (const { key, label, isPct } of checkKeys) {
        const bustVals = busts.map((p) => Number(p.features[key]) || 0).filter((v) => v !== 0);
        const survVals = survivors.map((p) => Number(p.features[key]) || 0).filter((v) => v !== 0);
        if (bustVals.length < 2 || survVals.length < 2) continue;

        const bustAvg = bustVals.reduce((s, v) => s + v, 0) / bustVals.length;
        const survAvg = survVals.reduce((s, v) => s + v, 0) / survVals.length;

        flags.push({ label, bustAvg, survivorAvg: survAvg, diff: bustAvg - survAvg, isPct });
      }

      // Sort by absolute difference (normalized by survivor avg to make comparable)
      flags.sort((a, b) => {
        const aNorm = a.survivorAvg !== 0 ? Math.abs(a.diff / a.survivorAvg) : 0;
        const bNorm = b.survivorAvg !== 0 ? Math.abs(b.diff / b.survivorAvg) : 0;
        return bNorm - aNorm;
      });

      redFlags.push({
        position: pos,
        range,
        bustCount: busts.length,
        survivorCount: survivors.length,
        flags: flags.slice(0, 8),
      });
    }
  }

  console.log('\n── Red Flags ──');
  for (const rf of redFlags) {
    console.log(`\n  ${rf.position} ${rf.range} (${rf.bustCount} busts vs ${rf.survivorCount} survivors):`);
    for (const f of rf.flags.slice(0, 5)) {
      const fmtVal = (v: number) => f.isPct ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
      console.log(`    ${f.label.padEnd(20)} Bust=${fmtVal(f.bustAvg).padStart(7)}  Survivor=${fmtVal(f.survivorAvg).padStart(7)}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 6. HISTORICAL CONTEXT — Draft range expectations
  // ═══════════════════════════════════════════════════════

  const rangeStats = ranges.map((range) => {
    const bucket = players.filter((p) => p.range === range);
    const seasons = bucket.map((p) => p.meaningfulSeasons).sort((a, b) => a - b);
    return {
      range,
      count: bucket.length,
      medianMeaningfulSeasons: median(seasons),
      p25: seasons[Math.floor(seasons.length * 0.25)] || 0,
      p75: seasons[Math.floor(seasons.length * 0.75)] || 0,
      bustRate: bucket.filter((p) => p.tier === 'Out').length / bucket.length,
      starterRate: bucket.filter((p) => p.tier === 'Starter').length / bucket.length,
    };
  });

  // ── Assemble output ──
  const output = {
    generatedAt: new Date().toISOString(),
    playerCount: players.length,
    draftYearRange: '2005-2020',
    positionCounts: posCounts,

    bustRates,
    rangeStats,
    successMarkers: successMarkers.map((sm) => ({
      position: sm.position,
      markers: sm.markers.slice(0, 15),
    })),
    topOutperformers,
    outperformerTraits: outperformerTraits.map((ot) => ({
      position: ot.position,
      traits: ot.traits.slice(0, 12),
    })),
    redFlags,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main();
