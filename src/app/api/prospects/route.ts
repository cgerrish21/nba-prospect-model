import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || '2025';

  const predictionsPath = path.join(process.cwd(), 'data', 'predictions', `${year}-class.json`);

  if (!fs.existsSync(predictionsPath)) {
    return NextResponse.json(
      { error: `No predictions found for ${year}` },
      { status: 404 }
    );
  }

  const predictions = JSON.parse(fs.readFileSync(predictionsPath, 'utf-8'));
  return NextResponse.json(predictions);
}
