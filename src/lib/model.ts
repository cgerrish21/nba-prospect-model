import { StatModel, TrainedModel, CrossValidationResult, STAT_KEYS, NBAStatLine } from './types';
import { normalizeFeatures, normalizeSingle } from './features';

/**
 * Multi-output ridge regression model.
 * Trains 9 separate ridge regression models (one per stat category).
 */

/**
 * Train a single ridge regression model using closed-form solution:
 * w = (X^T X + λI)^{-1} X^T y
 */
function trainRidge(
  X: number[][],      // normalized features [n_samples x n_features]
  y: number[],        // target values [n_samples]
  lambda: number = 1.0,
): StatModel {
  const n = X.length;
  const p = X[0].length;

  // Add bias column (column of 1s)
  const Xb = X.map((row) => [...row, 1]);
  const pb = p + 1;

  // Compute X^T X + λI
  const XtX: number[][] = Array.from({ length: pb }, () => new Array(pb).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < pb; j++) {
      for (let k = 0; k < pb; k++) {
        XtX[j][k] += Xb[i][j] * Xb[i][k];
      }
    }
  }

  // Add regularization (don't regularize bias term)
  for (let j = 0; j < p; j++) {
    XtX[j][j] += lambda;
  }

  // Compute X^T y
  const Xty: number[] = new Array(pb).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < pb; j++) {
      Xty[j] += Xb[i][j] * y[i];
    }
  }

  // Solve via Gaussian elimination
  const weights = solveLinearSystem(XtX, Xty);

  // Extract bias (last element)
  const bias = weights[p];
  const w = weights.slice(0, p);

  // Calculate R² and MAE
  const predictions = X.map((row) => {
    let pred = bias;
    for (let j = 0; j < p; j++) {
      pred += w[j] * row[j];
    }
    return pred;
  });

  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0, absErr = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - predictions[i]) ** 2;
    absErr += Math.abs(y[i] - predictions[i]);
  }

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const mae = absErr / n;

  return { weights: w, bias, r2, mae, lambda };
}

/**
 * Gaussian elimination with partial pivoting to solve Ax = b
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Create augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x: number[] = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let j = row + 1; j < n; j++) {
      x[row] -= aug[row][j] * x[j];
    }
    x[row] /= aug[row][row];
  }

  return x;
}

/**
 * Train multi-output ridge regression (one model per stat)
 */
export function trainMultiOutputRidge(
  features: number[][],
  targets: Record<string, number[]>,
  featureNames: string[],
  lambda: number = 1.0,
): TrainedModel {
  // Normalize features
  const { normalized, means, stds } = normalizeFeatures(features);

  const statModels: Record<string, StatModel> = {};
  for (const stat of STAT_KEYS) {
    if (!targets[stat]) continue;
    statModels[stat] = trainRidge(normalized, targets[stat], lambda);
  }

  return {
    statModels,
    featureNames,
    featureMeans: means,
    featureStds: stds,
    trainedAt: new Date().toISOString(),
    sampleCount: features.length,
    crossValidation: { folds: 0, statResults: {} },
  };
}

/**
 * Predict stats for a single feature vector
 */
export function predict(
  model: TrainedModel,
  features: number[],
): NBAStatLine {
  const normalized = normalizeSingle(features, model.featureMeans, model.featureStds);

  const result: Record<string, number> = {};
  for (const stat of STAT_KEYS) {
    const sm = model.statModels[stat];
    if (!sm) {
      result[stat] = 0;
      continue;
    }
    let pred = sm.bias;
    for (let j = 0; j < sm.weights.length; j++) {
      pred += sm.weights[j] * normalized[j];
    }
    // Clamp predictions to reasonable ranges
    result[stat] = clampStat(stat, pred);
  }

  return result as unknown as NBAStatLine;
}

/**
 * Clamp predicted stats to reasonable NBA ranges
 */
