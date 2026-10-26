// ── Raw scraped data types ──

export interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string; // Basketball-Reference player URL slug
}

export interface CollegeStats {
  slug: string;
  name: string;
  school: string;
  conference: string;
  classYear: number; // 1=FR, 2=SO, 3=JR, 4=SR
  seasons: CollegeSeason[];
  // Team totals for production share (final season)
  teamPTS?: number;
  teamREB?: number;
  teamAST?: number;
}

export interface CollegeSeason {
  season: string; // e.g. "2023-24"
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgPct: number;
  threePtPct: number;
  ftPct: number;
  threePM: number;
  fta: number;
  // Advanced
  usageRate?: number;
  trueShootingPct?: number;
  boxPlusMinus?: number;
  winSharesPer40?: number;
}

export interface NBACareerStats {
  slug: string;
  name: string;
  seasons: NBASeason[];
  // First 4 season averages (target variable)
  first4Avg: NBAStatLine;
  totalGames: number;
}

export interface NBASeason {
  season: string;
  team: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  threePM: number;
  fgPct: number;
  ftPct: number;
  tov: number;
}

export interface NBAStatLine {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  threePM: number;
  fgPct: number;
  ftPct: number;
  tov: number;
}

export interface CombineData {
  name: string;
  year: number;
  heightNoShoes?: number; // inches
  weight?: number; // lbs
  wingspan?: number; // inches
  standingReach?: number; // inches
  handLength?: number; // inches
  handWidth?: number; // inches
  laneAgility?: number; // seconds
  shuttleRun?: number; // seconds
  sprint?: number; // seconds
  standingVertical?: number; // inches
  maxVertical?: number; // inches
  benchPress?: number; // reps
}

// ── Processed training data ──

export interface FeatureVector {
  // Age
  ageAtDraft: number;
  classYear: number;
  // Production share
  pointsShare: number;
  reboundsShare: number;
  assistsShare: number;
  usageRate: number;
  // Per-40 stats
  ptsPer40: number;
  rebPer40: number;
  astPer40: number;
  stlPer40: number;
  blkPer40: number;
  threePer40: number;
  tovPer40: number;
  ftaPer40: number;
  // Efficiency
  trueShootingPct: number;
  freeThrowPct: number;
  threePtPct: number;
  assistToTurnover: number;
  // Physical
  heightInches: number;
  weightLbs: number;
  wingspanInches: number;
  standingReachInches: number;
  handLength: number;
  handWidth: number;
  // Athletic testing
  laneAgility: number;
  shuttleRun: number;
  sprint: number;
  standingVertical: number;
  maxVertical: number;
  benchPress: number;
  // Context
  conferenceTier: number;
  gamesPlayed: number;
  minutesPerGame: number;
  draftPosition: number;
  // Trajectory
  ptsTrajectory: number;
  usageTrajectory: number;
  // Advanced
  boxPlusMinus: number;
  winSharesPer40: number;
}

export interface TrainingRecord {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
  features: FeatureVector;
  target: NBAStatLine;
  totalNBAGames: number;
}

export interface DatasetStats {
  totalRecords: number;
  byYear: Record<number, number>;
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
}

// ── Model types ──

export interface StatModel {
  weights: number[];
  bias: number;
  r2: number;
  mae: number;
  lambda: number;
}

export interface TrainedModel {
  statModels: Record<string, StatModel>;
  featureNames: string[];
  featureMeans: number[];
  featureStds: number[];
  trainedAt: string;
  sampleCount: number;
  crossValidation: CrossValidationResult;
}

export interface CrossValidationResult {
  folds: number;
  statResults: Record<string, { meanMAE: number; meanR2: number }>;
}

// ── Prediction / scoring types ──

export interface ProspectPrediction {
  id: string; // slug or generated id
  name: string;
  school: string;
  position: string;
  draftYear: number;
  projectedPick?: number;
  age: number;
  features: FeatureVector;
  projected: NBAStatLine;
  fantasyScore: number;
  tier: ProspectTier;
  percentiles: NBAStatLine; // percentile rank for each stat (0-100)
  historicalComps: HistoricalComp[];
}

export type ProspectTier = 'Elite' | 'Starter' | 'Rotation' | 'Bench';

export interface HistoricalComp {
  name: string;
  draftYear: number;
  similarity: number; // 0-1
  actual: NBAStatLine;
  fantasyScore: number;
}

export interface PredictionAccuracy {
  draftYear: number;
  predictions: Array<{
    name: string;
    predicted: NBAStatLine;
    actual: NBAStatLine;
    predictedFantasy: number;
    actualFantasy: number;
  }>;
  overallMAE: Record<string, number>;
  overallR2: Record<string, number>;
}

// ── Constants ──

export const STAT_KEYS: (keyof NBAStatLine)[] = [
  'pts', 'reb', 'ast', 'stl', 'blk', 'threePM', 'fgPct', 'ftPct', 'tov',
];

export const FEATURE_KEYS: (keyof FeatureVector)[] = [
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
