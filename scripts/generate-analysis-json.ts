/**
 * Generate analysis data as JSON for the frontend.
 * Outputs: data/analysis.json
 * Contains: translation analysis, blind model comparison, late-round gems
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATASET_PATH = path.join(DATA_DIR, 'dataset.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'analysis.json');

interface TrainingRecord {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
  isInternational: boolean;
  features: Record<string, number>;
  target: Record<string, number>;
  totalNBAGames: number;
}

interface StatModel {
  weights: number[];
  bias: number;
  r2: number;
  mae: number;
  lambda: number;
}

const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'threePM', 'fgPct', 'ftPct', 'tov'];

const ALL_FEATURES = [
  'ageAtDraft', 'classYear',
  'pointsShare', 'reboundsShare', 'assistsShare', 'usageRate',
  'ptsPer40', 'rebPer40', 'astPer40', 'stlPer40', 'blkPer40', 'threePer40', 'tovPer40', 'ftaPer40',
  'trueShootingPct', 'freeThrowPct', 'threePtPct', 'assistToTurnover',
  'heightInches', 'weightLbs', 'wingspanInches', 'standingReachInches',
  'handLength', 'handWidth',
  'laneAgility', 'shuttleRun', 'sprint', 'standingVertical', 'maxVertical', 'benchPress',
  'conferenceTier', 'gamesPlayed', 'minutesPerGame', 'draftPosition',
  'ptsTrajectory', 'usageTrajectory',
  'boxPlusMinus', 'winSharesPer40',
];

const BLIND_FEATURES = ALL_FEATURES.filter((f) => f !== 'draftPosition');

// ── Math ──

function normalizeFeatures(features: number[][]): { normalized: number[][]; means: number[]; stds: number[] } {
  const numFeatures = features[0].length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) means[j] += row[j];
  }
  for (let j = 0; j < numFeatures; j++) means[j] /= features.length;
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) stds[j] += (row[j] - means[j]) ** 2;
  }
  for (let j = 0; j < numFeatures; j++) {
    stds[j] = Math.sqrt(stds[j] / features.length);
    if (stds[j] === 0) stds[j] = 1;
  }
  const normalized = features.map((row) => row.map((val, j) => (val - means[j]) / stds[j]));
  return { normalized, means, stds };
}

function normalizeSingle(features: number[], means: number[], stds: number[]): number[] {
  return features.map((val, j) => (val - means[j]) / stds[j]);
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) { maxVal = Math.abs(aug[row][col]); maxRow = row; }
    }
    if (maxRow !== col) [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let j = row + 1; j < n; j++) x[row] -= aug[row][j] * x[j];
    x[row] /= aug[row][row];
  }
  return x;
}

function trainRidge(X: number[][], y: number[], lambda: number): StatModel {
  const n = X.length;
  const p = X[0].length;
  const Xb = X.map((row) => [...row, 1]);
  const pb = p + 1;
  const XtX: number[][] = Array.from({ length: pb }, () => new Array(pb).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < pb; j++) {
      for (let k = 0; k < pb; k++) XtX[j][k] += Xb[i][j] * Xb[i][k];
    }
  }
  for (let j = 0; j < p; j++) XtX[j][j] += lambda;
  const Xty = new Array(pb).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < pb; j++) Xty[j] += Xb[i][j] * y[i];
  }
  const weights = solveLinearSystem(XtX, Xty);
  const bias = weights[p];
  const w = weights.slice(0, p);
  const predictions = X.map((row) => {
    let pred = bias;
    for (let j = 0; j < p; j++) pred += w[j] * row[j];
    return pred;
  });
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0, absErr = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - predictions[i]) ** 2;
    absErr += Math.abs(y[i] - predictions[i]);
  }
  return { weights: w, bias, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, mae: absErr / n, lambda };
}

function clampStat(stat: string, value: number): number {
  const ranges: Record<string, [number, number]> = {
    pts: [0, 35], reb: [0, 15], ast: [0, 12], stl: [0, 3], blk: [0, 4],
    threePM: [0, 5], fgPct: [0.30, 0.65], ftPct: [0.40, 0.95], tov: [0, 5],
  };
  const [min, max] = ranges[stat] || [0, 100];
  return Math.max(min, Math.min(max, value));
}

function crossValidate(
  features: number[][], targets: Record<string, number[]>, years: number[], lambda: number,
): Record<string, { meanMAE: number; meanR2: number }> {
  const uniqueYears = [...new Set(years)].sort();
  const statResults: Record<string, { maes: number[]; r2s: number[] }> = {};
  for (const stat of STAT_KEYS) statResults[stat] = { maes: [], r2s: [] };
  for (const holdoutYear of uniqueYears) {
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    for (let i = 0; i < years.length; i++) {
      if (years[i] === holdoutYear) testIdx.push(i); else trainIdx.push(i);
    }
    if (testIdx.length === 0 || trainIdx.length === 0) continue;
    const trainFeatures = trainIdx.map((i) => features[i]);
    const testFeatures = testIdx.map((i) => features[i]);
    const { normalized: trainNorm, means, stds } = normalizeFeatures(trainFeatures);
    const testNorm = testFeatures.map((row) => normalizeSingle(row, means, stds));
    for (const stat of STAT_KEYS) {
      const trainY = trainIdx.map((i) => targets[stat][i]);
      const testY = testIdx.map((i) => targets[stat][i]);
      const model = trainRidge(trainNorm, trainY, lambda);
      const preds = testNorm.map((row) => {
        let pred = model.bias;
        for (let j = 0; j < model.weights.length; j++) pred += model.weights[j] * row[j];
        return clampStat(stat, pred);
      });
      const testMean = testY.reduce((s, v) => s + v, 0) / testY.length;
      let ssTot = 0, ssRes = 0, absErr = 0;
      for (let i = 0; i < testY.length; i++) {
        ssTot += (testY[i] - testMean) ** 2;
        ssRes += (testY[i] - preds[i]) ** 2;
        absErr += Math.abs(testY[i] - preds[i]);
      }
      statResults[stat].maes.push(absErr / testY.length);
      statResults[stat].r2s.push(ssTot > 0 ? 1 - ssRes / ssTot : 0);
    }
  }
  const result: Record<string, { meanMAE: number; meanR2: number }> = {};
  for (const stat of STAT_KEYS) {
    const { maes, r2s } = statResults[stat];
    result[stat] = {
      meanMAE: maes.reduce((s, v) => s + v, 0) / maes.length,
      meanR2: r2s.reduce((s, v) => s + v, 0) / r2s.length,
    };
  }
  return result;
}

function findBestLambda(features: number[][], targets: Record<string, number[]>, years: number[]): number {
  const lambdas = [0.01, 0.1, 0.5, 1, 2, 5, 10, 50, 100];
  let bestLambda = 1;
  let bestScore = Infinity;
  const w: Record<string, number> = { pts: 2, reb: 2, ast: 2, stl: 1, blk: 1, threePM: 1, fgPct: 1, ftPct: 1, tov: 1 };
  for (const lambda of lambdas) {
    const cv = crossValidate(features, targets, years, lambda);
    let totalMAE = 0, totalW = 0;
    for (const stat of STAT_KEYS) { const wt = w[stat] || 1; totalMAE += cv[stat].meanMAE * wt; totalW += wt; }
    const avgMAE = totalMAE / totalW;
    if (avgMAE < bestScore) { bestScore = avgMAE; bestLambda = lambda; }
  }
  return bestLambda;
}

function fantasyValue(target: Record<string, number>): number {
  return (target.pts ?? 0) * 1 + (target.reb ?? 0) * 1.2 + (target.ast ?? 0) * 1.5
    + (target.stl ?? 0) * 3 + (target.blk ?? 0) * 3 + (target.tov ?? 0) * -1;
}

function correlation(x: number[], y: number[]): number {
  const n = x.length;
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

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Main ──

function main() {
  const records: TrainingRecord[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const years = records.map((r) => r.draftYear);
  const targets: Record<string, number[]> = {};
  for (const stat of STAT_KEYS) targets[stat] = records.map((r) => r.target[stat] ?? 0);

  const extractFeatures = (keys: string[]) =>
    records.map((r) => keys.map((k) => {
      const val = r.features[k];
      if (typeof val === 'boolean') return val ? 1 : 0;
      return val ?? 0;
    }));

  const featuresV1 = extractFeatures(ALL_FEATURES);
  const featuresBlind = extractFeatures(BLIND_FEATURES);

  // ── Translation analysis ──
  console.log('Building translation analysis...');
  const collegeDir = path.join(DATA_DIR, 'raw', 'college');
  const nbaDir = path.join(DATA_DIR, 'raw', 'nba');
  const college = records.filter((r) => !r.isInternational && r.totalNBAGames >= 50);

  interface PlayerPair {
    name: string; pick: number;
    collegePts: number; collegeReb: number; collegeAst: number;
    collegeStl: number; collegeBlk: number; college3PM: number;
    collegeTov: number; collegeFtPct: number; college3Pct: number; collegeFgPct: number;
    nbaPts: number; nbaReb: number; nbaAst: number;
    nbaStl: number; nbaBlk: number; nba3PM: number;
    nbaTov: number; nbaFtPct: number; nbaFgPct: number;
  }

  const pairs: PlayerPair[] = [];
  for (const r of college) {
    const cPath = path.join(collegeDir, `${r.slug}.json`);
    const nPath = path.join(nbaDir, `${r.slug}.json`);
    if (!fs.existsSync(cPath) || !fs.existsSync(nPath)) continue;
    const cData = JSON.parse(fs.readFileSync(cPath, 'utf-8'));
    const nData = JSON.parse(fs.readFileSync(nPath, 'utf-8'));
    const realSeasons = cData.seasons.filter((s: any) =>
      !s.season.includes('Career') && s.season.match(/^\d{4}-\d{2}$/)
    );
    if (realSeasons.length === 0) continue;
    const last = realSeasons[realSeasons.length - 1];
    pairs.push({
      name: r.name, pick: r.pick,
      collegePts: last.pts, collegeReb: last.reb, collegeAst: last.ast,
      collegeStl: last.stl, collegeBlk: last.blk, college3PM: last.threePM,
      collegeTov: last.tov, collegeFtPct: last.ftPct, college3Pct: last.threePtPct, collegeFgPct: last.fgPct,
      nbaPts: nData.first4Avg.pts, nbaReb: nData.first4Avg.reb, nbaAst: nData.first4Avg.ast,
      nbaStl: nData.first4Avg.stl, nbaBlk: nData.first4Avg.blk, nba3PM: nData.first4Avg.threePM,
      nbaTov: nData.first4Avg.tov, nbaFtPct: nData.first4Avg.ftPct, nbaFgPct: nData.first4Avg.fgPct,
    });
  }

  const statComps = [
    { label: 'Points', cKey: 'collegePts', nKey: 'nbaPts' },
    { label: 'Rebounds', cKey: 'collegeReb', nKey: 'nbaReb' },
    { label: 'Assists', cKey: 'collegeAst', nKey: 'nbaAst' },
    { label: 'Steals', cKey: 'collegeStl', nKey: 'nbaStl' },
    { label: 'Blocks', cKey: 'collegeBlk', nKey: 'nbaBlk' },
    { label: '3PM', cKey: 'college3PM', nKey: 'nba3PM' },
    { label: 'Turnovers', cKey: 'collegeTov', nKey: 'nbaTov' },
    { label: 'FT%', cKey: 'collegeFtPct', nKey: 'nbaFtPct' },
    { label: 'FG%', cKey: 'collegeFgPct', nKey: 'nbaFgPct' },
  ];

  const translationStats = statComps.map(({ label, cKey, nKey }) => {
    const cVals = pairs.map((p) => (p as any)[cKey] as number);
    const nVals = pairs.map((p) => (p as any)[nKey] as number);
    const cAvg = cVals.reduce((s, v) => s + v, 0) / cVals.length;
    const nAvg = nVals.reduce((s, v) => s + v, 0) / nVals.length;
    const r = correlation(cVals, nVals);
    const changes = cVals.map((c, i) => nVals[i] - c);
    const pctUp = changes.filter((c) => c > 0.001).length / changes.length;
    const pctDown = changes.filter((c) => c < -0.001).length / changes.length;
    const medianChange = percentile(changes, 50);
    const r2 = r * r;
    const stickiness = r2 > 0.4 ? 'HIGH' : r2 > 0.2 ? 'MODERATE' : r2 > 0.1 ? 'LOW' : 'WEAK';
    const isPct = label.includes('%');
    return { label, collegeAvg: cAvg, nbaAvg: nAvg, correlation: r, r2, stickiness, isPct, pctUp, pctDown, medianChange };
  });

  // FT% deep dive
  const ftPairs = pairs.filter((p) => p.collegeFtPct > 0 && p.nbaFtPct > 0);
  const ftToFt = correlation(ftPairs.map((p) => p.collegeFtPct), ftPairs.map((p) => p.nbaFtPct));
  const ftToFg = correlation(ftPairs.map((p) => p.collegeFtPct), ftPairs.map((p) => p.nbaFgPct));
  const threePctToFg = correlation(
    pairs.filter((p) => p.college3Pct > 0).map((p) => p.college3Pct),
    pairs.filter((p) => p.college3Pct > 0).map((p) => p.nbaFgPct)
  );

  const ftBuckets = [
    { label: 'Elite (80%+)', min: 0.80, max: 1.0 },
    { label: 'Good (72-80%)', min: 0.72, max: 0.80 },
    { label: 'Average (65-72%)', min: 0.65, max: 0.72 },
    { label: 'Poor (<65%)', min: 0, max: 0.65 },
  ].map(({ label, min, max }) => {
    const bucket = ftPairs.filter((p) => p.collegeFtPct >= min && p.collegeFtPct < max);
    if (bucket.length === 0) return null;
    return {
      label, count: bucket.length,
      avgNbaPts: bucket.reduce((s, p) => s + p.nbaPts, 0) / bucket.length,
      avgNbaFtPct: bucket.reduce((s, p) => s + p.nbaFtPct, 0) / bucket.length,
      avgNbaFgPct: bucket.reduce((s, p) => s + p.nbaFgPct, 0) / bucket.length,
      avgPick: bucket.reduce((s, p) => s + p.pick, 0) / bucket.length,
    };
  }).filter(Boolean);

  // Late-round gems
  const lateGems = pairs
    .filter((p) => p.pick >= 25 && p.nbaPts >= 10)
    .sort((a, b) => b.nbaPts - a.nbaPts)
    .slice(0, 20)
    .map((p) => ({
      name: p.name, pick: p.pick,
      collegePts: p.collegePts, nbaPts: p.nbaPts,
      collegeFtPct: p.collegeFtPct, collegeStl: p.collegeStl,
    }));

  const lateAll = pairs.filter((p) => p.pick >= 25);
  const allLateGems = pairs.filter((p) => p.pick >= 25 && p.nbaPts >= 10);
  const lateTraits = {
    gems: {
      pts: allLateGems.reduce((s, p) => s + p.collegePts, 0) / allLateGems.length,
      ftPct: allLateGems.reduce((s, p) => s + p.collegeFtPct, 0) / allLateGems.length,
      stl: allLateGems.reduce((s, p) => s + p.collegeStl, 0) / allLateGems.length,
      blk: allLateGems.reduce((s, p) => s + p.collegeBlk, 0) / allLateGems.length,
      ast: allLateGems.reduce((s, p) => s + p.collegeAst, 0) / allLateGems.length,
    },
    allLate: {
      pts: lateAll.reduce((s, p) => s + p.collegePts, 0) / lateAll.length,
      ftPct: lateAll.reduce((s, p) => s + p.collegeFtPct, 0) / lateAll.length,
      stl: lateAll.reduce((s, p) => s + p.collegeStl, 0) / lateAll.length,
      blk: lateAll.reduce((s, p) => s + p.collegeBlk, 0) / lateAll.length,
      ast: lateAll.reduce((s, p) => s + p.collegeAst, 0) / lateAll.length,
    },
    gemCount: allLateGems.length,
    allLateCount: lateAll.length,
  };

  // ── Blind model comparison ──
  console.log('Training models for comparison...');
  const lambdaV1 = findBestLambda(featuresV1, targets, years);
  const lambdaBlind = findBestLambda(featuresBlind, targets, years);
  const cvV1 = crossValidate(featuresV1, targets, years, lambdaV1);
  const cvBlind = crossValidate(featuresBlind, targets, years, lambdaBlind);

  const { normalized: normV1, means: meansV1, stds: stdsV1 } = normalizeFeatures(featuresV1);
  const { normalized: normBlind, means: meansBlind, stds: stdsBlind } = normalizeFeatures(featuresBlind);
  const modelsV1: Record<string, StatModel> = {};
  const modelsBlind: Record<string, StatModel> = {};
  for (const stat of STAT_KEYS) {
    modelsV1[stat] = trainRidge(normV1, targets[stat], lambdaV1);
    modelsBlind[stat] = trainRidge(normBlind, targets[stat], lambdaBlind);
  }

  const cvComparison = STAT_KEYS.map((stat) => ({
    stat,
    v1MAE: cvV1[stat].meanMAE,
    v1R2: cvV1[stat].meanR2,
    blindMAE: cvBlind[stat].meanMAE,
    blindR2: cvBlind[stat].meanR2,
    winner: cvBlind[stat].meanR2 > cvV1[stat].meanR2 ? 'blind' : 'v1',
  }));

  // Feature weights
  const v1PtsWeights = modelsV1.pts.weights
    .map((w, i) => ({ feature: ALL_FEATURES[i], weight: w }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);
  const blindPtsWeights = modelsBlind.pts.weights
    .map((w, i) => ({ feature: BLIND_FEATURES[i], weight: w }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);

  // Disagreements
  const comparisons = records
    .filter((r) => r.totalNBAGames >= 100)
    .map((r) => {
      const idx = records.indexOf(r);
      const actualFV = fantasyValue(r.target);
      // Predict with each model
      const normV1Vec = normalizeSingle(featuresV1[idx], meansV1, stdsV1);
      const normBlindVec = normalizeSingle(featuresBlind[idx], meansBlind, stdsBlind);
      let v1FV = 0, blindFV = 0;
      for (const stat of STAT_KEYS) {
        let v1Pred = modelsV1[stat].bias;
        for (let j = 0; j < modelsV1[stat].weights.length; j++) v1Pred += modelsV1[stat].weights[j] * normV1Vec[j];
        let blindPred = modelsBlind[stat].bias;
        for (let j = 0; j < modelsBlind[stat].weights.length; j++) blindPred += modelsBlind[stat].weights[j] * normBlindVec[j];
        const v1Clamped = clampStat(stat, v1Pred);
        const blindClamped = clampStat(stat, blindPred);
        const mult = stat === 'pts' ? 1 : stat === 'reb' ? 1.2 : stat === 'ast' ? 1.5
          : stat === 'stl' ? 3 : stat === 'blk' ? 3 : stat === 'tov' ? -1 : 0;
        v1FV += v1Clamped * mult;
        blindFV += blindClamped * mult;
      }
      return {
        name: r.name, pick: r.pick, draftYear: r.draftYear,
        actualFV: Math.round(actualFV * 10) / 10,
        v1FV: Math.round(v1FV * 10) / 10,
        blindFV: Math.round(blindFV * 10) / 10,
        blindGap: Math.round((blindFV - actualFV) * 10) / 10,
      };
    });

  const undervalued = [...comparisons].sort((a, b) => a.blindGap - b.blindGap).slice(0, 15);
  const overvalued = [...comparisons].sort((a, b) => b.blindGap - a.blindGap).slice(0, 15);

  // Accuracy by range
  const latePicks = comparisons.filter((p) => p.pick >= 20);
  const midPicks = comparisons.filter((p) => p.pick >= 10 && p.pick <= 20);
  const earlyPicks = comparisons.filter((p) => p.pick <= 5);

  const rangeAccuracy = [
    {
      range: 'Top 5', count: earlyPicks.length,
      v1MAE: earlyPicks.reduce((s, p) => s + Math.abs(p.v1FV - p.actualFV), 0) / earlyPicks.length,
      blindMAE: earlyPicks.reduce((s, p) => s + Math.abs(p.blindFV - p.actualFV), 0) / earlyPicks.length,
    },
    {
      range: '10-20', count: midPicks.length,
      v1MAE: midPicks.reduce((s, p) => s + Math.abs(p.v1FV - p.actualFV), 0) / midPicks.length,
      blindMAE: midPicks.reduce((s, p) => s + Math.abs(p.blindFV - p.actualFV), 0) / midPicks.length,
    },
    {
      range: '20+', count: latePicks.length,
      v1MAE: latePicks.reduce((s, p) => s + Math.abs(p.v1FV - p.actualFV), 0) / latePicks.length,
      blindMAE: latePicks.reduce((s, p) => s + Math.abs(p.blindFV - p.actualFV), 0) / latePicks.length,
    },
  ].map((r) => ({ ...r, winner: r.blindMAE < r.v1MAE ? 'blind' : 'v1' }));

  // ── Assemble output ──
  const output = {
    generatedAt: new Date().toISOString(),
    sampleCount: records.length,
    collegePairCount: pairs.length,

    translation: {
      stats: translationStats,
      ftDeepDive: {
        ftToFt: { r: ftToFt, r2: ftToFt ** 2 },
        ftToFg: { r: ftToFg, r2: ftToFg ** 2 },
        threePctToFg: { r: threePctToFg, r2: threePctToFg ** 2 },
        buckets: ftBuckets,
      },
      lateGems,
      lateTraits,
    },

    blindComparison: {
      lambdaV1,
      lambdaBlind,
      cvComparison,
      v1PtsWeights,
      blindPtsWeights,
      undervalued,
      overvalued,
      rangeAccuracy,
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Analysis saved to ${OUTPUT_PATH}`);
}

main();
