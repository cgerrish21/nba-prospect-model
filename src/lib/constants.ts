// Conference tier mappings
export const CONFERENCE_TIERS: Record<string, number> = {
  // Tier 1 (1.0) - Power conferences
  'ACC': 1.0,
  'Big 12': 1.0,
  'Big East': 1.0,
  'Big Ten': 1.0,
  'SEC': 1.0,
  'AAC': 1.0,
  'Pac-12': 1.0, // historical
  'Pac-10': 1.0,
  'Big 12 Conference': 1.0,

  // Tier 2 (0.85) - Strong mid-majors
  'Mountain West': 0.85,
  'MWC': 0.85,
  'WCC': 0.85,
  'A-10': 0.85,
  'Atlantic 10': 0.85,
  'MVC': 0.85,
  'Missouri Valley': 0.85,
  'C-USA': 0.85,
  'Conference USA': 0.85,
  'Colonial': 0.85,
  'CAA': 0.85,

  // Default for everything else is Tier 3 (0.70)
};

export const DEFAULT_CONFERENCE_TIER = 0.70;

export function getConferenceTier(conference: string): number {
  // Try exact match first
  if (CONFERENCE_TIERS[conference] !== undefined) {
    return CONFERENCE_TIERS[conference];
  }
  // Try case-insensitive exact match
  const lower = conference.toLowerCase().trim();
  for (const [key, value] of Object.entries(CONFERENCE_TIERS)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return DEFAULT_CONFERENCE_TIER;
}

// Position average combine measurements (fallback when data is missing)
export const POSITION_AVG_COMBINE: Record<string, {
  heightInches: number;
  weightLbs: number;
  wingspanInches: number;
  standingReachInches: number;
  handLength: number;
  handWidth: number;
  laneAgility: number;
  shuttleRun: number;
  sprint: number;
  standingVertical: number;
  maxVertical: number;
  benchPress: number;
}> = {
  PG: { heightInches: 74.5, weightLbs: 190, wingspanInches: 79.0, standingReachInches: 98.0, handLength: 8.5, handWidth: 9.0, laneAgility: 10.8, shuttleRun: 3.05, sprint: 3.20, standingVertical: 30.0, maxVertical: 37.0, benchPress: 8 },
  SG: { heightInches: 76.5, weightLbs: 205, wingspanInches: 81.5, standingReachInches: 100.5, handLength: 8.75, handWidth: 9.25, laneAgility: 10.9, shuttleRun: 3.10, sprint: 3.22, standingVertical: 31.0, maxVertical: 38.0, benchPress: 9 },
  SF: { heightInches: 79.0, weightLbs: 220, wingspanInches: 84.0, standingReachInches: 104.0, handLength: 9.0, handWidth: 9.5, laneAgility: 11.1, shuttleRun: 3.15, sprint: 3.25, standingVertical: 30.5, maxVertical: 37.5, benchPress: 10 },
  PF: { heightInches: 81.0, weightLbs: 235, wingspanInches: 86.0, standingReachInches: 107.0, handLength: 9.25, handWidth: 9.75, laneAgility: 11.4, shuttleRun: 3.20, sprint: 3.30, standingVertical: 29.5, maxVertical: 36.0, benchPress: 11 },
  C:  { heightInches: 83.5, weightLbs: 250, wingspanInches: 88.5, standingReachInches: 110.0, handLength: 9.5, handWidth: 10.0, laneAgility: 11.8, shuttleRun: 3.30, sprint: 3.40, standingVertical: 28.0, maxVertical: 34.0, benchPress: 12 },
};

// Default to SF averages if position unknown
export const DEFAULT_COMBINE = POSITION_AVG_COMBINE['SF'];

// Fantasy scoring weights (points league)
export const FANTASY_WEIGHTS = {
  pts: 1,
  reb: 1.2,
  ast: 1.5,
  stl: 3,
  blk: 3,
  tov: -1,
};

// Tier thresholds (based on predicted fantasy score)
export const TIER_THRESHOLDS = {
  elite: 35,    // Projected all-star level
  starter: 25,  // Solid starter
  rotation: 15, // Rotation player
  // Below 15 = bench
};

// Draft years for training
export const FIRST_DRAFT_YEAR = 2005;
export const LAST_DRAFT_YEAR = 2025;

// Rate limiting
export const BREF_DELAY_MS = 3000;    // Basketball-Reference
export const BDL_DELAY_MS = 1000;     // BallDontLie API (more generous)
export const NBA_COM_DELAY_MS = 2000; // NBA.com
