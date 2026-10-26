import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const p = path.join(process.cwd(), 'data', 'success-analysis.json');
  if (!fs.existsSync(p)) {
    return NextResponse.json({ error: 'Run analyze-success.ts first.' }, { status: 404 });
  }
  return NextResponse.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
}
