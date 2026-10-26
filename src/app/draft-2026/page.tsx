'use client';

import { useEffect, useState } from 'react';
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

interface Profile {
  pick: number;
  name: string;
  school: string;
  position: string;
  posGroup: string;
  range: string;
  hasCollegeData: boolean;
  historicalBustRate: number | null;
  historicalMedianGames: number | null;
  dataWarning?: string;
  stats?: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    tov: number;
    mpg: number;
    ftPct: number;
    fgPct: number;
    threePtPct: number;
    fta: number;
    threePM: number;
    gamesPlayed: number;
    usageRate: number | null;
    boxPlusMinus: number | null;
    winSharesPer40: number | null;
    trueShootingPct: number | null;
    classYear: number;
  };
  per40?: Record<string, number>;
  assistToTurnover?: number;
  expectedRole?: string;
  roleConfidence?: 'clear' | 'fuzzy';
  roleDetail?: string;
  flags: Flag[];
  greenLights: GreenLight[];
  summary: string;
}

interface ProfileData {
  generatedAt: string;
  profiles: Profile[];
}

// ── Helpers ──


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


function fmtPct(v: number | null | undefined): string {
  if (v == null) return '--';
  return v > 1 ? v.toFixed(1) + '%' : (v * 100).toFixed(1) + '%';
}

function fmtStat(v: number | null | undefined): string {
  if (v == null) return '--';
  return v.toFixed(1);
}

// ── Page ──

