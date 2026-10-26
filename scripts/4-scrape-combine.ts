/**
 * Script 4: Parse NBA Draft Combine Measurements from xlsx
 * Source: data/raw/combine/NBA Combine Data.xlsx (manually downloaded from NBA.com)
 * Output: data/raw/combine/{year}.json
 * Fields: Height (no shoes), weight, wingspan, standing reach, hand size,
 *         body fat, lane agility, shuttle run, sprint, vertical leap, bench press
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'combine');
const XLSX_PATH = path.join(OUTPUT_DIR, 'NBA Combine Data.xlsx');

interface CombineEntry {
  name: string;
  position: string;
  year: number;
  heightNoShoes: number | null;   // inches
  weight: number | null;           // lbs
  wingspan: number | null;         // inches
  standingReach: number | null;    // inches
  handLength: number | null;       // inches
  handWidth: number | null;        // inches
  bodyFatPct: number | null;
  laneAgility: number | null;      // seconds
  shuttleRun: number | null;       // seconds
  sprint: number | null;           // seconds (three-quarter court)
  standingVertical: number | null; // inches
  maxVertical: number | null;      // inches
  benchPress: number | null;       // repetitions
}

/**
 * Convert height string like "6' 9.25''" to total inches
 */
function parseHeight(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '-') return null;

  const str = String(val).trim();
  if (str === '-' || str === '') return null;

  // Pattern: "6' 9.25''" or "6'9.25''" or "6' 9.25"
  const match = str.match(/(\d+)'\s*(\d+\.?\d*)/);
  if (match) {
    return parseInt(match[1]) * 12 + parseFloat(match[2]);
  }

  const num = parseFloat(str);
  if (!isNaN(num)) {
    return num > 60 ? num : null;
  }

  return null;
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const str = String(val).trim();
  if (str === '-' || str === '-%') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseBodyFat(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '-' || val === '-%') return null;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str === '-%' || str === '-') return null;
  const num = parseFloat(str.replace('%', ''));
  return isNaN(num) ? null : num;
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`File not found: ${XLSX_PATH}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  let totalPlayers = 0;

  for (const sheetName of wb.SheetNames) {
    const year = parseInt(sheetName);
    if (isNaN(year)) {
      console.log(`Skipping sheet "${sheetName}" (not a year)`);
      continue;
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    if (rows.length < 2) {
      console.log(`${year}: no data`);
      continue;
    }

    // Find column indices from header row
    const headers = (rows[0] as string[]).map((h) =>
      String(h || '').replace(/\n/g, ' ').trim().toUpperCase()
    );

    const col = (name: string) => headers.findIndex((h) => h.includes(name));

    const nameIdx = col('PLAYER');
    const posIdx = col('POS');
    const fatIdx = col('BODY FAT');
    const handLenIdx = col('HAND LENGTH');
    const handWidIdx = col('HAND WIDTH');
    const heightIdx = col('HEIGHT W/O');
    const reachIdx = col('STANDING REACH');
    const weightIdx = col('WEIGHT');
    const wingspanIdx = col('WINGSPAN');
    const laneIdx = col('LANE AGILITY');
    const shuttleIdx = col('SHUTTLE');
    const sprintIdx = col('THREE QUARTER');
    const standVertIdx = col('STANDING VERTICAL');
    const maxVertIdx = col('MAX VERTICAL');
    const benchIdx = col('BENCH');

    const entries: CombineEntry[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
      if (!name) continue;

      entries.push({
        name,
        position: posIdx >= 0 ? String(row[posIdx] || '').trim() : '',
        year,
        heightNoShoes: heightIdx >= 0 ? parseHeight(row[heightIdx]) : null,
        weight: weightIdx >= 0 ? parseNumber(row[weightIdx]) : null,
        wingspan: wingspanIdx >= 0 ? parseHeight(row[wingspanIdx]) : null,
        standingReach: reachIdx >= 0 ? parseHeight(row[reachIdx]) : null,
        handLength: handLenIdx >= 0 ? parseNumber(row[handLenIdx]) : null,
        handWidth: handWidIdx >= 0 ? parseNumber(row[handWidIdx]) : null,
        bodyFatPct: fatIdx >= 0 ? parseBodyFat(row[fatIdx]) : null,
        laneAgility: laneIdx >= 0 ? parseNumber(row[laneIdx]) : null,
        shuttleRun: shuttleIdx >= 0 ? parseNumber(row[shuttleIdx]) : null,
        sprint: sprintIdx >= 0 ? parseNumber(row[sprintIdx]) : null,
        standingVertical: standVertIdx >= 0 ? parseNumber(row[standVertIdx]) : null,
        maxVertical: maxVertIdx >= 0 ? parseNumber(row[maxVertIdx]) : null,
        benchPress: benchIdx >= 0 ? parseNumber(row[benchIdx]) : null,
      });
    }

    const outPath = path.join(OUTPUT_DIR, `${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
    console.log(`${year}: ${entries.length} players`);
    totalPlayers += entries.length;
  }

  console.log(`\nDone! Total combine records: ${totalPlayers}`);
}

main();