function clampStat(stat: string, value: number): number {
  const ranges: Record<string, [number, number]> = {
    pts: [0, 35],
    reb: [0, 15],
    ast: [0, 12],
    stl: [0, 3],
    blk: [0, 4],
    threePM: [0, 5],
    fgPct: [0.30, 0.65],
    ftPct: [0.40, 0.95],
    tov: [0, 5],
  };
  const [min, max] = ranges[stat] || [0, 100];
  return Math.max(min, Math.min(max, value));
}

/**
 * Leave-one-year-out cross-validation
 */
export function crossValidate(
  features: number[][],
  targets: Record<string, number[]>,
  years: number[],
  featureNames: string[],
  lambda: number = 1.0,
): CrossValidationResult {
  const uniqueYears = [...new Set(years)].sort();
  const statResults: Record<string, { maes: number[]; r2s: number[] }> = {};

  for (const stat of STAT_KEYS) {
    statResults[stat] = { maes: [], r2s: [] };
  }

  for (const holdoutYear of uniqueYears) {
    // Split train/test
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    for (let i = 0; i < years.length; i++) {
      if (years[i] === holdoutYear) testIdx.push(i);
      else trainIdx.push(i);
    }

    if (testIdx.length === 0 || trainIdx.length === 0) continue;

    const trainFeatures = trainIdx.map((i) => features[i]);
    const testFeatures = testIdx.map((i) => features[i]);

    // Normalize using training data
    const { normalized: trainNorm, means, stds } = normalizeFeatures(trainFeatures);
    const testNorm = testFeatures.map((row) => normalizeSingle(row, means, stds));

    for (const stat of STAT_KEYS) {
      const trainY = trainIdx.map((i) => targets[stat][i]);
      const testY = testIdx.map((i) => targets[stat][i]);

      const model = trainRidge(trainNorm, trainY, lambda);

      // Predict on test set
      const preds = testNorm.map((row) => {
        let pred = model.bias;
        for (let j = 0; j < model.weights.length; j++) {
          pred += model.weights[j] * row[j];
        }
        return clampStat(stat, pred);
      });

      // Calculate test MAE and R²
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

  // Average across folds
  const averaged: Record<string, { meanMAE: number; meanR2: number }> = {};
  for (const stat of STAT_KEYS) {
    const { maes, r2s } = statResults[stat];
    averaged[stat] = {
      meanMAE: maes.reduce((s, v) => s + v, 0) / maes.length,
      meanR2: r2s.reduce((s, v) => s + v, 0) / r2s.length,
    };
  }

  return { folds: uniqueYears.length, statResults: averaged };
}

/**
 * Find optimal lambda via cross-validation
 */
export function findBestLambda(
  features: number[][],
  targets: Record<string, number[]>,
  years: number[],
  featureNames: string[],
  lambdas: number[] = [0.01, 0.1, 0.5, 1, 2, 5, 10, 50, 100],
): number {
  let bestLambda = 1;
  let bestAvgMAE = Infinity;

  // Compute stat scales for normalization (mean of target values)
  const statScales: Record<string, number> = {};
  for (const stat of STAT_KEYS) {
    const vals = targets[stat];
    const mean = vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length;
    statScales[stat] = mean > 0 ? mean : 1;
  }

  for (const lambda of lambdas) {
    const cv = crossValidate(features, targets, years, featureNames, lambda);
    // Normalized MAE: divide each stat's MAE by its scale so all stats contribute equally
    const weights: Record<string, number> = {
      pts: 2, reb: 2, ast: 2, stl: 1, blk: 1, threePM: 1, fgPct: 1, ftPct: 1, tov: 1,
    };
    let totalMAE = 0;
    let totalWeight = 0;
    for (const stat of STAT_KEYS) {
      const w = weights[stat] || 1;
      totalMAE += (cv.statResults[stat].meanMAE / statScales[stat]) * w;
      totalWeight += w;
    }
    const avgMAE = totalMAE / totalWeight;

    if (avgMAE < bestAvgMAE) {
      bestAvgMAE = avgMAE;
      bestLambda = lambda;
    }
  }

  return bestLambda;
}
