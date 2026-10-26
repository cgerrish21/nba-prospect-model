/**
 * Blind Model Comparison
 * Trains two models side-by-side:
 *   v1 = with draftPosition (current model)
 *   blind = without draftPosition (forces model to learn what actually translates)
 *
 * Then compares: CV metrics, top feature weights, and biggest disagreements
 * (disagreements = market inefficiencies where scouts and production diverge)
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATASET_PATH = path.join(DATA_DIR, 'dataset.json');
const BLIND_MODEL_PATH = path.join(DATA_DIR, 'model-blind.json');

interface TrainingRecord {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
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

// ── Math utilities (same as script 6) ──

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
      if (years[i] === holdoutYear) testIdx.push(i);
      else trainIdx.push(i);
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
  const weights: Record<string, number> = { pts: 2, reb: 2, ast: 2, stl: 1, blk: 1, threePM: 1, fgPct: 1, ftPct: 1, tov: 1 };

  for (const lambda of lambdas) {
    const cv = crossValidate(features, targets, years, lambda);
    let totalMAE = 0, totalW = 0;
    for (const stat of STAT_KEYS) {
      const w = weights[stat] || 1;
      totalMAE += cv[stat].meanMAE * w;
      totalW += w;
    }
    const avgMAE = totalMAE / totalW;
    if (avgMAE < bestScore) { bestScore = avgMAE; bestLambda = lambda; }
  }
  return bestLambda;
}

// Fantasy value: pts×1 + reb×1.2 + ast×1.5 + stl×3 + blk×3 + tov×(-1)
function fantasyValue(target: Record<string, number>): number {
  return (target.pts ?? 0) * 1
    + (target.reb ?? 0) * 1.2
    + (target.ast ?? 0) * 1.5
    + (target.stl ?? 0) * 3
    + (target.blk ?? 0) * 3
    + (target.tov ?? 0) * -1;
}

function predictFantasyValue(
  featureVec: number[], statModels: Record<string, StatModel>, means: number[], stds: number[],
): number {
  const norm = normalizeSingle(featureVec, means, stds);
  const preds: Record<string, number> = {};
  for (const stat of STAT_KEYS) {
    const m = statModels[stat];
    let pred = m.bias;
    for (let j = 0; j < m.weights.length; j++) pred += m.weights[j] * norm[j];
    preds[stat] = clampStat(stat, pred);
  }
  return fantasyValue(preds);
}

// ── Main ──

function main() {
  const records: TrainingRecord[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  console.log(`Loaded ${records.length} records\n`);

  const years = records.map((r) => r.draftYear);
  const targets: Record<string, number[]> = {};
  for (const stat of STAT_KEYS) {
    targets[stat] = records.map((r) => r.target[stat] ?? 0);
  }

  // ─── Build feature matrices ───
  const extractFeatures = (keys: string[]) =>
    records.map((r) => keys.map((k) => {
      const val = r.features[k];
      if (typeof val === 'boolean') return val ? 1 : 0;
      return val ?? 0;
    }));

  const featuresV1 = extractFeatures(ALL_FEATURES);
  const featuresBlind = extractFeatures(BLIND_FEATURES);

  // ─── Find best lambdas ───
  console.log('Finding optimal lambdas...');
  const lambdaV1 = findBestLambda(featuresV1, targets, years);
  const lambdaBlind = findBestLambda(featuresBlind, targets, years);
  console.log(`  v1 (with draft position): lambda = ${lambdaV1}`);
  console.log(`  Blind (no draft position): lambda = ${lambdaBlind}`);

  // ─── Cross-validation comparison ───
  const cvV1 = crossValidate(featuresV1, targets, years, lambdaV1);
  const cvBlind = crossValidate(featuresBlind, targets, years, lambdaBlind);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CROSS-VALIDATION COMPARISON (Leave-One-Year-Out)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('            ┌─── v1 (with pick) ───┐  ┌─── Blind (no pick) ──┐');
  console.log('  Stat      │   MAE    │    R²      │  │   MAE    │    R²      │  Winner');
  console.log('  ──────────┼──────────┼────────────┼──┼──────────┼────────────┼─────────');
  for (const stat of STAT_KEYS) {
    const v1 = cvV1[stat];
    const bl = cvBlind[stat];
    const winner = bl.meanR2 > v1.meanR2 ? '← BLIND' : v1.meanR2 > bl.meanR2 ? 'v1 →' : 'TIE';
    console.log(
      `  ${stat.padEnd(10)}│ ${v1.meanMAE.toFixed(3).padStart(8)} │ ${v1.meanR2.toFixed(3).padStart(8)}   │  ` +
      `│ ${bl.meanMAE.toFixed(3).padStart(8)} │ ${bl.meanR2.toFixed(3).padStart(8)}   │ ${winner}`
    );
  }

  // Weighted average
  const weights: Record<string, number> = { pts: 2, reb: 2, ast: 2, stl: 1, blk: 1, threePM: 1, fgPct: 1, ftPct: 1, tov: 1 };
  let v1MAE = 0, blMAE = 0, v1R2 = 0, blR2 = 0, tw = 0;
  for (const stat of STAT_KEYS) {
    const w = weights[stat] || 1;
    v1MAE += cvV1[stat].meanMAE * w;
    blMAE += cvBlind[stat].meanMAE * w;
    v1R2 += cvV1[stat].meanR2 * w;
    blR2 += cvBlind[stat].meanR2 * w;
    tw += w;
  }
  console.log('  ──────────┼──────────┼────────────┼──┼──────────┼────────────┼─────────');
  console.log(
    `  ${'WEIGHTED'.padEnd(10)}│ ${(v1MAE / tw).toFixed(3).padStart(8)} │ ${(v1R2 / tw).toFixed(3).padStart(8)}   │  ` +
    `│ ${(blMAE / tw).toFixed(3).padStart(8)} │ ${(blR2 / tw).toFixed(3).padStart(8)}   │ ${blR2 > v1R2 ? '← BLIND' : 'v1 →'}`
  );

  // ─── Train final models on all data ───
  console.log('\n\nTraining final models on all data...');
  const { normalized: normV1, means: meansV1, stds: stdsV1 } = normalizeFeatures(featuresV1);
  const { normalized: normBlind, means: meansBlind, stds: stdsBlind } = normalizeFeatures(featuresBlind);

  const modelsV1: Record<string, StatModel> = {};
  const modelsBlind: Record<string, StatModel> = {};
  for (const stat of STAT_KEYS) {
    modelsV1[stat] = trainRidge(normV1, targets[stat], lambdaV1);
    modelsBlind[stat] = trainRidge(normBlind, targets[stat], lambdaBlind);
  }

  // ─── Feature weight comparison (PTS model) ───
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TOP FEATURE WEIGHTS — PTS Prediction');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('  v1 Model (with draft position):');
  const v1Weights = modelsV1.pts.weights
    .map((w, i) => ({ feature: ALL_FEATURES[i], weight: w }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);
  for (const { feature, weight } of v1Weights) {
    console.log(`    ${feature.padEnd(24)} ${weight >= 0 ? '+' : ''}${weight.toFixed(4)}`);
  }

  console.log('\n  Blind Model (no draft position):');
  const blindWeights = modelsBlind.pts.weights
    .map((w, i) => ({ feature: BLIND_FEATURES[i], weight: w }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);
  for (const { feature, weight } of blindWeights) {
    console.log(`    ${feature.padEnd(24)} ${weight >= 0 ? '+' : ''}${weight.toFixed(4)}`);
  }

  // ─── Biggest disagreements (market inefficiency finder) ───
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  BIGGEST DISAGREEMENTS — Where Blind Model ≠ Draft Position');
  console.log('  (Gap between blind prediction and actual = market inefficiency)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  interface PlayerComparison {
    name: string;
    pick: number;
    draftYear: number;
    actualFV: number;
    v1FV: number;
    blindFV: number;
    blindGap: number; // blindFV - actualFV (positive = model overvalued, negative = undervalued)
    v1Gap: number;
  }

  const comparisons: PlayerComparison[] = records
    .filter((r) => r.totalNBAGames >= 100) // meaningful career
    .map((r, idx) => {
      const actualFV = fantasyValue(r.target);
      const v1FV = predictFantasyValue(featuresV1[idx], modelsV1, meansV1, stdsV1);
      const blindFV = predictFantasyValue(featuresBlind[idx], modelsBlind, meansBlind, stdsBlind);
      return {
        name: r.name,
        pick: r.pick,
        draftYear: r.draftYear,
        actualFV,
        v1FV,
        blindFV,
        blindGap: blindFV - actualFV,
        v1Gap: v1FV - actualFV,
      };
    });

  // Blind model undervalued (actual >> blind prediction) = sleepers the model misses
  console.log('  SLEEPERS the blind model UNDERVALUES (actual >> predicted):');
  console.log('  Name                        Year Pick  Actual  Blind  v1     Gap');
  console.log('  ──────────────────────────  ──── ────  ──────  ─────  ─────  ─────');
  const undervalued = [...comparisons].sort((a, b) => a.blindGap - b.blindGap).slice(0, 15);
  for (const p of undervalued) {
    console.log(
      `  ${p.name.padEnd(28)}${p.draftYear} ${String(p.pick).padStart(4)}  ${p.actualFV.toFixed(1).padStart(6)}  ${p.blindFV.toFixed(1).padStart(5)}  ${p.v1FV.toFixed(1).padStart(5)}  ${p.blindGap.toFixed(1).padStart(5)}`
    );
  }

  // Blind model overvalued (blind >> actual) = busts the model would have loved
  console.log('\n  BUSTS the blind model OVERVALUES (predicted >> actual):');
  console.log('  Name                        Year Pick  Actual  Blind  v1     Gap');
  console.log('  ──────────────────────────  ──── ────  ──────  ─────  ─────  ─────');
  const overvalued = [...comparisons].sort((a, b) => b.blindGap - a.blindGap).slice(0, 15);
  for (const p of overvalued) {
    console.log(
      `  ${p.name.padEnd(28)}${p.draftYear} ${String(p.pick).padStart(4)}  ${p.actualFV.toFixed(1).padStart(6)}  ${p.blindFV.toFixed(1).padStart(5)}  ${p.v1FV.toFixed(1).padStart(5)}  ${p.blindGap.toFixed(1).padStart(5)}`
    );
  }

  // ─── Blind model better at finding late value? ───
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  LATE-ROUND ACCURACY — Which model finds value after pick 20?');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const latePicks = comparisons.filter((p) => p.pick >= 20);
  const v1LateMAE = latePicks.reduce((s, p) => s + Math.abs(p.v1Gap), 0) / latePicks.length;
  const blindLateMAE = latePicks.reduce((s, p) => s + Math.abs(p.blindGap), 0) / latePicks.length;

  console.log(`  Players picked 20+: ${latePicks.length}`);
  console.log(`  v1 fantasy value MAE:    ${v1LateMAE.toFixed(2)}`);
  console.log(`  Blind fantasy value MAE: ${blindLateMAE.toFixed(2)}`);
  console.log(`  ${blindLateMAE < v1LateMAE ? '→ Blind model is MORE accurate on late picks' : '→ v1 model is more accurate on late picks'}`);

  // Top 3 and bottom 3 tiers
  const earlyPicks = comparisons.filter((p) => p.pick <= 5);
  const midPicks = comparisons.filter((p) => p.pick >= 10 && p.pick <= 20);

  const v1EarlyMAE = earlyPicks.reduce((s, p) => s + Math.abs(p.v1Gap), 0) / earlyPicks.length;
  const blindEarlyMAE = earlyPicks.reduce((s, p) => s + Math.abs(p.blindGap), 0) / earlyPicks.length;
  const v1MidMAE = midPicks.reduce((s, p) => s + Math.abs(p.v1Gap), 0) / midPicks.length;
  const blindMidMAE = midPicks.reduce((s, p) => s + Math.abs(p.blindGap), 0) / midPicks.length;

  console.log('\n  Accuracy by draft range:');
  console.log('  Range        v1 MAE    Blind MAE   Better');
  console.log('  ───────────  ────────  ──────────  ───────');
  console.log(`  Top 5        ${v1EarlyMAE.toFixed(2).padStart(8)}  ${blindEarlyMAE.toFixed(2).padStart(10)}  ${blindEarlyMAE < v1EarlyMAE ? 'Blind' : 'v1'}`);
  console.log(`  10-20        ${v1MidMAE.toFixed(2).padStart(8)}  ${blindMidMAE.toFixed(2).padStart(10)}  ${blindMidMAE < v1MidMAE ? 'Blind' : 'v1'}`);
  console.log(`  20+          ${v1LateMAE.toFixed(2).padStart(8)}  ${blindLateMAE.toFixed(2).padStart(10)}  ${blindLateMAE < v1LateMAE ? 'Blind' : 'v1'}`);

  // ─── Save blind model ───
  const { normalized: finalNorm, means: finalMeans, stds: finalStds } = normalizeFeatures(featuresBlind);
  const finalModels: Record<string, StatModel> = {};
  for (const stat of STAT_KEYS) {
    finalModels[stat] = trainRidge(finalNorm, targets[stat], lambdaBlind);
  }

  const blindModel = {
    statModels: finalModels,
    featureNames: BLIND_FEATURES,
    featureMeans: finalMeans,
    featureStds: finalStds,
    trainedAt: new Date().toISOString(),
    sampleCount: records.length,
    crossValidation: {
      folds: [...new Set(years)].length,
      statResults: cvBlind,
    },
  };

  fs.writeFileSync(BLIND_MODEL_PATH, JSON.stringify(blindModel, null, 2));
  console.log(`\nBlind model saved to ${BLIND_MODEL_PATH}`);
}

main();
