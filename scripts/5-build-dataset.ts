/**
 * Script 5: Build Training Dataset
 * Merges all raw data into data/dataset.json
 * - College players: college stats + team stats + combine + NBA outcomes
 * - International players: international stats + combine + NBA outcomes
 * - Birth dates for accurate age-at-draft
 * - Full combine data (anthropometrics + agility + vertical)
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const OUTPUT_PATH = path.join(DATA_DIR, 'dataset.json');

// ─── Type Definitions ───────────────────────────────────────────────

interface DraftEntry {
  year: number;
  pick: number;
  name: string;
  team: string;
  college: string;
  slug: string;
  age: number | null;
}

interface CollegeSeason {
  season: string;
  school: string;
  conference: string;
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
  usageRate: number | null;
  trueShootingPct: number | null;
  boxPlusMinus: number | null;
  winSharesPer40: number | null;
}

interface CollegePlayerData {
  slug: string;
  name: string;
  school: string;
  conference: string;
  classYear: number;
  seasons: CollegeSeason[];
  teamPTS: number | null;
  teamREB: number | null;
  teamAST: number | null;
}

interface NBAPlayerData {
  slug: string;
  name: string;
  birthDate: string | null;
  seasons: { season: string; team: string; gamesPlayed: number; minutesPerGame: number; pts: number; reb: number; ast: number; stl: number; blk: number; threePM: number; fgPct: number; ftPct: number; tov: number }[];
  first4Avg: { pts: number; reb: number; ast: number; stl: number; blk: number; threePM: number; fgPct: number; ftPct: number; tov: number };
  totalGames: number;
}

interface IntlSeason {
  season: string;
  league: string;
  team: string;
  gamesPlayed: number;
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
}

interface IntlPlayerData {
  slug: string;
  name: string;
  draftYear: number;
  seasons: IntlSeason[];
  preDraftAvg: {
    pts: number; reb: number; ast: number; stl: number; blk: number;
    tov: number; fgPct: number; threePtPct: number; ftPct: number; threePM: number;
  };
  totalPreDraftGames: number;
}

interface CombineEntry {
  name: string;
  position: string;
  year: number;
  heightNoShoes: number | null;
  weight: number | null;
  wingspan: number | null;
  standingReach: number | null;
  handLength: number | null;
  handWidth: number | null;
  bodyFatPct: number | null;
  laneAgility: number | null;
  shuttleRun: number | null;
  sprint: number | null;
  standingVertical: number | null;
  maxVertical: number | null;
  benchPress: number | null;
}

interface TeamStats {
  school: string;
  schoolSlug: string;
  season: string;
  games: number;
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
}

// ─── Feature Vector ─────────────────────────────────────────────────

interface FeatureVector {
  // Demographics
  ageAtDraft: number;
  classYear: number;         // 1=FR, 2=SO, 3=JR, 4=SR for college; 0 for intl
  isInternational: boolean;

  // Production share (college only, 0 for intl)
  pointsShare: number;
  reboundsShare: number;
  assistsShare: number;

  // Per-40 stats (from college or international)
  usageRate: number;
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

  // Combine — anthropometrics
  heightInches: number;
  weightLbs: number;
  wingspanInches: number;
  standingReachInches: number;
  handLength: number;
  handWidth: number;

  // Combine — athleticism
  laneAgility: number;
  shuttleRun: number;
  sprint: number;
  standingVertical: number;
  maxVertical: number;
  benchPress: number;

  // Context
  conferenceTier: number;    // 1.0 for power conf, 0.85 mid, 0.70 low, 0.5 intl
  gamesPlayed: number;
  minutesPerGame: number;
  draftPosition: number;

  // Trajectory (year-over-year improvement)
  ptsTrajectory: number;
  usageTrajectory: number;

  // Advanced (college only)
  boxPlusMinus: number;
  winSharesPer40: number;
}

interface TrainingRecord {
  name: string;
  slug: string;
  draftYear: number;
  pick: number;
  college: string;
  isInternational: boolean;
  features: FeatureVector;
  target: { pts: number; reb: number; ast: number; stl: number; blk: number; threePM: number; fgPct: number; ftPct: number; tov: number };
  totalNBAGames: number;
}

// ─── Conference Tiers ───────────────────────────────────────────────

const CONFERENCE_TIERS: Record<string, number> = {
  'ACC': 1.0, 'Big 12': 1.0, 'Big East': 1.0, 'Big Ten': 1.0, 'SEC': 1.0,
  'AAC': 1.0, 'Pac-12': 1.0, 'Pac-10': 1.0, 'Big 12 Conference': 1.0,
  'MWC': 0.85, 'WCC': 0.85, 'A-10': 0.85, 'Atlantic 10': 0.85,
  'MVC': 0.85, 'C-USA': 0.85, 'CAA': 0.85, 'Mountain West': 0.85,
};

function getConferenceTier(conference: string): number {
  if (CONFERENCE_TIERS[conference] !== undefined) return CONFERENCE_TIERS[conference];
  for (const [key, value] of Object.entries(CONFERENCE_TIERS)) {
    if (conference.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return 0.70;
}

// ─── Position-average defaults for missing combine data ─────────────

const COMBINE_DEFAULTS = {
  heightInches: 79.0,
  weightLbs: 215,
  wingspanInches: 84.0,
  standingReachInches: 104.0,
  handLength: 8.75,
  handWidth: 9.25,
  laneAgility: 11.2,
  shuttleRun: 3.05,
  sprint: 3.28,
  standingVertical: 29.0,
  maxVertical: 34.0,
  benchPress: 10,
};

// ─── Data Loaders ───────────────────────────────────────────────────

function loadDrafts(): DraftEntry[] {
  const dir = path.join(RAW_DIR, 'drafts');
  if (!fs.existsSync(dir)) return [];
  const entries: DraftEntry[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    entries.push(...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
  }
  return entries;
}

function loadCollege(): Map<string, CollegePlayerData> {
  const dir = path.join(RAW_DIR, 'college');
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map<string, CollegePlayerData>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const data: CollegePlayerData = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    map.set(data.slug, data);
  }
  return map;
}

function loadNBA(): Map<string, NBAPlayerData> {
  const dir = path.join(RAW_DIR, 'nba');
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map<string, NBAPlayerData>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const data: NBAPlayerData = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    map.set(data.slug, data);
  }
  return map;
}

function loadIntl(): Map<string, IntlPlayerData> {
  const dir = path.join(RAW_DIR, 'international');
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map<string, IntlPlayerData>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const data: IntlPlayerData = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    map.set(data.slug, data);
  }
  return map;
}

function loadCombine(): Map<string, CombineEntry> {
  const dir = path.join(RAW_DIR, 'combine');
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map<string, CombineEntry>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const entries: CombineEntry[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    for (const entry of entries) {
      map.set(entry.name.toLowerCase().trim(), entry);
    }
  }
  return map;
}

function loadTeamStats(): Map<string, TeamStats> {
  const dir = path.join(RAW_DIR, 'teams');
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map<string, TeamStats>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const data: TeamStats = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    map.set(`${data.school}|${data.season}`, data);
  }
  return map;
}

// ─── Combine Matching ───────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z\s]/g, '')
    .trim();
}

function findCombine(name: string, combineMap: Map<string, CombineEntry>): CombineEntry | null {
  const key = name.toLowerCase().trim();
  if (combineMap.has(key)) return combineMap.get(key)!;

  // Try accent-stripped match
  const normalized = normalizeName(name);
  for (const [k, v] of combineMap) {
    if (normalizeName(k) === normalized) return v;
  }

  // Try last name + first initial match
  const parts = key.split(' ');
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1];
    const firstInitial = parts[0].charAt(0);
    for (const [k, v] of combineMap) {
      const cParts = k.split(' ');
      if (cParts.length >= 2) {
        const cLast = cParts[cParts.length - 1];
        const cFirst = cParts[0].charAt(0);
        if (lastName === cLast && firstInitial === cFirst) return v;
      }
    }
  }

  return null;
}

// ─── Age Calculation ────────────────────────────────────────────────

function calculateAge(birthDate: string | null, draftYear: number): number | null {
  if (!birthDate) return null;
  // Draft night is typically late June
  const draftDate = new Date(draftYear, 5, 25); // June 25
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const ageDiff = draftDate.getTime() - birth.getTime();
  return ageDiff / (365.25 * 24 * 60 * 60 * 1000);
}

// ─── Feature Builders ───────────────────────────────────────────────

function buildCollegeFeatures(
  draft: DraftEntry,
  college: CollegePlayerData,
  nba: NBAPlayerData,
  combine: CombineEntry | null,
  teamStats: TeamStats | null,
): FeatureVector {
  const realSeasons = college.seasons.filter((s) =>
    !s.season.includes('Career') && s.season.match(/^\d{4}-\d{2}$/)
  );
  const lastSeason = realSeasons[realSeasons.length - 1] || college.seasons[college.seasons.length - 1];
  const prevSeason = realSeasons.length > 1 ? realSeasons[realSeasons.length - 2] : null;

  const mpg = lastSeason.minutesPerGame ?? 30;
  const per40Factor = mpg > 0 ? 40 / mpg : 1;

  // Age from birthDate
  const realAge = calculateAge(nba.birthDate, draft.year);
  const ageAtDraft = realAge || (18 + college.classYear);

  // Production share
  const teamPTS = teamStats?.ptsPerGame || college.teamPTS || lastSeason.pts * 5;
  const teamREB = teamStats?.rebPerGame || college.teamREB || lastSeason.reb * 5;
  const teamAST = teamStats?.astPerGame || college.teamAST || lastSeason.ast * 5;

  const pointsShare = teamPTS > 0 ? lastSeason.pts / teamPTS : 0.2;
  const reboundsShare = teamREB > 0 ? lastSeason.reb / teamREB : 0.15;
  const assistsShare = teamAST > 0 ? lastSeason.ast / teamAST : 0.15;

  // Trajectory
  let ptsTrajectory = 0;
  let usageTrajectory = 0;
  if (prevSeason && prevSeason.pts > 0) {
    ptsTrajectory = (lastSeason.pts - prevSeason.pts) / prevSeason.pts;
  }
  if (prevSeason?.usageRate && lastSeason.usageRate && prevSeason.usageRate > 0) {
    usageTrajectory = (lastSeason.usageRate - prevSeason.usageRate) / prevSeason.usageRate;
  }

  return {
    ageAtDraft,
    classYear: college.classYear,
    isInternational: false,
    pointsShare,
    reboundsShare,
    assistsShare,
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
    heightInches: combine?.heightNoShoes || COMBINE_DEFAULTS.heightInches,
    weightLbs: combine?.weight || COMBINE_DEFAULTS.weightLbs,
    wingspanInches: combine?.wingspan || COMBINE_DEFAULTS.wingspanInches,
    standingReachInches: combine?.standingReach || COMBINE_DEFAULTS.standingReachInches,
    handLength: combine?.handLength || COMBINE_DEFAULTS.handLength,
    handWidth: combine?.handWidth || COMBINE_DEFAULTS.handWidth,
    laneAgility: combine?.laneAgility || COMBINE_DEFAULTS.laneAgility,
    shuttleRun: combine?.shuttleRun || COMBINE_DEFAULTS.shuttleRun,
    sprint: combine?.sprint || COMBINE_DEFAULTS.sprint,
    standingVertical: combine?.standingVertical || COMBINE_DEFAULTS.standingVertical,
    maxVertical: combine?.maxVertical || COMBINE_DEFAULTS.maxVertical,
    benchPress: combine?.benchPress || COMBINE_DEFAULTS.benchPress,
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

function buildIntlFeatures(
  draft: DraftEntry,
  intl: IntlPlayerData,
  nba: NBAPlayerData,
  combine: CombineEntry | null,
): FeatureVector {
  const avg = intl.preDraftAvg;
  const seasons = intl.seasons;
  const lastSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;
  const prevSeason = seasons.length > 1 ? seasons[seasons.length - 2] : null;

  const mpg = lastSeason?.minutesPerGame || 20;
  const per40Factor = mpg > 0 ? 40 / mpg : 1;

  // Use last season stats for per-40 if available, else use pre-draft averages
  const statSource = lastSeason || avg;
  const statMpg = lastSeason?.minutesPerGame || 20;
  const statPer40 = statMpg > 0 ? 40 / statMpg : 1;

  // Age from birthDate
  const realAge = calculateAge(nba.birthDate, draft.year);
  const ageAtDraft = realAge || 20;

  // Trajectory
  let ptsTrajectory = 0;
  if (prevSeason && lastSeason && prevSeason.pts > 0) {
    ptsTrajectory = (lastSeason.pts - prevSeason.pts) / prevSeason.pts;
  }

  return {
    ageAtDraft,
    classYear: 0,  // international marker
    isInternational: true,
    pointsShare: 0,  // no team stats for intl
    reboundsShare: 0,
    assistsShare: 0,
    usageRate: 20,  // no usage rate for intl
    ptsPer40: (statSource as any).pts * statPer40,
    rebPer40: (statSource as any).reb * statPer40,
    astPer40: (statSource as any).ast * statPer40,
    stlPer40: (statSource as any).stl * statPer40,
    blkPer40: (statSource as any).blk * statPer40,
    threePer40: (statSource as any).threePM * statPer40,
    tovPer40: (statSource as any).tov * statPer40,
    ftaPer40: ((statSource as any).fta ?? 0) * statPer40,
    trueShootingPct: avg.fgPct ?? 0.50,
    freeThrowPct: avg.ftPct ?? 0.70,
    threePtPct: avg.threePtPct ?? 0.33,
    assistToTurnover: avg.tov > 0 ? avg.ast / avg.tov : avg.ast || 1,
    heightInches: combine?.heightNoShoes || COMBINE_DEFAULTS.heightInches,
    weightLbs: combine?.weight || COMBINE_DEFAULTS.weightLbs,
    wingspanInches: combine?.wingspan || COMBINE_DEFAULTS.wingspanInches,
    standingReachInches: combine?.standingReach || COMBINE_DEFAULTS.standingReachInches,
    handLength: combine?.handLength || COMBINE_DEFAULTS.handLength,
    handWidth: combine?.handWidth || COMBINE_DEFAULTS.handWidth,
    laneAgility: combine?.laneAgility || COMBINE_DEFAULTS.laneAgility,
    shuttleRun: combine?.shuttleRun || COMBINE_DEFAULTS.shuttleRun,
    sprint: combine?.sprint || COMBINE_DEFAULTS.sprint,
    standingVertical: combine?.standingVertical || COMBINE_DEFAULTS.standingVertical,
    maxVertical: combine?.maxVertical || COMBINE_DEFAULTS.maxVertical,
    benchPress: combine?.benchPress || COMBINE_DEFAULTS.benchPress,
    conferenceTier: 0.5,  // international
    gamesPlayed: lastSeason?.gamesPlayed || intl.totalPreDraftGames,
    minutesPerGame: mpg,
    draftPosition: draft.pick,
    ptsTrajectory,
    usageTrajectory: 0,
    boxPlusMinus: 0,  // not available for intl
    winSharesPer40: 0,
  };
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('Loading raw data...');
  const drafts = loadDrafts();
  const collegeMap = loadCollege();
  const nbaMap = loadNBA();
  const intlMap = loadIntl();
  const combineMap = loadCombine();
  const teamStatsMap = loadTeamStats();

  console.log(`  Drafts: ${drafts.length} entries`);
  console.log(`  College: ${collegeMap.size} players`);
  console.log(`  NBA: ${nbaMap.size} players`);
  console.log(`  International: ${intlMap.size} players`);
  console.log(`  Combine: ${combineMap.size} players`);
  console.log(`  Team stats: ${teamStatsMap.size} school/seasons`);

  const records: TrainingRecord[] = [];
  let collegeRecords = 0;
  let intlRecords = 0;
  let skippedNoStats = 0;
  let skippedNoNBA = 0;
  let skippedFewGames = 0;
  let combineMatches = 0;

  for (const draft of drafts) {
    // Need NBA data for the target variable
    const nba = nbaMap.get(draft.slug);
    if (!nba) {
      skippedNoNBA++;
      continue;
    }

    // Skip players with < 10 career NBA games (not enough signal)
    if (nba.totalGames < 10) {
      skippedFewGames++;
      continue;
    }

    const combine = findCombine(draft.name, combineMap);
    if (combine) combineMatches++;

    // Try college path first
    const college = collegeMap.get(draft.slug);
    if (college && college.seasons.length > 0) {
      const realSeasons = college.seasons.filter((s) =>
        !s.season.includes('Career') && s.season.match(/^\d{4}-\d{2}$/)
      );
      const lastSeason = realSeasons[realSeasons.length - 1];
      const teamKey = lastSeason ? `${lastSeason.school}|${lastSeason.season}` : '';
      const teamStats = teamStatsMap.get(teamKey) || null;

      const features = buildCollegeFeatures(draft, college, nba, combine, teamStats);
      records.push({
        name: draft.name,
        slug: draft.slug,
        draftYear: draft.year,
        pick: draft.pick,
        college: draft.college,
        isInternational: false,
        features,
        target: nba.first4Avg,
        totalNBAGames: nba.totalGames,
      });
      collegeRecords++;
      continue;
    }

    // Try international path
    const intl = intlMap.get(draft.slug);
    if (intl && intl.totalPreDraftGames > 0) {
      const features = buildIntlFeatures(draft, intl, nba, combine);
      records.push({
        name: draft.name,
        slug: draft.slug,
        draftYear: draft.year,
        pick: draft.pick,
        college: '',
        isInternational: true,
        features,
        target: nba.first4Avg,
        totalNBAGames: nba.totalGames,
      });
      intlRecords++;
      continue;
    }

    skippedNoStats++;
  }

  console.log(`\nDataset built:`);
  console.log(`  Total records: ${records.length}`);
  console.log(`    College: ${collegeRecords}`);
  console.log(`    International: ${intlRecords}`);
  console.log(`  Combine matches: ${combineMatches}/${records.length} (${Math.round(100 * combineMatches / records.length)}%)`);
  console.log(`  Skipped (no pre-draft stats): ${skippedNoStats}`);
  console.log(`  Skipped (no NBA data): ${skippedNoNBA}`);
  console.log(`  Skipped (<10 NBA games): ${skippedFewGames}`);

  // Year breakdown
  const byYear: Record<number, { college: number; intl: number }> = {};
  for (const r of records) {
    if (!byYear[r.draftYear]) byYear[r.draftYear] = { college: 0, intl: 0 };
    if (r.isInternational) byYear[r.draftYear].intl++;
    else byYear[r.draftYear].college++;
  }
  console.log(`\n  By year:`);
  for (const [year, counts] of Object.entries(byYear).sort()) {
    const total = counts.college + counts.intl;
    const intlStr = counts.intl > 0 ? ` (${counts.college}C + ${counts.intl}I)` : '';
    console.log(`    ${year}: ${total} players${intlStr}`);
  }

  // Age stats
  const ages = records.map((r) => r.features.ageAtDraft).filter((a) => a > 0);
  const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  console.log(`\n  Age at draft: avg ${avgAge.toFixed(1)}, min ${minAge.toFixed(1)}, max ${maxAge.toFixed(1)}`);

  // Write dataset
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main();
