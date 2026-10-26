/**
 * College-to-Pro Translation Analysis
 * For each stat category, how well does the college number predict the NBA number?
 * Shows: correlation, average change, and direction of movement.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATASET_PATH = path.join(__dirname, '..', 'data', 'dataset.json');

interface Record {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
  isInternational: boolean;
  features: any;
  target: any;
  totalNBAGames: number;
}

// Stat pairs: college feature → NBA target
const STAT_PAIRS: Array<{ label: string; collegeKey: string; nbaKey: string; scaleFactor?: number }> = [
  { label: 'Points (per 40)', collegeKey: 'ptsPer40', nbaKey: 'pts' },
  { label: 'Rebounds (per 40)', collegeKey: 'rebPer40', nbaKey: 'reb' },
  { label: 'Assists (per 40)', collegeKey: 'astPer40', nbaKey: 'ast' },
  { label: 'Steals (per 40)', collegeKey: 'stlPer40', nbaKey: 'stl' },
  { label: 'Blocks (per 40)', collegeKey: 'blkPer40', nbaKey: 'blk' },
  { label: '3PM (per 40)', collegeKey: 'threePer40', nbaKey: 'threePM' },
  { label: 'Turnovers (per 40)', collegeKey: 'tovPer40', nbaKey: 'tov' },
  { label: 'FT%', collegeKey: 'freeThrowPct', nbaKey: 'ftPct', scaleFactor: 100 },
  { label: '3PT%', collegeKey: 'threePtPct', nbaKey: 'fgPct' },  // compare shooting %s
  { label: 'True Shooting %', collegeKey: 'trueShootingPct', nbaKey: 'fgPct' },
];

function correlation(x: number[], y: number[]): number {
  const n = x.length;
  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    denX += (x[i] - xMean) ** 2;
    denY += (y[i] - yMean) ** 2;
  }
  return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function main() {
  const records: Record[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));

  // Filter to college players with meaningful NBA careers (50+ games)
  const college = records.filter((r) => !r.isInternational && r.totalNBAGames >= 50);
  console.log(`Analyzing ${college.length} college players with 50+ NBA games\n`);

  // ─── Stat-by-stat translation ───
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  COLLEGE → PRO STAT TRANSLATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Direct college-to-NBA correlations using per-game college stats
  // We need to load college data to get raw per-game stats
  const collegeDir = path.join(__dirname, '..', 'data', 'raw', 'college');
  const nbaDir = path.join(__dirname, '..', 'data', 'raw', 'nba');

  interface PlayerPair {
    name: string;
    pick: number;
    collegePts: number; collegeReb: number; collegeAst: number;
    collegeStl: number; collegeBlk: number; college3PM: number;
    collegeTov: number; collegeFtPct: number; college3Pct: number;
    collegeFgPct: number;
    nbaPts: number; nbaReb: number; nbaAst: number;
    nbaStl: number; nbaBlk: number; nba3PM: number;
    nbaTov: number; nbaFtPct: number; nbaFgPct: number;
  }

  const pairs: PlayerPair[] = [];

  for (const r of college) {
    const cPath = path.join(collegeDir, `${r.slug}.json`);
    const nPath = path.join(nbaDir, `${r.slug}.json`);
    if (!fs.existsSync(cPath) || !fs.existsSync(nPath)) continue;

    const cData = JSON.parse(fs.readFileSync(cPath, 'utf-8'));
    const nData = JSON.parse(fs.readFileSync(nPath, 'utf-8'));

    const realSeasons = cData.seasons.filter((s: any) =>
      !s.season.includes('Career') && s.season.match(/^\d{4}-\d{2}$/)
    );
    if (realSeasons.length === 0) continue;
    const last = realSeasons[realSeasons.length - 1];

    pairs.push({
      name: r.name,
      pick: r.pick,
      collegePts: last.pts, collegeReb: last.reb, collegeAst: last.ast,
      collegeStl: last.stl, collegeBlk: last.blk, college3PM: last.threePM,
      collegeTov: last.tov, collegeFtPct: last.ftPct, college3Pct: last.threePtPct,
      collegeFgPct: last.fgPct,
      nbaPts: nData.first4Avg.pts, nbaReb: nData.first4Avg.reb, nbaAst: nData.first4Avg.ast,
      nbaStl: nData.first4Avg.stl, nbaBlk: nData.first4Avg.blk, nba3PM: nData.first4Avg.threePM,
      nbaTov: nData.first4Avg.tov, nbaFtPct: nData.first4Avg.ftPct, nbaFgPct: nData.first4Avg.fgPct,
    });
  }

  console.log(`  Matched ${pairs.length} college→NBA player pairs\n`);

  const statComparisons = [
    { label: 'Points', cKey: 'collegePts', nKey: 'nbaPts' },
    { label: 'Rebounds', cKey: 'collegeReb', nKey: 'nbaReb' },
    { label: 'Assists', cKey: 'collegeAst', nKey: 'nbaAst' },
    { label: 'Steals', cKey: 'collegeStl', nKey: 'nbaStl' },
    { label: 'Blocks', cKey: 'collegeBlk', nKey: 'nbaBlk' },
    { label: '3PM', cKey: 'college3PM', nKey: 'nba3PM' },
    { label: 'Turnovers', cKey: 'collegeTov', nKey: 'nbaTov' },
    { label: 'FT%', cKey: 'collegeFtPct', nKey: 'nbaFtPct' },
    { label: 'FG%', cKey: 'collegeFgPct', nKey: 'nbaFgPct' },
  ];

  console.log('  Stat         College Avg → NBA Avg    Change    Correlation  Stickiness');
  console.log('  ───────────  ─────────────────────  ────────  ───────────  ──────────');

  for (const { label, cKey, nKey } of statComparisons) {
    const cVals = pairs.map((p) => (p as any)[cKey] as number);
    const nVals = pairs.map((p) => (p as any)[nKey] as number);

    const cAvg = cVals.reduce((s, v) => s + v, 0) / cVals.length;
    const nAvg = nVals.reduce((s, v) => s + v, 0) / nVals.length;
    const r = correlation(cVals, nVals);

    const changes = cVals.map((c, i) => nVals[i] - c);
    const pctUp = changes.filter((c) => c > 0).length / changes.length * 100;

    // "Stickiness" — what % of variance in NBA stat is explained by college stat
    const r2 = r * r;
    let stickiness: string;
    if (r2 > 0.4) stickiness = 'HIGH';
    else if (r2 > 0.2) stickiness = 'MODERATE';
    else if (r2 > 0.1) stickiness = 'LOW';
    else stickiness = 'WEAK';

    const isPct = label.includes('%');
    const fmt = isPct ? (v: number) => (v * 100).toFixed(1) + '%' : (v: number) => v.toFixed(1);
    const changeFmt = isPct
      ? ((nAvg - cAvg) * 100).toFixed(1) + '%'
      : (nAvg - cAvg > 0 ? '+' : '') + (nAvg - cAvg).toFixed(1);

    console.log(
      `  ${label.padEnd(13)}${fmt(cAvg).padStart(7)} → ${fmt(nAvg).padStart(7)}  ${changeFmt.padStart(8)}  ` +
      `r=${r.toFixed(3).padStart(6)}    ${stickiness}`
    );
  }

  // ─── Detailed FT% analysis (the user specifically asked about this) ───
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  FT% DEEP DIVE — The Best Shooting Predictor?');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const ftPairs = pairs.filter((p) => p.collegeFtPct > 0 && p.nbaFtPct > 0);
  const ft3Pairs = pairs.filter((p) => p.college3Pct > 0 && p.nbaFtPct > 0);

  // College FT% → NBA FT%
  const ftCorr = correlation(ftPairs.map((p) => p.collegeFtPct), ftPairs.map((p) => p.nbaFtPct));
  // College 3PT% → NBA 3PT% (approximated via FG% since we don't have NBA 3PT% separately)
  // College FT% → NBA FG% (does FT% predict overall efficiency?)
  const ftToFg = correlation(ftPairs.map((p) => p.collegeFtPct), ftPairs.map((p) => p.nbaFgPct));
  // College 3PT% → NBA FG%
  const threePctToFg = correlation(ft3Pairs.map((p) => p.college3Pct), ft3Pairs.map((p) => p.nbaFgPct));

  console.log(`  College FT%  → NBA FT%:  r = ${ftCorr.toFixed(3)}  (R² = ${(ftCorr**2).toFixed(3)})`);
  console.log(`  College FT%  → NBA FG%:  r = ${ftToFg.toFixed(3)}  (R² = ${(ftToFg**2).toFixed(3)})`);
  console.log(`  College 3PT% → NBA FG%:  r = ${threePctToFg.toFixed(3)}  (R² = ${(threePctToFg**2).toFixed(3)})`);

  // Bucket analysis
  console.log('\n  FT% Buckets — NBA outcomes by college FT%:\n');
  const buckets = [
    { label: 'Elite (80%+)', min: 0.80, max: 1.0 },
    { label: 'Good (72-80%)', min: 0.72, max: 0.80 },
    { label: 'Average (65-72%)', min: 0.65, max: 0.72 },
    { label: 'Poor (<65%)', min: 0, max: 0.65 },
  ];

  console.log('  Bucket            N    NBA PPG   NBA FT%   NBA FG%   Avg Pick');
  console.log('  ────────────────  ───  ────────  ────────  ────────  ────────');
  for (const { label, min, max } of buckets) {
    const bucket = ftPairs.filter((p) => p.collegeFtPct >= min && p.collegeFtPct < max);
    if (bucket.length === 0) continue;
    const avgPts = bucket.reduce((s, p) => s + p.nbaPts, 0) / bucket.length;
    const avgFt = bucket.reduce((s, p) => s + p.nbaFtPct, 0) / bucket.length;
    const avgFg = bucket.reduce((s, p) => s + p.nbaFgPct, 0) / bucket.length;
    const avgPick = bucket.reduce((s, p) => s + p.pick, 0) / bucket.length;
    console.log(
      `  ${label.padEnd(18)}${String(bucket.length).padStart(3)}  ${avgPts.toFixed(1).padStart(8)}  ` +
      `${(avgFt * 100).toFixed(1).padStart(7)}%  ${(avgFg * 100).toFixed(1).padStart(7)}%  ${avgPick.toFixed(1).padStart(8)}`
    );
  }

  // ─── Direction of change analysis ───
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  DO PLAYERS GET BETTER OR WORSE?');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const { label, cKey, nKey } of statComparisons) {
    const cVals = pairs.map((p) => (p as any)[cKey] as number);
    const nVals = pairs.map((p) => (p as any)[nKey] as number);
    const changes = cVals.map((c, i) => nVals[i] - c);
    const pctUp = (changes.filter((c) => c > 0.001).length / changes.length * 100).toFixed(0);
    const pctDown = (changes.filter((c) => c < -0.001).length / changes.length * 100).toFixed(0);
    const pctSame = (100 - parseFloat(pctUp) - parseFloat(pctDown)).toFixed(0);
    const median = percentile(changes, 50);
    const isPct = label.includes('%');
    const medFmt = isPct ? (median * 100).toFixed(1) + '%' : median.toFixed(2);

    console.log(`  ${label.padEnd(12)} ↑${pctUp.padStart(3)}%  ↓${pctDown.padStart(3)}%  =${pctSame.padStart(3)}%   median change: ${medFmt}`);
  }

  // ─── Late-round productive players ───
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  LATE-ROUND GEMS (Pick 25+ with 10+ PPG in NBA)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const lateGems = pairs
    .filter((p) => p.pick >= 25 && p.nbaPts >= 10)
    .sort((a, b) => b.nbaPts - a.nbaPts);

  console.log(`  Found ${lateGems.length} late-round producers\n`);
  console.log('  Name                        Pick  Col PPG → NBA PPG  Col FT%  Col STL');
  console.log('  ──────────────────────────  ────  ──────────────────  ───────  ───────');
  for (const p of lateGems.slice(0, 20)) {
    console.log(
      `  ${p.name.padEnd(28)}${String(p.pick).padStart(4)}  ${p.collegePts.toFixed(1).padStart(7)} → ${p.nbaPts.toFixed(1).padStart(6)}  ` +
      `${(p.collegeFtPct * 100).toFixed(0).padStart(6)}%  ${p.collegeStl.toFixed(1).padStart(7)}`
    );
  }

  // Common traits of late gems
  if (lateGems.length > 5) {
    console.log('\n  Common traits of late-round gems vs other late picks:');
    const lateAll = pairs.filter((p) => p.pick >= 25);
    const lateAvg = {
      pts: lateAll.reduce((s, p) => s + p.collegePts, 0) / lateAll.length,
      ft: lateAll.reduce((s, p) => s + p.collegeFtPct, 0) / lateAll.length,
      stl: lateAll.reduce((s, p) => s + p.collegeStl, 0) / lateAll.length,
      blk: lateAll.reduce((s, p) => s + p.collegeBlk, 0) / lateAll.length,
      ast: lateAll.reduce((s, p) => s + p.collegeAst, 0) / lateAll.length,
    };
    const gemAvg = {
      pts: lateGems.reduce((s, p) => s + p.collegePts, 0) / lateGems.length,
      ft: lateGems.reduce((s, p) => s + p.collegeFtPct, 0) / lateGems.length,
      stl: lateGems.reduce((s, p) => s + p.collegeStl, 0) / lateGems.length,
      blk: lateGems.reduce((s, p) => s + p.collegeBlk, 0) / lateGems.length,
      ast: lateGems.reduce((s, p) => s + p.collegeAst, 0) / lateGems.length,
    };

    console.log(`\n  Trait           Late Gems    All Late Picks    Difference`);
    console.log(`  ─────────────  ──────────   ──────────────    ──────────`);
    console.log(`  College PPG    ${gemAvg.pts.toFixed(1).padStart(8)}   ${lateAvg.pts.toFixed(1).padStart(12)}    ${(gemAvg.pts - lateAvg.pts > 0 ? '+' : '')}${(gemAvg.pts - lateAvg.pts).toFixed(1)}`);
    console.log(`  College FT%    ${(gemAvg.ft * 100).toFixed(1).padStart(7)}%   ${(lateAvg.ft * 100).toFixed(1).padStart(11)}%    ${(gemAvg.ft - lateAvg.ft > 0 ? '+' : '')}${((gemAvg.ft - lateAvg.ft) * 100).toFixed(1)}%`);
    console.log(`  College STL    ${gemAvg.stl.toFixed(2).padStart(8)}   ${lateAvg.stl.toFixed(2).padStart(12)}    ${(gemAvg.stl - lateAvg.stl > 0 ? '+' : '')}${(gemAvg.stl - lateAvg.stl).toFixed(2)}`);
    console.log(`  College BLK    ${gemAvg.blk.toFixed(2).padStart(8)}   ${lateAvg.blk.toFixed(2).padStart(12)}    ${(gemAvg.blk - lateAvg.blk > 0 ? '+' : '')}${(gemAvg.blk - lateAvg.blk).toFixed(2)}`);
    console.log(`  College AST    ${gemAvg.ast.toFixed(2).padStart(8)}   ${lateAvg.ast.toFixed(2).padStart(12)}    ${(gemAvg.ast - lateAvg.ast > 0 ? '+' : '')}${(gemAvg.ast - lateAvg.ast).toFixed(2)}`);
  }
}

main();
