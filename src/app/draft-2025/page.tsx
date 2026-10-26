'use client';

import { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

// ── Types ──

interface Flag {
  label: string;
  value: string;
  comparison: string;
  severity: string;
  detail: string;
}

interface GreenLight {
  label: string;
  value: string;
  comparison: string;
  detail: string;
}

interface NbaRookie {
  team: string;
  gamesPlayed: number;
  gamesStarted: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tov: number;
  fgPct: number;
  threePtPct: number;
  ftPct: number;
  per: number | null;
}

interface Profile {
  pick: number;
  name: string;
  team: string;
  college: string;
  position: string;
  posGroup: string;
  range: string;
  hasCollegeData: boolean;
  historicalBustRate: number | null;
  historicalMedianGames: number | null;
  dataWarning?: string;
  stats?: Record<string, number | null>;
  per40?: Record<string, number>;
  assistToTurnover?: number;
  expectedRole?: string;
  roleConfidence?: 'clear' | 'fuzzy';
  roleDetail?: string;
  flags: Flag[];
  greenLights: GreenLight[];
  summary: string;
  nbaRookie?: NbaRookie;
}

interface ProfileData {
  generatedAt: string;
  profiles: Profile[];
}

// ── Helpers ──


function signalColor(profile: Profile): string {
  if (!profile.hasCollegeData) return 'text-zinc-500';
  const highFlags = profile.flags.filter((f) => f.severity === 'high').length;
  const medFlags = profile.flags.filter((f) => f.severity === 'medium').length;
  if (highFlags >= 2) return 'text-red-400';
  if (highFlags >= 1) return 'text-orange-400';
  if (medFlags >= 2) return 'text-yellow-400';
  if (profile.greenLights.length >= 3) return 'text-green-400';
  if (profile.greenLights.length >= 1) return 'text-emerald-400';
  return 'text-zinc-500';
}

function signalIcon(profile: Profile): string {
  if (!profile.hasCollegeData) return '--';
  const highFlags = profile.flags.filter((f) => f.severity === 'high').length;
  const medFlags = profile.flags.filter((f) => f.severity === 'medium').length;
  if (highFlags >= 2) return '!!';
  if (highFlags >= 1) return '!';
  if (medFlags >= 2) return '?';
  if (profile.greenLights.length >= 3) return '++';
  if (profile.greenLights.length >= 1) return '+';
  return '--';
}


function fmtPct(v: number | null | undefined): string {
  if (v == null) return '--';
  return v > 1 ? v.toFixed(1) + '%' : (v * 100).toFixed(1) + '%';
}

function fmtStat(v: number | null | undefined): string {
  if (v == null) return '--';
  return v.toFixed(1);
}

// ── Page ──

export default function Draft2025Page() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [posFilter, setPosFilter] = useState<string>('All');
  const [rangeFilter, setRangeFilter] = useState<string>('All');
  const [signalFilter, setSignalFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('pick');

  useEffect(() => {
    fetch('/api/profiles-2025')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let profiles = data.profiles;
    if (posFilter !== 'All') profiles = profiles.filter((p) => p.posGroup === posFilter);
    if (rangeFilter !== 'All') profiles = profiles.filter((p) => p.range === rangeFilter);
    if (signalFilter === 'Red Flags') profiles = profiles.filter((p) => p.flags.some((f) => f.severity === 'high'));
    if (signalFilter === 'Yellow Flags') profiles = profiles.filter((p) => p.flags.some((f) => f.severity === 'medium') && !p.flags.some((f) => f.severity === 'high'));
    if (signalFilter === 'Green') profiles = profiles.filter((p) => p.flags.length === 0 && p.greenLights.length > 0);
    if (signalFilter === 'No Data') profiles = profiles.filter((p) => !p.hasCollegeData);

    if (sortBy === 'mpg') return [...profiles].sort((a, b) => (b.nbaRookie?.mpg || 0) - (a.nbaRookie?.mpg || 0));
    if (sortBy === 'ppg') return [...profiles].sort((a, b) => (b.nbaRookie?.ppg || 0) - (a.nbaRookie?.ppg || 0));
    if (sortBy === 'gp') return [...profiles].sort((a, b) => (b.nbaRookie?.gamesPlayed || 0) - (a.nbaRookie?.gamesPlayed || 0));
    if (sortBy === 'flags') return [...profiles].sort((a, b) => b.flags.length - a.flags.length);
    return profiles;
  }, [data, posFilter, rangeFilter, signalFilter, sortBy]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          {[...Array(10)].map((_, i) => <div key={i} className="h-16 bg-muted rounded w-full" />)}
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-7xl px-4 py-12 text-muted-foreground">No data available.</div>;
  }

  const toggle = (pick: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pick)) next.delete(pick);
      else next.add(pick);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(data.profiles.map((p) => p.pick)));
  const collapseAll = () => setExpanded(new Set());

  // Validation stats
  const flaggedWithNBA = data.profiles.filter((p) => p.nbaRookie && p.flags.some((f) => f.severity === 'high'));
  const cleanWithNBA = data.profiles.filter((p) => p.nbaRookie && p.hasCollegeData && p.flags.length === 0 && p.greenLights.length > 0);

  const avg = (arr: Profile[], key: keyof NbaRookie) => {
    const vals = arr.map((p) => p.nbaRookie?.[key]).filter((v): v is number => typeof v === 'number' && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const positions = ['All', 'Guard', 'Wing', 'Big'];
  const ranges = ['All', 'Top 5', 'Lottery (6-14)', 'Late 1st (15-30)', '2nd Round (31-60)'];
  const signals = ['All', 'Red Flags', 'Yellow Flags', 'Green', 'No Data'];
  const sorts = [
    { id: 'pick', label: 'Pick #' },
    { id: 'ppg', label: 'NBA PPG' },
    { id: 'mpg', label: 'NBA MPG' },
    { id: 'gp', label: 'Games' },
    { id: 'flags', label: 'Flags' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">2025 Draft Class — Red Flag Validation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.profiles.length} picks profiled against historical bust/survivor data, validated against their actual rookie season.
        </p>
      </div>

      {/* Validation Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-red-500/20">
          <div className="text-xs text-muted-foreground">Red-Flagged ({flaggedWithNBA.length} players)</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-red-400">{avg(flaggedWithNBA, 'ppg').toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">PPG</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-400">{avg(flaggedWithNBA, 'mpg').toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">MPG</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-400">{avg(flaggedWithNBA, 'gamesPlayed').toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">GP</div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">Avg pick: {flaggedWithNBA.length > 0 ? (flaggedWithNBA.reduce((s, p) => s + p.pick, 0) / flaggedWithNBA.length).toFixed(0) : '--'}</div>
        </Card>
        <Card className="p-4 border-green-500/20">
          <div className="text-xs text-muted-foreground">Clean/Green ({cleanWithNBA.length} players)</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-green-400">{avg(cleanWithNBA, 'ppg').toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">PPG</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">{avg(cleanWithNBA, 'mpg').toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">MPG</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">{avg(cleanWithNBA, 'gamesPlayed').toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">GP</div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">Avg pick: {cleanWithNBA.length > 0 ? (cleanWithNBA.reduce((s, p) => s + p.pick, 0) / cleanWithNBA.length).toFixed(0) : '--'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Draft-Adjusted Comparison</div>
          <div className="mt-2 text-sm">
            {(() => {
              // Compare only within overlapping draft ranges
              const lotteryFlagged = flaggedWithNBA.filter((p) => p.pick <= 14);
              const lotteryClean = cleanWithNBA.filter((p) => p.pick <= 14);
              if (lotteryFlagged.length > 0 && lotteryClean.length > 0) {
                const fPPG = avg(lotteryFlagged, 'ppg');
                const cPPG = avg(lotteryClean, 'ppg');
                const fMPG = avg(lotteryFlagged, 'mpg');
                const cMPG = avg(lotteryClean, 'mpg');
                return (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground mb-1">Lottery picks only (1-14):</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Flagged ({lotteryFlagged.length})</span>
                      <span className="font-mono text-red-400">{fPPG.toFixed(1)} PPG / {fMPG.toFixed(1)} MPG</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clean ({lotteryClean.length})</span>
                      <span className="font-mono text-green-400">{cPPG.toFixed(1)} PPG / {cMPG.toFixed(1)} MPG</span>
                    </div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      Clean lottery picks avg {(cPPG - fPPG).toFixed(1)} more PPG and {(cMPG - fMPG).toFixed(1)} more MPG
                    </div>
                  </div>
                );
              }
              return <span className="text-muted-foreground">Not enough data for same-range comparison</span>;
            })()}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 items-center flex-wrap">
        <div className="flex gap-1">
          {positions.map((p) => (
            <button key={p} onClick={() => setPosFilter(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${posFilter === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button key={r} onClick={() => setRangeFilter(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${rangeFilter === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {r === 'All' ? 'All Ranges' : r}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-1">
          {signals.map((s) => (
            <button key={s} onClick={() => setSignalFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${signalFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-1 items-center">
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {sorts.map((s) => (
            <button key={s.id} onClick={() => setSortBy(s.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${sortBy === s.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <button onClick={expandAll} className="rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors">Expand All</button>
        <button onClick={collapseAll} className="rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors">Collapse All</button>
      </div>

      {/* Prospect List */}
      <div className="space-y-2">
        {filteredAndSorted.map((p) => (
          <ProspectCard key={p.pick} profile={p} isExpanded={expanded.has(p.pick)} onToggle={() => toggle(p.pick)} />
        ))}
      </div>

      {filteredAndSorted.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No prospects match the current filters.</Card>
      )}
    </div>
  );
}

// ── Prospect Card ──

function ProspectCard({ profile: p, isExpanded, onToggle }: { profile: Profile; isExpanded: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors text-left">
        {/* Pick */}
        <div className="w-10 text-center">
          <span className="text-lg font-bold text-muted-foreground">{p.pick}</span>
        </div>

        {/* Signal */}
        <div className={`w-8 text-center font-bold text-lg ${signalColor(p)}`}>{signalIcon(p)}</div>

        {/* Name + team */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{p.name}</div>
          <div className="text-xs text-muted-foreground">{p.team} — {p.college || 'International'}</div>
        </div>

        {/* Archetype */}
        {p.expectedRole && (
          <Badge
            variant="outline"
            className={
              p.roleConfidence === 'fuzzy'
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : 'bg-violet-500/15 text-violet-400 border-violet-500/30'
            }
          >
            {p.expectedRole}{p.roleConfidence === 'fuzzy' ? ' ?' : ''}
          </Badge>
        )}

        {/* NBA rookie stats */}
        <div className="w-48 text-right">
          {p.nbaRookie ? (
            <div className="text-sm font-mono">
              <span className="font-bold">{p.nbaRookie.ppg?.toFixed(1)}</span>
              <span className="text-muted-foreground"> PPG </span>
              <span className="font-bold">{p.nbaRookie.mpg?.toFixed(1)}</span>
              <span className="text-muted-foreground"> MPG </span>
              <span className="text-xs text-muted-foreground">{p.nbaRookie.gamesPlayed}GP</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No NBA data</span>
          )}
        </div>

        <div className="text-muted-foreground text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</div>
      </button>

      {isExpanded && (
        <div className="border-t border-border p-4">
          {!p.hasCollegeData && !p.nbaRookie ? (
            <div className="text-sm text-muted-foreground">No college or NBA data available. International prospect.</div>
          ) : (
            <>
            {/* Expected Role callout */}
            {p.expectedRole && (
              <div className={`mb-4 rounded p-3 text-sm ${
                p.roleConfidence === 'fuzzy'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-violet-500/10 border border-violet-500/20'
              }`}>
                <span className={`font-semibold ${p.roleConfidence === 'fuzzy' ? 'text-red-400' : 'text-violet-400'}`}>
                  Expected Role: {p.expectedRole}
                </span>
                {p.roleDetail && (
                  <span className="text-muted-foreground ml-2">{p.roleDetail}</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* College stats */}
              {p.stats && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">College (Last Season)</h4>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    <StatLine label="PPG" value={fmtStat(p.stats.ppg)} />
                    <StatLine label="RPG" value={fmtStat(p.stats.rpg)} />
                    <StatLine label="APG" value={fmtStat(p.stats.apg)} />
                    <StatLine label="SPG" value={fmtStat(p.stats.spg)} />
                    <StatLine label="BPG" value={fmtStat(p.stats.bpg)} />
                    <StatLine label="TOV" value={fmtStat(p.stats.tov)} />
                    <StatLine label="MPG" value={fmtStat(p.stats.mpg)} />
                    <StatLine label="FG%" value={fmtPct(p.stats.fgPct)} />
                    <StatLine label="3PT%" value={fmtPct(p.stats.threePtPct)} />
                    <StatLine label="FT%" value={fmtPct(p.stats.ftPct)} />
                    <StatLine label="TS%" value={fmtPct(p.stats.trueShootingPct)} />
                    <StatLine label="USG%" value={p.stats.usageRate ? fmtStat(p.stats.usageRate) : '--'} />
                  </div>
                </div>
              )}

              {/* NBA rookie stats */}
              {p.nbaRookie && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">NBA Rookie (2025-26)</h4>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    <StatLine label="PPG" value={fmtStat(p.nbaRookie.ppg)} />
                    <StatLine label="RPG" value={fmtStat(p.nbaRookie.rpg)} />
                    <StatLine label="APG" value={fmtStat(p.nbaRookie.apg)} />
                    <StatLine label="SPG" value={fmtStat(p.nbaRookie.spg)} />
                    <StatLine label="BPG" value={fmtStat(p.nbaRookie.bpg)} />
                    <StatLine label="TOV" value={fmtStat(p.nbaRookie.tov)} />
                    <StatLine label="MPG" value={fmtStat(p.nbaRookie.mpg)} />
                    <StatLine label="GP" value={String(p.nbaRookie.gamesPlayed)} />
                    <StatLine label="GS" value={String(p.nbaRookie.gamesStarted)} />
                    <StatLine label="FG%" value={fmtPct(p.nbaRookie.fgPct)} />
                    <StatLine label="3PT%" value={fmtPct(p.nbaRookie.threePtPct)} />
                    <StatLine label="FT%" value={fmtPct(p.nbaRookie.ftPct)} />
                  </div>
                </div>
              )}

              {/* Red flags */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Red Flags
                  {p.flags.length === 0 && <span className="text-green-400 font-normal ml-2">None</span>}
                </h4>
                <div className="space-y-2">
                  {p.flags.map((f, i) => (
                    <div key={i} className={`text-sm rounded p-2 ${f.severity === 'high' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${f.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`}>{f.label}</span>
                        <span className="font-mono text-xs">{f.value}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.comparison}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Green lights */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Green Lights
                  {p.greenLights.length === 0 && <span className="text-muted-foreground font-normal ml-2">None</span>}
                </h4>
                <div className="space-y-2">
                  {p.greenLights.map((g, i) => (
                    <div key={i} className="text-sm rounded p-2 bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-green-400">{g.label}</span>
                        <span className="font-mono text-xs">{g.value}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{g.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
