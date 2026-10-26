/**
 * Script 6: Train Multi-Output Ridge Regression Model
 * Input: data/dataset.json
 * Output: data/model.json
 *
 * Process:
 * 1. Load training dataset
 * 2. Find optimal lambda via cross-validation
 * 3. Train final model on all data
 * 4. Report cross-validation metrics
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATASET_PATH = path.join(DATA_DIR, 'dataset.json');
const MODEL_PATH = path.join(DATA_DIR, 'model.json');

// ── Types ──

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

interface TrainedModel {
  statModels: Record<string, StatModel>;
  featureNames: string[];
  featureMeans: number[];
  featureStds: number[];
  trainedAt: string;
  sampleCount: number;
  crossValidation: { folds: number; statResults: Record<string, { meanMAE: number; meanR2: number }> };
}

const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'threePM', 'fgPct', 'ftPct', 'tov'];

const FEATURE_KEYS = [
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

// ── Math utilities ──

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
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
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
      for (let k = 0; k < pb; k++) {
        XtX[j][k] += Xb[i][j] * Xb[i][k];
      }
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

// ── Cross-validation ──

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

// ── Main ──

function main() {
  console.log('Loading dataset...');
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`Dataset not found at ${DATASET_PATH}. Run script 5 first.`);
    process.exit(1);
  }

  const records: TrainingRecord[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  console.log(`  Loaded ${records.length} records`);

  // Extract features and targets
  const features: number[][] = records.map((r) => FEATURE_KEYS.map((k) => {
    const val = r.features[k];
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val ?? 0;
  }));
  const years = records.map((r) => r.draftYear);
  const targets: Record<string, number[]> = {};
  for (const stat of STAT_KEYS) {
    targets[stat] = records.map((r) => r.target[stat] ?? 0);
  }

  // Find best lambda
  console.log('\nFinding optimal regularization (lambda)...');
  const lambdas = [0.01, 0.1, 0.5, 1, 2, 5, 10, 50, 100];
  let bestLambda = 1;
  let bestScore = Infinity;

  for (const lambda of lambdas) {
    const cv = crossValidate(features, targets, years, lambda);
    // Weighted average MAE (PTS, REB, AST weighted 2x)
    const weights: Record<string, number> = { pts: 2, reb: 2, ast: 2, stl: 1, blk: 1, threePM: 1, fgPct: 1, ftPct: 1, tov: 1 };
    let totalMAE = 0, totalW = 0;
    for (const stat of STAT_KEYS) {
      const w = weights[stat] || 1;
      totalMAE += cv[stat].meanMAE * w;
      totalW += w;
    }
    const avgMAE = totalMAE / totalW;
    console.log(`  lambda=${lambda}: avg weighted MAE = ${avgMAE.toFixed(4)}`);
    if (avgMAE < bestScore) {
      bestScore = avgMAE;
      bestLambda = lambda;
    }
  }
  console.log(`  Best lambda: ${bestLambda}`);

  // Final cross-validation with best lambda
  console.log('\nCross-validation results (leave-one-year-out):');
  const cvResults = crossValidate(features, targets, years, bestLambda);
  console.log('  Stat     | MAE    | R²');
  console.log('  ---------|--------|--------');
  for (const stat of STAT_KEYS) {
    const { meanMAE, meanR2 } = cvResults[stat];
    console.log(`  ${stat.padEnd(8)} | ${meanMAE.toFixed(3).padStart(6)} | ${meanR2.toFixed(3).padStart(6)}`);
  }

  // Train final model on all data
  console.log('\nTraining final model on all data...');
  const { normalized, means, stds } = normalizeFeatures(features);

  const statModels: Record<string, StatModel> = {};
  for (const stat of STAT_KEYS) {
    statModels[stat] = trainRidge(normalized, targets[stat], bestLambda);
    console.log(`  ${stat}: R²=${statModels[stat].r2.toFixed(3)}, MAE=${statModels[stat].mae.toFixed(3)}`);
  }

  const model: TrainedModel = {
    statModels,
    featureNames: FEATURE_KEYS,
    featureMeans: means,
    featureStds: stds,
    trainedAt: new Date().toISOString(),
    sampleCount: records.length,
    crossValidation: {
      folds: [...new Set(years)].length,
      statResults: cvResults,
    },
  };

  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  console.log(`\nModel saved to ${MODEL_PATH}`);

  // Print top feature weights for PTS
  console.log('\nTop feature weights for PTS prediction:');
  const ptsWeights = statModels.pts.weights
    .map((w, i) => ({ feature: FEATURE_KEYS[i], weight: w }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 10);
  for (const { feature, weight } of ptsWeights) {
    console.log(`  ${feature.padEnd(22)} ${weight >= 0 ? '+' : ''}${weight.toFixed(4)}`);
  }
}

main();
