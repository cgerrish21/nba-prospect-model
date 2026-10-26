import { NBAStatLine, ProspectTier, STAT_KEYS } from './types';
import { FANTASY_WEIGHTS, TIER_THRESHOLDS } from './constants';

/**
 * Calculate fantasy points-league score from projected stats
 */
export function calculateFantasyScore(stats: NBAStatLine): number {
  return (
    stats.pts * FANTASY_WEIGHTS.pts +
    stats.reb * FANTASY_WEIGHTS.reb +
    stats.ast * FANTASY_WEIGHTS.ast +
    stats.stl * FANTASY_WEIGHTS.stl +
    stats.blk * FANTASY_WEIGHTS.blk +
    stats.tov * FANTASY_WEIGHTS.tov
  );
}

/**
 * Determine prospect tier based on fantasy score
 */
export function getTier(fantasyScore: number): ProspectTier {
  if (fantasyScore >= TIER_THRESHOLDS.elite) return 'Elite';
  if (fantasyScore >= TIER_THRESHOLDS.starter) return 'Starter';
  if (fantasyScore >= TIER_THRESHOLDS.rotation) return 'Rotation';
  return 'Bench';
}

/**
 * Calculate percentile rank for each stat category
 * Compared against all historical predictions/actuals
 */
export function calculatePercentiles(
  stats: NBAStatLine,
  allStats: NBAStatLine[],
): NBAStatLine {
  if (allStats.length === 0) {
    const defaults: Record<string, number> = {};
    for (const stat of STAT_KEYS) defaults[stat] = 50;
    return defaults as unknown as NBAStatLine;
  }
  const percentiles: Record<string, number> = {};

  for (const stat of STAT_KEYS) {
    const values = allStats.map((s) => s[stat]).sort((a, b) => a - b);
    const playerVal = stats[stat];

    // For TOV, lower is better — invert percentile
    if (stat === 'tov') {
      const rank = values.filter((v) => v >= playerVal).length;
      percentiles[stat] = Math.round((rank / values.length) * 100);
    } else {
      const rank = values.filter((v) => v <= playerVal).length;
      percentiles[stat] = Math.round((rank / values.length) * 100);
    }
  }

  return percentiles as unknown as NBAStatLine;
}

/**
 * Format stat line for display
 */
export function formatStatLine(stats: NBAStatLine): Record<string, string> {
  return {
    pts: stats.pts.toFixed(1),
    reb: stats.reb.toFixed(1),
    ast: stats.ast.toFixed(1),
    stl: stats.stl.toFixed(1),
    blk: stats.blk.toFixed(1),
    threePM: stats.threePM.toFixed(1),
    fgPct: (stats.fgPct * 100).toFixed(1) + '%',
    ftPct: (stats.ftPct * 100).toFixed(1) + '%',
    tov: stats.tov.toFixed(1),
  };
}

/**
 * Stat display labels
 */
export const STAT_LABELS: Record<string, string> = {
  pts: 'PTS',
  reb: 'REB',
  ast: 'AST',
  stl: 'STL',
  blk: 'BLK',
  threePM: '3PM',
  fgPct: 'FG%',
  ftPct: 'FT%',
  tov: 'TOV',
};

/**
 * Tier badge colors (Tailwind classes)
 */
export const TIER_COLORS: Record<ProspectTier, string> = {
  Elite: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Starter: 'bg-green-500/20 text-green-400 border-green-500/30',
  Rotation: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Bench: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};