export default function Draft2026Page() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [posFilter, setPosFilter] = useState<string>('All');
  const [rangeFilter, setRangeFilter] = useState<string>('All');
  const [signalFilter, setSignalFilter] = useState<string>('All');

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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

  let profiles = data.profiles;
  if (posFilter !== 'All') profiles = profiles.filter((p) => p.posGroup === posFilter);
  if (rangeFilter !== 'All') profiles = profiles.filter((p) => p.range === rangeFilter);
  if (signalFilter === 'Red Flags') profiles = profiles.filter((p) => p.flags.some((f) => f.severity === 'high'));
  if (signalFilter === 'Yellow Flags') profiles = profiles.filter((p) => p.flags.some((f) => f.severity === 'medium') && !p.flags.some((f) => f.severity === 'high'));
  if (signalFilter === 'Green') profiles = profiles.filter((p) => p.flags.length === 0 && p.greenLights.length > 0);
  if (signalFilter === 'No Data') profiles = profiles.filter((p) => !p.hasCollegeData);

  const withData = data.profiles.filter((p) => p.hasCollegeData);
  const flaggedCount = data.profiles.filter((p) => p.flags.some((f) => f.severity === 'high')).length;
  const cleanCount = withData.filter((p) => p.flags.length === 0 && p.greenLights.length > 0).length;

  const positions = ['All', 'Guard', 'Wing', 'Big'];
  const ranges = ['All', 'Top 5', 'Lottery (6-14)', 'Late 1st (15-30)', '2nd Round (31-60)'];
  const signals = ['All', 'Red Flags', 'Yellow Flags', 'Green', 'No Data'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">2026 Mock Draft — Red Flag Profiles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.profiles.length} prospects profiled against 20 years of historical bust/survivor data.
          {' '}{withData.length} with college stats, {flaggedCount} with red flags, {cleanCount} clean.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 items-center flex-wrap">
        <div className="flex gap-1">
          {positions.map((p) => (
            <button
              key={p}
              onClick={() => setPosFilter(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                posFilter === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRangeFilter(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                rangeFilter === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {r === 'All' ? 'All Ranges' : r}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-1">
          {signals.map((s) => (
            <button
              key={s}
              onClick={() => setSignalFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                signalFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <button
          onClick={expandAll}
          className="rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors"
        >
          Collapse All
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {['Top 5', 'Lottery (6-14)', 'Late 1st (15-30)', '2nd Round (31-60)'].map((range) => {
          const inRange = data.profiles.filter((p) => p.range === range);
          const withDataInRange = inRange.filter((p) => p.hasCollegeData);
          const flagged = inRange.filter((p) => p.flags.some((f) => f.severity === 'high')).length;
          const clean = withDataInRange.filter((p) => p.flags.length === 0 && p.greenLights.length > 0).length;
          const bustRate = inRange[0]?.historicalBustRate;
          return (
            <Card key={range} className="p-3">
              <div className="text-xs text-muted-foreground">{range}</div>
              <div className="text-lg font-bold mt-1">{inRange.length} picks</div>
              <div className="flex flex-col gap-0.5 mt-1 text-xs">
                <span className="text-red-400">{flagged} flagged</span>
                <span className="text-green-400">{clean} clean</span>
                {bustRate != null && (
                  <span className="text-muted-foreground">Hist. bust rate: {(bustRate * 100).toFixed(0)}%</span>
                )}
              </div>
            </Card>
          );
        })}
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Data Coverage</div>
          <div className="text-lg font-bold mt-1">{withData.length}/{data.profiles.length}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.profiles.length - withData.length} missing
          </div>
          <div className="w-full h-2 bg-muted rounded mt-2 overflow-hidden">
            <div
              className="h-full bg-green-500/60 rounded"
              style={{ width: `${(withData.length / data.profiles.length) * 100}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Prospect List */}
      <div className="space-y-2">
        {profiles.map((p) => (
          <ProspectCard
            key={p.pick}
            profile={p}
            isExpanded={expanded.has(p.pick)}
            onToggle={() => toggle(p.pick)}
          />
        ))}
      </div>

      {profiles.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No prospects match the current filters.
        </Card>
      )}
    </div>
  );
}

// ── Prospect Card ──

function ProspectCard({
  profile: p,
  isExpanded,
  onToggle,
}: {
  profile: Profile;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors text-left"
      >
        {/* Pick number */}
        <div className="w-10 text-center">
          <span className="text-lg font-bold text-muted-foreground">
            {p.pick}
          </span>
        </div>

        {/* Signal indicator */}
        <div className={`w-8 text-center font-bold text-lg ${signalColor(p)}`}>
          {signalIcon(p)}
        </div>

        {/* Name + school */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{p.name}</div>
          <div className="text-xs text-muted-foreground">{p.school}</div>
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

        {/* Expand arrow */}
        <div className="text-muted-foreground text-sm">
          {isExpanded ? '\u25B2' : '\u25BC'}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          {!p.hasCollegeData ? (
            <div className="text-sm text-muted-foreground">
              No college data available for this prospect. May be an international player or data was not scraped yet.
            </div>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stats */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Last Season Stats</h4>
                {p.dataWarning && (
                  <div className="text-xs text-yellow-400 mb-2 bg-yellow-500/10 px-2 py-1 rounded">
                    {p.dataWarning}
                  </div>
                )}
                {p.stats && (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    <StatLine label="PPG" value={fmtStat(p.stats.ppg)} />
                    <StatLine label="RPG" value={fmtStat(p.stats.rpg)} />
                    <StatLine label="APG" value={fmtStat(p.stats.apg)} />
                    <StatLine label="SPG" value={fmtStat(p.stats.spg)} />
                    <StatLine label="BPG" value={fmtStat(p.stats.bpg)} />
                    <StatLine label="TOV" value={fmtStat(p.stats.tov)} />
                    <StatLine label="MPG" value={fmtStat(p.stats.mpg)} />
                    <StatLine label="GP" value={String(p.stats.gamesPlayed)} />
                    <StatLine label="Year" value={String(p.stats.classYear)} />
                    <StatLine label="FG%" value={fmtPct(p.stats.fgPct)} />
                    <StatLine label="3PT%" value={fmtPct(p.stats.threePtPct)} />
                    <StatLine label="FT%" value={fmtPct(p.stats.ftPct)} />
                    <StatLine label="USG%" value={p.stats.usageRate ? fmtStat(p.stats.usageRate) : '--'} />
                    <StatLine label="TS%" value={fmtPct(p.stats.trueShootingPct)} />
                    <StatLine label="BPM" value={p.stats.boxPlusMinus ? fmtStat(p.stats.boxPlusMinus) : '--'} />
                  </div>
                )}
                {p.historicalBustRate != null && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Historical bust rate for {p.posGroup} {p.range}: {(p.historicalBustRate * 100).toFixed(0)}%
                    <br />
                    Median games: {p.historicalMedianGames}
                  </div>
                )}
              </div>

              {/* Red flags */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Red Flags
                  {p.flags.length === 0 && <span className="text-green-400 font-normal ml-2">None</span>}
                </h4>
                <div className="space-y-2">
                  {p.flags.map((f, i) => (
                    <div
                      key={i}
                      className={`text-sm rounded p-2 ${
                        f.severity === 'high'
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-yellow-500/10 border border-yellow-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${f.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`}>
                          {f.label}
                        </span>
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
                    <div
                      key={i}
                      className="text-sm rounded p-2 bg-green-500/10 border border-green-500/20"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-green-400">{g.label}</span>
                        <span className="font-mono text-xs">{g.value}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{g.detail}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{g.comparison}</div>
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

// ── Stat Line Component ──

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
