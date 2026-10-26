import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const modelPath = path.join(process.cwd(), 'data', 'model.json');

  if (!fs.existsSync(modelPath)) {
    return NextResponse.json(
      { error: 'Model not found. Run training script first.' },
      { status: 404 }
    );
  }

  const model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

  // Build feature importance: absolute weight per feature, per stat
  const featureImportance: Record<string, Array<{ feature: string; weight: number; absWeight: number }>> = {};
  for (const [stat, sm] of Object.entries(model.statModels)) {
    const m = sm as { weights: number[]; bias: number; r2: number; mae: number };
    featureImportance[stat] = model.featureNames
      .map((name: string, i: number) => ({
        feature: name,
        weight: m.weights[i],
        absWeight: Math.abs(m.weights[i]),
      }))
      .sort((a: { absWeight: number }, b: { absWeight: number }) => b.absWeight - a.absWeight);
  }

  // Overall importance: average absolute weight across all stats
  const overallImportance = model.featureNames
    .map((name: string, i: number) => {
      let totalAbs = 0;
      let count = 0;
      for (const sm of Object.values(model.statModels)) {
        const m = sm as { weights: number[] };
        totalAbs += Math.abs(m.weights[i]);
        count++;
      }
      return { feature: name, avgAbsWeight: count > 0 ? totalAbs / count : 0 };
    })
    .sort((a: { avgAbsWeight: number }, b: { avgAbsWeight: number }) => b.avgAbsWeight - a.avgAbsWeight);

  return NextResponse.json({
    trainedAt: model.trainedAt,
    sampleCount: model.sampleCount,
    featureNames: model.featureNames,
    crossValidation: model.crossValidation,
    statAccuracy: Object.entries(model.statModels).map(([stat, m]) => ({
      stat,
      r2: (m as { r2: number }).r2,
      mae: (m as { mae: number }).mae,
    })),
    featureImportance,
    overallImportance,
  });
}
