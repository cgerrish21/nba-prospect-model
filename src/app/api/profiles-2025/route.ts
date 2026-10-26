import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const p = path.join(process.cwd(), 'data', '2025-profiles.json');
  if (!fs.existsSync(p)) {
    return NextResponse.json({ error: 'Run 12-profile-2025-class.ts first.' }, { status: 404 });
  }
  return NextResponse.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
}
