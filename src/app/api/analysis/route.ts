import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const analysisPath = path.join(process.cwd(), 'data', 'analysis.json');

  if (!fs.existsSync(analysisPath)) {
    return NextResponse.json(
      { error: 'Analysis not found. Run generate-analysis-json.ts first.' },
      { status: 404 }
    );
  }

  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  return NextResponse.json(analysis);
}
