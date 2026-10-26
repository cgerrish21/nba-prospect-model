import {
  CollegeStats,
  CombineData,
  DraftEntry,
  FeatureVector,
  FEATURE_KEYS,
} from './types';
import { getConferenceTier, DEFAULT_COMBINE } from './constants';

/**
 * Extract feature vector from raw data sources
 */
export function extractFeatures(
  draft: DraftEntry,
  college: CollegeStats,
  combine: CombineData | null,
  birthDate?: string,
): FeatureVector {
  const lastSeason = college.seasons[college.seasons.length - 1];
  const prevSeason = college.seasons.length > 1 ? college.seasons[college.seasons.length - 2] : null;

  if (!lastSeason) {
    throw new Error(`No college season data for ${draft.name}`);
  }

  const mpg = lastSeason.minutesPerGame ?? 30;
  const per40Factor = 40 / mpg;

  // Age at draft (June 25 of draft year)
  let ageAtDraft = 19 + (college.classYear - 1); // rough estimate
  if (birthDate) {
    const birth = new Date(birthDate);
    const draftDate = new Date(draft.year, 5, 25); // June 25
    ageAtDraft = (draftDate.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  }

  // Production share
  const teamPTS = college.teamPTS || lastSeason.pts * 5; // rough estimate if missing
  const teamREB = college.teamREB || lastSeason.reb * 5;
  const teamAST = college.teamAST || lastSeason.ast * 5;

  const pointsShare = teamPTS > 0 ? lastSeason.pts / teamPTS : 0;
  const reboundsShare = teamREB > 0 ? lastSeason.reb / teamREB : 0;
  const assistsShare = teamAST > 0 ? lastSeason.ast / teamAST : 0;

  // Per-40 stats
  const ptsPer40 = lastSeason.pts * per40Factor;
  const rebPer40 = lastSeason.reb * per40Factor;
  const astPer40 = lastSeason.ast * per40Factor;
  const stlPer40 = lastSeason.stl * per40Factor;
  const blkPer40 = lastSeason.blk * per40Factor;
  const threePer40 = lastSeason.threePM * per40Factor;
  const tovPer40 = lastSeason.tov * per40Factor;
  const ftaPer40 = lastSeason.fta * per40Factor;

  // Efficiency
  const assistToTurnover = lastSeason.tov > 0 ? lastSeason.ast / lastSeason.tov : Math.min(lastSeason.ast, 10);

  // Trajectory (year-over-year improvement)
  let ptsTrajectory = 0;
  let usageTrajectory = 0;
  if (prevSeason) {
    ptsTrajectory = prevSeason.pts > 0 ? (lastSeason.pts - prevSeason.pts) / prevSeason.pts : 0;
    if (prevSeason.usageRate && lastSeason.usageRate) {
      usageTrajectory = (lastSeason.usageRate - prevSeason.usageRate) / prevSeason.usageRate;
    }
  }

  // Combine data (fallback to position averages)
  const combineDefaults = DEFAULT_COMBINE;
  const heightInches = combine?.heightNoShoes ?? combineDefaults.heightInches;
  const weightLbs = combine?.weight ?? combineDefaults.weightLbs;
  const wingspanInches = combine?.wingspan ?? combineDefaults.wingspanInches;
  const standingReachInches = combine?.standingReach ?? combineDefaults.standingReachInches;
  const handLength = combine?.handLength ?? combineDefaults.handLength;
  const handWidth = combine?.handWidth ?? combineDefaults.handWidth;
  const laneAgility = combine?.laneAgility ?? combineDefaults.laneAgility;
  const shuttleRun = combine?.shuttleRun ?? combineDefaults.shuttleRun;
  const sprint = combine?.sprint ?? combineDefaults.sprint;
  const standingVertical = combine?.standingVertical ?? combineDefaults.standingVertical;
  const maxVertical = combine?.maxVertical ?? combineDefaults.maxVertical;
  const benchPress = combine?.benchPress ?? combineDefaults.benchPress;

  return {
    ageAtDraft,
    classYear: college.classYear,
    pointsShare,
    reboundsShare,
    assistsShare,
    usageRate: lastSeason.usageRate ?? 20,
    ptsPer40,
    rebPer40,
    astPer40,
    stlPer40,
    blkPer40,
    threePer40,
    tovPer40,
    ftaPer40,
    trueShootingPct: lastSeason.trueShootingPct ?? lastSeason.fgPct ?? 0.50,
    freeThrowPct: lastSeason.ftPct ?? 0.70,
    threePtPct: lastSeason.threePtPct ?? 0.33,
    assistToTurnover,
    heightInches,
    weightLbs,
    wingspanInches,
    standingReachInches,
    handLength,
    handWidth,
    laneAgility,
    shuttleRun,
    sprint,
    standingVertical,
    maxVertical,
    benchPress,
    conferenceTier: getConferenceTier(college.conference),
    gamesPlayed: lastSeason.gamesPlayed,
    minutesPerGame: mpg,
    draftPosition: draft.pick,
    ptsTrajectory,
    usageTrajectory,
    boxPlusMinus: lastSeason.boxPlusMinus ?? 0,
    winSharesPer40: lastSeason.winSharesPer40 ?? 0,
  };
}

/**
 * Convert FeatureVector to number array in consistent order
 */
export function featureVectorToArray(fv: FeatureVector): number[] {
  return FEATURE_KEYS.map((key) => fv[key]);
}

/**
 * Normalize features using z-score (mean=0, std=1)
 */
export function normalizeFeatures(
  features: number[][],
): { normalized: number[][]; means: number[]; stds: number[] } {
  const numFeatures = features[0].length;
  const means: number[] = new Array(numFeatures).fill(0);
  const stds: number[] = new Array(numFeatures).fill(0);

  // Calculate means
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) {
      means[j] += row[j];
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    means[j] /= features.length;
  }

  // Calculate standard deviations
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) {
      stds[j] += (row[j] - means[j]) ** 2;
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    stds[j] = Math.sqrt(stds[j] / features.length);
    if (stds[j] === 0) stds[j] = 1; // prevent division by zero
  }

  // Normalize
  const normalized = features.map((row) =>
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  return { normalized, means, stds };
}

/**
 * Normalize a single feature vector using pre-computed means/stds
 */
export function normalizeSingle(
  features: number[],
  means: number[],
  stds: number[],
): number[] {
  return features.map((val, j) => (val - means[j]) / stds[j]);
}

/**
 * Compute Euclidean distance between two feature vectors
 */
export function featureDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
