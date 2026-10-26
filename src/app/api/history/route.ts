import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const dataDir = path.join(process.cwd(), 'data');
  const datasetPath = path.join(dataDir, 'dataset.json');
  const modelPath = path.join(dataDir, 'model.json');

  if (!fs.existsSync(datasetPath) || !fs.existsSync(modelPath)) {
    return NextResponse.json(
      { error: 'Dataset or model not found' },
      { status: 404 }
    );
  }

  const dataset: Array<{
    name: string;
    slug: string;
    draftYear: number;
    pick: number;
    college: string;
    features: Record<string, number>;
    target: Record<string, number>;
    totalNBAGames: number;
  }> = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

  const model: {
    statModels: Record<string, { weights: number[]; bias: number }>;
    featureNames: string[];
    featureMeans: number[];
    featureStds: number[];
    crossValidation: { folds: number; statResults: Record<string, { meanMAE: number; meanR2: number }> };
  } = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

  const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'threePM', 'fgPct', 'ftPct', 'tov'];
  const FANTASY_WEIGHTS: Record<string, number> = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1 };

  function clampStat(stat: string, value: number): number {
    const ranges: Record<string, [number, number]> = {
      pts: [0, 35], reb: [0, 15], ast: [0, 12], stl: [0, 3], blk: [0, 4],
      threePM: [0, 5], fgPct: [0.30, 0.65], ftPct: [0.40, 0.95], tov: [0, 5],
    };
    const [min, max] = ranges[stat] || [0, 100];
    return Math.max(min, Math.min(max, value));
  }

  function predictRecord(features: Record<string, number>): Record<string, number> {
    const featureArray = model.featureNames.map((k) => features[k] ?? 0);
    const normalized = featureArray.map((val, j) =>
      (val - model.featureMeans[j]) / model.featureStds[j]
    );

    const result: Record<string, number> = {};
    for (const stat of STAT_KEYS) {
      const sm = model.statModels[stat];
      if (!sm) { result[stat] = 0; continue; }
      let pred = sm.bias;
      for (let j = 0; j < sm.weights.length; j++) pred += sm.weights[j] * normalized[j];
      result[stat] = clampStat(stat, pred);
    }
    return result;
  }

  function calcFantasy(stats: Record<string, number>): number {
    let total = 0;
    for (const [stat, weight] of Object.entries(FANTASY_WEIGHTS)) {
      total += (stats[stat] || 0) * weight;
    }
    return total;
  }

  // Group by draft year and calculate predictions vs actuals
  const byYear: Record<number, Array<{
    name: string;
    predicted: Record<string, number>;
    actual: Record<string, number>;
    predictedFantasy: number;
    actualFantasy: number;
  }>> = {};

  for (const record of dataset) {
    const predicted = predictRecord(record.features);
    const predictedFantasy = calcFantasy(predicted);
    const actualFantasy = calcFantasy(record.target);

    if (!byYear[record.draftYear]) byYear[record.draftYear] = [];
    byYear[record.draftYear].push({
      name: record.name,
      predicted,
      actual: record.target,
      predictedFantasy,
      actualFantasy,
    });
  }

  // Calculate per-year accuracy
  const yearAccuracy = Object.entries(byYear)
    .map(([year, players]) => {
      const maes: Record<string, number> = {};
      for (const stat of STAT_KEYS) {
        const errors = players.map((p) => Math.abs((p.predicted[stat] || 0) - (p.actual[stat] || 0)));
        maes[stat] = errors.reduce((s, v) => s + v, 0) / errors.length;
      }
      const fantasyErrors = players.map((p) => Math.abs(p.predictedFantasy - p.actualFantasy));
      return {
        year: parseInt(year),
        playerCount: players.length,
        statMAE: maes,
        fantasyMAE: fantasyErrors.reduce((s, v) => s + v, 0) / fantasyErrors.length,
        players: players
          .sort((a, b) => b.actualFantasy - a.actualFantasy)
          .slice(0, 10), // Top 10 per year
      };
    })
    .sort((a, b) => a.year - b.year);

  return NextResponse.json({
    crossValidation: model.crossValidation,
    yearAccuracy,
  });
}
