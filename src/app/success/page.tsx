'use client';

import { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

// ── Types ──

interface BustRate {
  position: string;
  range: string;
  total: number;
  distribution: Record<string, number>;
  bustRate: number;
  medianGames: number; // actually meaningful seasons (900+ min) — legacy field name
  names: { starters: string[]; busts: string[] };
}

interface RangeStat {
  range: string;
  count: number;
  medianMeaningfulSeasons: number;
  p25: number;
  p75: number;
  bustRate: number;
  starterRate: number;
}

interface Marker {
  key: string;
  label: string;
  correlation: number;
  starterAvg: number;
  bustAvg: number;
  diff: number;
  n: number;
}

interface Outperformer {
  name: string;
  pick: number;
  draftYear: number;
  totalGames: number;
  meaningfulSeasons: number;
  expected: number;
  ratio: number;
}

interface OutperformerGroup {
  position: string;
  range: string;
  players: Outperformer[];
}

interface TraitComparison {
  key: string;
  label: string;
  outperformerAvg: number;
  underperformerAvg: number;
  diff: number;
  correlation: number;
}

interface RedFlag {
  position: string;
  range: string;
  bustCount: number;
  survivorCount: number;
  flags: Array<{
    label: string;
    bustAvg: number;
    survivorAvg: number;
    diff: number;
    isPct: boolean;
  }>;
}

interface SuccessData {
  generatedAt: string;
  playerCount: number;
  draftYearRange: string;
  positionCounts: Record<string, number>;
  bustRates: BustRate[];
  rangeStats: RangeStat[];
  successMarkers: Array<{ position: string; markers: Marker[] }>;
  topOutperformers: OutperformerGroup[];
  outperformerTraits: Array<{ position: string; traits: TraitComparison[] }>;
  redFlags: RedFlag[];
}

// ── Helpers ──

const POS_COLORS: Record<string, string> = {
  Guard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Wing: 'bg-green-500/20 text-green-400 border-green-500/30',
  Big: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const TIER_COLORS: Record<string, string> = {
  Starter: 'bg-green-500',
  Rotation: 'bg-blue-500',
  Fringe: 'bg-yellow-500',
  Out: 'bg-red-500',
};

function pct(v: number): string {
  return (v * 100).toFixed(0) + '%';
}

function fmtVal(v: number, isPct: boolean): string {
  return isPct ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
}

// ── Page ──

export default function SuccessPage() {
  const [data, setData] = useState<SuccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'busts' | 'markers' | 'outperformers' | 'redflags'>('busts');
  const [posFilter, setPosFilter] = useState<string>('All');

  useEffect(() => {
    fetch('/api/success')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-muted rounded w-full" />)}
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-7xl px-4 py-12 text-muted-foreground">No data available.</div>;
  }

  const tabs = [
    { id: 'busts' as const, label: 'Bust Rates' },
    { id: 'markers' as const, label: 'Success Markers' },
    { id: 'outperformers' as const, label: 'Outperformers' },
    { id: 'redflags' as const, label: 'Red Flags' },
  ];

  const positions = ['All', 'Guard', 'Wing', 'Big'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">NBA Success Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.playerCount} players drafted {data.draftYearRange}, analyzed by position and draft range.
          A &quot;meaningful season&quot; = 900+ total minutes (rotation-level role).
          Bust = fewer than 2 meaningful seasons.
        </p>
      </div>

      <div className="flex gap-3 mb-6 items-center flex-wrap">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
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
      </div>

      {tab === 'busts' && <BustsTab data={data} posFilter={posFilter} />}
      {tab === 'markers' && <MarkersTab data={data} posFilter={posFilter} />}
      {tab === 'outperformers' && <OutperformersTab data={data} posFilter={posFilter} />}
      {tab === 'redflags' && <RedFlagsTab data={data} posFilter={posFilter} />}
    </div>
  );
}

// ── Bust Rates Tab ──

function BustsTab({ data, posFilter }: { data: SuccessData; posFilter: string }) {
  const filtered = data.bustRates.filter((b) => posFilter === 'All' || b.position === posFilter);
  const tiers = ['Starter', 'Rotation', 'Fringe', 'Out'];

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-4">
        {data.rangeStats.map((rs) => (
          <Card key={rs.range} className="p-4">
            <div className="text-xs text-muted-foreground">{rs.range}</div>
            <div className="text-2xl font-bold mt-1">{rs.medianMeaningfulSeasons}</div>
            <div className="text-xs text-muted-foreground">median seasons at 900+ min</div>
            <div className="flex gap-2 mt-2">
              <span className="text-xs text-green-400">{pct(rs.starterRate)} starter</span>
              <span className="text-xs text-red-400">{pct(rs.bustRate)} out</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Detailed bust rates */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Career Outcomes by Position &times; Draft Range</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Starter = 5+ seasons of 900+ min, Rotation = 2-4, Fringe = 1, Out = 0
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Range</TableHead>
              <TableHead className="text-center">N</TableHead>
              <TableHead className="text-center">Median Seasons</TableHead>
              {tiers.map((t) => (
                <TableHead key={t} className="text-center">{t}</TableHead>
              ))}
              <TableHead className="text-center">Bust Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((b) => (
              <TableRow key={`${b.position}-${b.range}`}>
                <TableCell>
                  <Badge variant="outline" className={POS_COLORS[b.position] || ''}>{b.position}</Badge>
                </TableCell>
                <TableCell className="font-medium">{b.range}</TableCell>
                <TableCell className="text-center">{b.total}</TableCell>
                <TableCell className="text-center font-mono">{b.medianGames}</TableCell>
                {tiers.map((t) => (
                  <TableCell key={t} className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${TIER_COLORS[t]}`} />
                      <span className="font-mono text-sm">{pct(b.distribution[t] || 0)}</span>
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  <span className={`font-bold ${b.bustRate > 0.4 ? 'text-red-400' : b.bustRate > 0.2 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {pct(b.bustRate)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Stacked bar visualization */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Visual Breakdown</h2>
        <div className="space-y-3">
          {filtered.map((b) => (
            <div key={`${b.position}-${b.range}`} className="flex items-center gap-3">
              <div className="w-32 text-sm text-right">
                <Badge variant="outline" className={`${POS_COLORS[b.position]} mr-1`}>
                  {b.position.charAt(0)}
                </Badge>
                <span className="text-muted-foreground">{b.range}</span>
              </div>
              <div className="flex-1 h-6 rounded flex overflow-hidden">
                {tiers.map((t) => {
                  const w = (b.distribution[t] || 0) * 100;
                  if (w < 1) return null;
                  return (
                    <div
                      key={t}
                      className={`${TIER_COLORS[t]} opacity-70 relative group`}
                      style={{ width: `${w}%` }}
                      title={`${t}: ${pct(b.distribution[t] || 0)}`}
                    >
                      {w > 8 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                          {pct(b.distribution[t] || 0)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="text-xs text-muted-foreground w-8">{b.total}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-4 justify-center">
          {tiers.map((t) => (
            <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`w-3 h-3 rounded ${TIER_COLORS[t]} opacity-70`} />
              {t}
            </div>
          ))}
        </div>
      </Card>

      {/* Notable names */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-base font-semibold mb-3">Notable Starters</h3>
          <p className="text-xs text-muted-foreground mb-2">Name (seasons of 900+ min)</p>
          <div className="space-y-2">
            {filtered.slice(0, 6).map((b) => (
              b.names.starters.length > 0 && (
                <div key={`s-${b.position}-${b.range}`}>
                  <div className="text-xs text-muted-foreground">{b.position} {b.range}</div>
                  <div className="text-sm">{b.names.starters.join(', ')}</div>
                </div>
              )
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-base font-semibold mb-3">Notable Busts</h3>
          <p className="text-xs text-muted-foreground mb-2">Name (seasons of 900+ min)</p>
          <div className="space-y-2">
            {filtered.slice(0, 6).map((b) => (
              b.names.busts.length > 0 && (
                <div key={`b-${b.position}-${b.range}`}>
                  <div className="text-xs text-muted-foreground">{b.position} {b.range}</div>
                  <div className="text-sm">{b.names.busts.join(', ')}</div>
                </div>
              )
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Success Markers Tab ──

function MarkersTab({ data, posFilter }: { data: SuccessData; posFilter: string }) {
  const filtered = data.successMarkers.filter((sm) => posFilter === 'All' || sm.position === posFilter);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Correlation between each college marker and total meaningful NBA seasons (900+ min).
          Positive = more of this marker predicts more meaningful seasons. Sorted by absolute correlation strength.
        </p>
      </Card>

      {filtered.map((sm) => (
        <Card key={sm.position} className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Badge variant="outline" className={POS_COLORS[sm.position] || ''}>{sm.position}</Badge>
            <h2 className="text-lg font-semibold">Success Predictors</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marker</TableHead>
                <TableHead className="text-center">Correlation</TableHead>
                <TableHead className="w-48">Strength</TableHead>
                <TableHead className="text-center">Starter Avg</TableHead>
                <TableHead className="text-center">Bust Avg</TableHead>
                <TableHead className="text-center">Diff</TableHead>
                <TableHead className="text-center">N</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sm.markers.map((m) => {
                const absR = Math.abs(m.correlation);
                const barWidth = Math.min(100, absR * 500); // scale up for visibility
                const isPct = ['FT%', 'True Shooting %', '3PT%'].includes(m.label);
                return (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-center font-mono">
                      <span className={m.correlation > 0 ? 'text-green-400' : 'text-red-400'}>
                        {m.correlation > 0 ? '+' : ''}{m.correlation.toFixed(3)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="w-full h-3 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${m.correlation > 0 ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono">{fmtVal(m.starterAvg, isPct)}</TableCell>
                    <TableCell className="text-center font-mono">{fmtVal(m.bustAvg, isPct)}</TableCell>
                    <TableCell className="text-center font-mono">
                      <span className={m.diff > 0 ? 'text-green-400' : 'text-red-400'}>
                        {m.diff > 0 ? '+' : ''}{fmtVal(m.diff, isPct)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{m.n}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

// ── Outperformers Tab ──

function OutperformersTab({ data, posFilter }: { data: SuccessData; posFilter: string }) {
  const filteredGroups = data.topOutperformers.filter((g) => posFilter === 'All' || g.position === posFilter);
  const filteredTraits = data.outperformerTraits.filter((t) => posFilter === 'All' || t.position === posFilter);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Outperformance = actual meaningful seasons (900+ min) vs median for their draft range.
          A ratio of 2.0x means they had twice as many meaningful seasons as the typical player picked in their range.
        </p>
      </Card>

      {/* Top outperformers by group */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredGroups.map((g) => (
          <Card key={`${g.position}-${g.range}`} className="p-0 overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-2">
              <Badge variant="outline" className={POS_COLORS[g.position] || ''}>{g.position}</Badge>
              <span className="text-sm font-semibold">{g.range}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Pick</TableHead>
                  <TableHead className="text-center">Seasons</TableHead>
                  <TableHead className="text-center">Expected</TableHead>
                  <TableHead className="text-center">Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.players.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="text-sm">
                      <div>{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.draftYear}</div>
                    </TableCell>
                    <TableCell className="text-center">{p.pick}</TableCell>
                    <TableCell className="text-center font-mono font-bold">{p.meaningfulSeasons}</TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{p.expected}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${p.ratio >= 1.5 ? 'text-green-400' : p.ratio >= 1.0 ? 'text-blue-400' : 'text-red-400'}`}>
                        {p.ratio.toFixed(2)}x
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      </div>

      {/* Outperformer trait analysis */}
      {filteredTraits.map((t) => (
        <Card key={t.position} className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Badge variant="outline" className={POS_COLORS[t.position] || ''}>{t.position}</Badge>
            <h2 className="text-lg font-semibold">What Outperformers Have in Common</h2>
            <span className="text-xs text-muted-foreground">(top quartile vs bottom quartile)</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trait</TableHead>
                <TableHead className="text-center">Correlation</TableHead>
                <TableHead className="text-center">Top 25%</TableHead>
                <TableHead className="text-center">Bottom 25%</TableHead>
                <TableHead className="text-center">Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.traits.map((tr) => {
                const isPct = ['FT%', 'True Shooting %', '3PT%'].includes(tr.label);
                return (
                  <TableRow key={tr.key}>
                    <TableCell className="font-medium">{tr.label}</TableCell>
                    <TableCell className="text-center font-mono">
                      <span className={tr.correlation > 0 ? 'text-green-400' : 'text-red-400'}>
                        {tr.correlation > 0 ? '+' : ''}{tr.correlation.toFixed(3)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono">{fmtVal(tr.outperformerAvg, isPct)}</TableCell>
                    <TableCell className="text-center font-mono">{fmtVal(tr.underperformerAvg, isPct)}</TableCell>
                    <TableCell className="text-center font-mono">
                      <span className={tr.diff > 0 ? 'text-green-400' : 'text-red-400'}>
                        {tr.diff > 0 ? '+' : ''}{fmtVal(tr.diff, isPct)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

// ── Red Flags Tab ──

function RedFlagsTab({ data, posFilter }: { data: SuccessData; posFilter: string }) {
  const filtered = data.redFlags.filter((rf) => posFilter === 'All' || rf.position === posFilter);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Comparing busts (0-1 meaningful seasons) against survivors (2+ meaningful seasons)
          within the same position and draft range. What separates them?
        </p>
      </Card>

      {filtered.map((rf) => (
        <Card key={`${rf.position}-${rf.range}`} className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={POS_COLORS[rf.position] || ''}>{rf.position}</Badge>
            <span className="font-semibold">{rf.range}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {rf.bustCount} busts vs {rf.survivorCount} survivors
            </span>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {rf.flags.map((f) => {
                const bustStr = fmtVal(f.bustAvg, f.isPct);
                const survStr = fmtVal(f.survivorAvg, f.isPct);
                // Normalize diff for bar width
                const normDiff = f.survivorAvg !== 0
                  ? Math.abs(f.diff / f.survivorAvg) * 100
                  : 0;
                const barW = Math.min(100, normDiff * 3);
                const isBad = f.diff < 0; // busts have less of this thing

                return (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className="w-36 text-sm font-medium">{f.label}</div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="text-xs text-red-400 w-16 text-right font-mono">{bustStr}</div>
                      <div className="flex-1 h-4 bg-muted rounded relative overflow-hidden">
                        <div
                          className={`absolute top-0 h-4 rounded ${isBad ? 'bg-red-500/40' : 'bg-yellow-500/40'}`}
                          style={{ width: `${barW}%`, left: isBad ? '0' : undefined, right: isBad ? undefined : '0' }}
                        />
                      </div>
                      <div className="text-xs text-green-400 w-16 font-mono">{survStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Not enough data for this position filter. Try &quot;All&quot;.
        </Card>
      )}
    </div>
  );
}
