/**
 * Script 7: Predict Upcoming Draft Class
 * Input: data/model.json + data/raw/college/ + data/raw/combine/
 * Output: data/predictions/{year}-class.json
 *
 * For prospects without NBA data yet, predicts their projected NBA stats
 * using the trained model and their college profile.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODEL_PATH = path.join(DATA_DIR, 'model.json');
const PREDICTIONS_DIR = path.join(DATA_DIR, 'predictions');

// ── Types ──

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

interface ProspectPrediction {
  id: string;
  name: string;
  school: string;
  position: string;
  draftYear: number;
  projectedPick: number;
  age: number;
  features: Record<string, number>;
  projected: Record<string, number>;
  fantasyScore: number;
  tier: string;
  percentiles: Record<string, number>;
  historicalComps: Array<{
    name: string;
    draftYear: number;
    similarity: number;
    actual: Record<string, number>;
    fantasyScore: number;
  }>;
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

const FANTASY_WEIGHTS = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1 };

const CONFERENCE_TIERS: Record<string, number> = {
  'ACC': 1.0, 'Big 12': 1.0, 'Big East': 1.0, 'Big Ten': 1.0, 'SEC': 1.0,
  'AAC': 1.0, 'Pac-12': 1.0, 'Pac-10': 1.0, 'MWC': 0.85, 'WCC': 0.85,
  'A-10': 0.85, 'Atlantic 10': 0.85, 'MVC': 0.85, 'C-USA': 0.85,
  'CAA': 0.85, 'Mountain West': 0.85,
};

function getConferenceTier(conference: string): number {
  if (CONFERENCE_TIERS[conference] !== undefined) return CONFERENCE_TIERS[conference];
  for (const [key, value] of Object.entries(CONFERENCE_TIERS)) {
    if (conference.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return 0.70;
}

function clampStat(stat: string, value: number): number {
  const ranges: Record<string, [number, number]> = {
    pts: [0, 35], reb: [0, 15], ast: [0, 12], stl: [0, 3], blk: [0, 4],
    threePM: [0, 5], fgPct: [0.30, 0.65], ftPct: [0.40, 0.95], tov: [0, 5],
  };
  const [min, max] = ranges[stat] || [0, 100];
  return Math.max(min, Math.min(max, value));
}

function predict(model: TrainedModel, features: number[]): Record<string, number> {
  const normalized = features.map((val, j) => (val - model.featureMeans[j]) / model.featureStds[j]);
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

function calculateFantasyScore(stats: Record<string, number>): number {
  return (stats.pts || 0) * FANTASY_WEIGHTS.pts +
    (stats.reb || 0) * FANTASY_WEIGHTS.reb +
    (stats.ast || 0) * FANTASY_WEIGHTS.ast +
    (stats.stl || 0) * FANTASY_WEIGHTS.stl +
    (stats.blk || 0) * FANTASY_WEIGHTS.blk +
    (stats.tov || 0) * FANTASY_WEIGHTS.tov;
}

function getTier(score: number): string {
  if (score >= 35) return 'Elite';
  if (score >= 25) return 'Starter';
  if (score >= 15) return 'Rotation';
  return 'Bench';
}

function featureDistance(a: number[], b: number[], means: number[], stds: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const na = (a[i] - means[i]) / stds[i];
    const nb = (b[i] - means[i]) / stds[i];
    sum += (na - nb) ** 2;
  }
  return Math.sqrt(sum);
}

function main() {
  const year = parseInt(process.argv[2] || '2025');

  console.log(`Predicting ${year} draft class...`);

  // Load model
  if (!fs.existsSync(MODEL_PATH)) {
    console.error('Model not found. Run script 6 first.');
    process.exit(1);
  }
  const model: TrainedModel = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8'));

  // Load dataset for historical comps and percentile calculations
  const datasetPath = path.join(DATA_DIR, 'dataset.json');
  const dataset: TrainingRecord[] = fs.existsSync(datasetPath)
    ? JSON.parse(fs.readFileSync(datasetPath, 'utf-8'))
    : [];

  // Load draft entries for the target year
  const draftPath = path.join(DATA_DIR, 'raw', 'drafts', `${year}.json`);
  if (!fs.existsSync(draftPath)) {
    console.error(`No draft data for ${year}. Run script 1 first.`);
    process.exit(1);
  }

  const draftEntries: Array<{ year: number; pick: number; name: string; team: string; college: string; slug: string }> =
    JSON.parse(fs.readFileSync(draftPath, 'utf-8'));

  // Load college data for these prospects
  const collegeDir = path.join(DATA_DIR, 'raw', 'college');

  // Load team stats for real production share
  const teamsDir = path.join(DATA_DIR, 'raw', 'teams');
  const teamStatsMap = new Map<string, { ptsPerGame: number; rebPerGame: number; astPerGame: number }>();
  if (fs.existsSync(teamsDir)) {
    for (const file of fs.readdirSync(teamsDir).filter((f: string) => f.endsWith('.json'))) {
      const ts = JSON.parse(fs.readFileSync(path.join(teamsDir, file), 'utf-8'));
      teamStatsMap.set(`${ts.school}|${ts.season}`, ts);
    }
  }

  // Load combine data
  const combineDir = path.join(DATA_DIR, 'raw', 'combine');
  const combineMap = new Map<string, any>();
  if (fs.existsSync(combineDir)) {
    for (const file of fs.readdirSync(combineDir).filter((f: string) => f.endsWith('.json'))) {
      const entries = JSON.parse(fs.readFileSync(path.join(combineDir, file), 'utf-8'));
      for (const e of entries) {
        if (e.name) combineMap.set(e.name.toLowerCase().trim(), e);
      }
    }
  }

  // Load international data
  const intlDir = path.join(DATA_DIR, 'raw', 'international');
  const intlMap = new Map<string, any>();
  if (fs.existsSync(intlDir)) {
    for (const file of fs.readdirSync(intlDir).filter((f: string) => f.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(intlDir, file), 'utf-8'));
      intlMap.set(data.slug, data);
    }
  }

  // Load NBA data for birth dates
  const nbaDir = path.join(DATA_DIR, 'raw', 'nba');
  const nbaMap = new Map<string, any>();
  if (fs.existsSync(nbaDir)) {
    for (const file of fs.readdirSync(nbaDir).filter((f: string) => f.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(nbaDir, file), 'utf-8'));
      nbaMap.set(data.slug, data);
    }
  }

  function calculateAge(birthDate: string | null, draftYear: number): number | null {
    if (!birthDate) return null;
    const draftDate = new Date(draftYear, 5, 25);
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    return (draftDate.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  }

  const COMBINE_DEFAULTS: Record<string, number> = {
    heightNoShoes: 79, weight: 215, wingspan: 84, standingReach: 104,
    handLength: 8.75, handWidth: 9.25,
    laneAgility: 11.2, shuttleRun: 3.05, sprint: 3.28,
    standingVertical: 29, maxVertical: 34, benchPress: 10,
  };

  function normalizeName(name: string): string {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').trim();
  }

  function findCombine(name: string): any {
    const key = name.toLowerCase().trim();
    if (combineMap.has(key)) return combineMap.get(key);
    const normalized = normalizeName(name);
    for (const [k, v] of combineMap) {
      if (normalizeName(k) === normalized) return v;
    }
    return null;
  }

  // Collect all historical actual stat lines for percentile calc
  const allActuals = dataset.map((r) => r.target);

  const predictions: ProspectPrediction[] = [];

  for (const entry of draftEntries) {
    const collegePath = path.join(collegeDir, `${entry.slug}.json`);
    const hasCollege = fs.existsSync(collegePath);
    const intl = intlMap.get(entry.slug);
    const nba = nbaMap.get(entry.slug);

    if (!hasCollege && (!intl || intl.totalPreDraftGames === 0)) {
      console.log(`  Skipping ${entry.name} (no pre-draft stats)`);
      continue;
    }

    const combineData = findCombine(entry.name);
    const birthDate = nba?.birthDate || null;
    const realAge = calculateAge(birthDate, year);
    let features: Record<string, number>;
    let school = entry.college;
    let isIntl = false;

    if (hasCollege) {
      const college = JSON.parse(fs.readFileSync(collegePath, 'utf-8'));
      if (!college.seasons || college.seasons.length === 0) {
        console.log(`  Skipping ${entry.name} (no seasons)`);
        continue;
      }

      const realSeasons = college.seasons.filter((s: { season: string }) =>
        !s.season.includes('Career') && s.season.match(/^\d{4}-\d{2}$/)
      );
      const lastSeason = realSeasons[realSeasons.length - 1] || college.seasons[college.seasons.length - 1];
      const prevSeason = realSeasons.length > 1 ? realSeasons[realSeasons.length - 2] : null;
      const mpg = lastSeason.minutesPerGame ?? 30;
      const per40Factor = mpg > 0 ? 40 / mpg : 1;

      const teamKey = `${lastSeason.school}|${lastSeason.season}`;
      const teamStats = teamStatsMap.get(teamKey);
      const teamPTS = teamStats?.ptsPerGame || college.teamPTS || lastSeason.pts * 5;
      const teamREB = teamStats?.rebPerGame || college.teamREB || lastSeason.reb * 5;
      const teamAST = teamStats?.astPerGame || college.teamAST || lastSeason.ast * 5;

      let ptsTrajectory = 0;
      let usageTrajectory = 0;
      if (prevSeason && prevSeason.pts > 0) {
        ptsTrajectory = (lastSeason.pts - prevSeason.pts) / prevSeason.pts;
      }
      if (prevSeason?.usageRate && lastSeason.usageRate && prevSeason.usageRate > 0) {
        usageTrajectory = (lastSeason.usageRate - prevSeason.usageRate) / prevSeason.usageRate;
      }

      school = college.school || entry.college;
      features = {
        ageAtDraft: realAge || (18 + Math.min(college.seasons.length, 4)),
        classYear: Math.min(college.seasons.length, 4),
        pointsShare: teamPTS > 0 ? lastSeason.pts / teamPTS : 0.2,
        reboundsShare: teamREB > 0 ? lastSeason.reb / teamREB : 0.15,
        assistsShare: teamAST > 0 ? lastSeason.ast / teamAST : 0.15,
        usageRate: lastSeason.usageRate ?? 20,
        ptsPer40: lastSeason.pts * per40Factor,
        rebPer40: lastSeason.reb * per40Factor,
        astPer40: lastSeason.ast * per40Factor,
        stlPer40: lastSeason.stl * per40Factor,
        blkPer40: lastSeason.blk * per40Factor,
        threePer40: lastSeason.threePM * per40Factor,
        tovPer40: lastSeason.tov * per40Factor,
        ftaPer40: lastSeason.fta * per40Factor,
        trueShootingPct: lastSeason.trueShootingPct ?? lastSeason.fgPct ?? 0.50,
        freeThrowPct: lastSeason.ftPct ?? 0.70,
        threePtPct: lastSeason.threePtPct ?? 0.33,
        assistToTurnover: lastSeason.tov > 0 ? lastSeason.ast / lastSeason.tov : lastSeason.ast || 1,
        heightInches: combineData?.heightNoShoes || COMBINE_DEFAULTS.heightNoShoes,
        weightLbs: combineData?.weight || COMBINE_DEFAULTS.weight,
        wingspanInches: combineData?.wingspan || COMBINE_DEFAULTS.wingspan,
        standingReachInches: combineData?.standingReach || COMBINE_DEFAULTS.standingReach,
        handLength: combineData?.handLength || COMBINE_DEFAULTS.handLength,
        handWidth: combineData?.handWidth || COMBINE_DEFAULTS.handWidth,
        laneAgility: combineData?.laneAgility || COMBINE_DEFAULTS.laneAgility,
        shuttleRun: combineData?.shuttleRun || COMBINE_DEFAULTS.shuttleRun,
        sprint: combineData?.sprint || COMBINE_DEFAULTS.sprint,
        standingVertical: combineData?.standingVertical || COMBINE_DEFAULTS.standingVertical,
        maxVertical: combineData?.maxVertical || COMBINE_DEFAULTS.maxVertical,
        benchPress: combineData?.benchPress || COMBINE_DEFAULTS.benchPress,
        conferenceTier: getConferenceTier(lastSeason.conference || college.conference || ''),
        gamesPlayed: lastSeason.gamesPlayed,
        minutesPerGame: mpg,
        draftPosition: entry.pick,
        ptsTrajectory,
        usageTrajectory,
        boxPlusMinus: lastSeason.boxPlusMinus ?? 0,
        winSharesPer40: lastSeason.winSharesPer40 ?? 0,
      };
    } else {
      // International player
      isIntl = true;
      school = 'International';
      const avg = intl.preDraftAvg;
      const seasons = intl.seasons;
      const lastSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;
      const prevSeason = seasons.length > 1 ? seasons[seasons.length - 2] : null;
      const mpg = lastSeason?.minutesPerGame || 20;
      const per40Factor = mpg > 0 ? 40 / mpg : 1;
      const statSource = lastSeason || avg;

      let ptsTrajectory = 0;
      if (prevSeason && lastSeason && prevSeason.pts > 0) {
        ptsTrajectory = (lastSeason.pts - prevSeason.pts) / prevSeason.pts;
      }

      features = {
        ageAtDraft: realAge || 20,
        classYear: 0,
        pointsShare: 0,
        reboundsShare: 0,
        assistsShare: 0,
        usageRate: 20,
        ptsPer40: statSource.pts * per40Factor,
        rebPer40: statSource.reb * per40Factor,
        astPer40: statSource.ast * per40Factor,
        stlPer40: statSource.stl * per40Factor,
        blkPer40: statSource.blk * per40Factor,
        threePer40: (statSource.threePM || 0) * per40Factor,
        tovPer40: statSource.tov * per40Factor,
        ftaPer40: (statSource.fta ?? 0) * per40Factor,
        trueShootingPct: avg.fgPct ?? 0.50,
        freeThrowPct: avg.ftPct ?? 0.70,
        threePtPct: avg.threePtPct ?? 0.33,
        assistToTurnover: avg.tov > 0 ? avg.ast / avg.tov : avg.ast || 1,
        heightInches: combineData?.heightNoShoes || COMBINE_DEFAULTS.heightNoShoes,
        weightLbs: combineData?.weight || COMBINE_DEFAULTS.weight,
        wingspanInches: combineData?.wingspan || COMBINE_DEFAULTS.wingspan,
        standingReachInches: combineData?.standingReach || COMBINE_DEFAULTS.standingReach,
        handLength: combineData?.handLength || COMBINE_DEFAULTS.handLength,
        handWidth: combineData?.handWidth || COMBINE_DEFAULTS.handWidth,
        laneAgility: combineData?.laneAgility || COMBINE_DEFAULTS.laneAgility,
        shuttleRun: combineData?.shuttleRun || COMBINE_DEFAULTS.shuttleRun,
        sprint: combineData?.sprint || COMBINE_DEFAULTS.sprint,
        standingVertical: combineData?.standingVertical || COMBINE_DEFAULTS.standingVertical,
        maxVertical: combineData?.maxVertical || COMBINE_DEFAULTS.maxVertical,
        benchPress: combineData?.benchPress || COMBINE_DEFAULTS.benchPress,
        conferenceTier: 0.5,
        gamesPlayed: lastSeason?.gamesPlayed || intl.totalPreDraftGames,
        minutesPerGame: mpg,
        draftPosition: entry.pick,
        ptsTrajectory,
        usageTrajectory: 0,
        boxPlusMinus: 0,
        winSharesPer40: 0,
      };
    }

    const featureArray = FEATURE_KEYS.map((k) => features[k] ?? 0);
    const projected = predict(model, featureArray);
    const fantasyScore = calculateFantasyScore(projected);

    // Calculate percentiles against historical actuals
    const percentiles: Record<string, number> = {};
    for (const stat of STAT_KEYS) {
      const values = allActuals.map((a) => a[stat] ?? 0).sort((a, b) => a - b);
      if (stat === 'tov') {
        const rank = values.filter((v) => v >= projected[stat]).length;
        percentiles[stat] = Math.round((rank / Math.max(values.length, 1)) * 100);
      } else {
        const rank = values.filter((v) => v <= projected[stat]).length;
        percentiles[stat] = Math.round((rank / Math.max(values.length, 1)) * 100);
      }
    }

    // Find historical comps (most similar feature vectors in dataset)
    // Exclude the prospect themselves (they may appear in the dataset if already drafted)
    const comps = dataset
      .filter((r) => r.slug !== entry.slug && r.name !== entry.name)
      .map((r) => {
        const rFeatures = FEATURE_KEYS.map((k) => r.features[k] ?? 0);
        const dist = featureDistance(featureArray, rFeatures, model.featureMeans, model.featureStds);
        return {
          name: r.name,
          draftYear: r.draftYear,
          similarity: 1 / (1 + dist),
          actual: r.target,
          fantasyScore: calculateFantasyScore(r.target),
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    const id = entry.slug || entry.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    predictions.push({
      id,
      name: entry.name,
      school,
      position: combineData?.position || '',
      draftYear: year,
      projectedPick: entry.pick,
      age: features.ageAtDraft,
      features,
      projected,
      fantasyScore,
      tier: getTier(fantasyScore),
      percentiles,
      historicalComps: comps,
    });
  }

  // Sort by fantasy score
  predictions.sort((a, b) => b.fantasyScore - a.fantasyScore);

  // Add rank
  predictions.forEach((p, i) => {
    (p as ProspectPrediction & { rank: number }).rank = i + 1;
  });

  // Save
  fs.mkdirSync(PREDICTIONS_DIR, { recursive: true });
  const outPath = path.join(PREDICTIONS_DIR, `${year}-class.json`);
  fs.writeFileSync(outPath, JSON.stringify(predictions, null, 2));

  // Print summary
  console.log(`\n${year} Draft Class Fantasy Rankings:\n`);
  console.log('Rank  Name                        School              Fantasy  Tier');
  console.log('----  --------------------------  ------------------  -------  --------');
  for (let i = 0; i < Math.min(predictions.length, 30); i++) {
    const p = predictions[i];
    console.log(
      `${String(i + 1).padStart(4)}  ${p.name.padEnd(28)}${p.school.padEnd(20)}${p.fantasyScore.toFixed(1).padStart(7)}  ${p.tier}`
    );
  }

  console.log(`\nSaved ${predictions.length} predictions to ${outPath}`);
}

main();
