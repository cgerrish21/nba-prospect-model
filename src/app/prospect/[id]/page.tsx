'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatRadar } from '@/components/StatRadar';
import Link from 'next/link';

interface Prospect {
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

const TIER_CLASSES: Record<string, string> = {
  Elite: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  Starter: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
  Rotation: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  Bench: 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30',
};

const STAT_LABELS: Record<string, string> = {
  pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
  threePM: '3PM', fgPct: 'FG%', ftPct: 'FT%', tov: 'TOV',
};

export default function ProspectPage() {
  const params = useParams();
  const id = params.id as string;
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProspect() {
      for (const year of [2026, 2025]) {
        try {
          const res = await fetch(`/api/prospects?year=${year}`);
          if (!res.ok) continue;
          const data: Prospect[] = await res.json();
          const found = data.find((p) => p.id === id);
          if (found) {
            setProspect(found);
            setLoading(false);
            return;
          }
        } catch { /* try next year */ }
      }
      setLoading(false);
    }
    loadProspect();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">Prospect Not Found</h1>
        <Link href="/" className="text-primary hover:underline">Back to rankings</Link>
      </div>
    );
  }

  const radarData = Object.entries(STAT_LABELS).map(([key, label]) => ({
    stat: label,
    value: prospect.percentiles[key] || 50,
    fullMark: 100,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to rankings
        </Link>
        <div className="flex items-center gap-4 mt-3">
          <div>
            <h1 className="text-3xl font-bold">{prospect.name}</h1>
            <p className="text-muted-foreground">
              {prospect.school}
              {prospect.position && ` · ${prospect.position}`}
              {` · Age ${prospect.age.toFixed(0)}`}
              {prospect.projectedPick && ` · Projected Pick #${prospect.projectedPick}`}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-bold">{prospect.fantasyScore.toFixed(1)}</div>
            <Badge variant="outline" className={TIER_CLASSES[prospect.tier] || ''}>
              {prospect.tier}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projected Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Projected NBA Stats (per game)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(STAT_LABELS).map(([key, label]) => (
                <div key={key} className="text-center">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-bold">
                    {key === 'fgPct' || key === 'ftPct'
                      ? `${((prospect.projected[key] || 0) * 100).toFixed(1)}%`
                      : (prospect.projected[key] || 0).toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {prospect.percentiles[key] || 50}th pctl
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 9-Cat Radar */}
        <Card>
          <CardHeader>
            <CardTitle>9-Category Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRadar data={radarData} primaryLabel={prospect.name} />
          </CardContent>
        </Card>

        {/* Key Indicators */}
        <Card>
          <CardHeader>
            <CardTitle>Key Indicators</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Indicator
                label="Production Share (PTS)"
                value={`${((prospect.features.pointsShare || 0) * 100).toFixed(0)}%`}
                desc={prospect.features.pointsShare >= 0.3 ? 'Dominant' : prospect.features.pointsShare >= 0.2 ? 'Strong' : 'Low'}
              />
              <Indicator
                label="Usage Rate"
                value={`${(prospect.features.usageRate || 0).toFixed(1)}%`}
                desc={prospect.features.usageRate >= 28 ? 'High volume' : 'Moderate'}
              />
              <Indicator
                label="Age Signal"
                value={`${prospect.features.ageAtDraft.toFixed(0)} yrs`}
                desc={`Class year: ${prospect.features.classYear}`}
              />
              <Indicator
                label="Conference Tier"
                value={prospect.features.conferenceTier === 1 ? 'Power' : prospect.features.conferenceTier >= 0.85 ? 'Mid-Major' : 'Low'}
                desc={`Multiplier: ${prospect.features.conferenceTier.toFixed(2)}`}
              />
              <Indicator
                label="True Shooting"
                value={`${(prospect.features.trueShootingPct || 0).toFixed(1)}%`}
                desc="Efficiency metric"
              />
              <Indicator
                label="Box +/-"
                value={(prospect.features.boxPlusMinus || 0).toFixed(1)}
                desc="Advanced impact"
              />
            </div>

            {prospect.features.heightInches && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <Indicator
                    label="Height (no shoes)"
                    value={formatHeight(prospect.features.heightInches)}
                    desc={`${prospect.features.heightInches.toFixed(1)}"`}
                  />
                  <Indicator
                    label="Wingspan"
                    value={formatHeight(prospect.features.wingspanInches)}
                    desc={`${prospect.features.wingspanInches.toFixed(1)}"`}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Historical Comps */}
        <Card>
          <CardHeader>
            <CardTitle>Historical Comparisons</CardTitle>
          </CardHeader>
          <CardContent>
            {prospect.historicalComps && prospect.historicalComps.length > 0 ? (
              <div className="space-y-3">
                {prospect.historicalComps.map((comp, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="font-medium">{comp.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {comp.draftYear} Draft · {(comp.similarity * 100).toFixed(0)}% match
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{comp.fantasyScore.toFixed(1)}</div>
                      <div className="text-xs text-muted-foreground">
                        {comp.actual.pts?.toFixed(1)}/{comp.actual.reb?.toFixed(1)}/{comp.actual.ast?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No comparison data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Indicator({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

function formatHeight(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remaining = (inches % 12).toFixed(1);
  return `${feet}'${remaining}"`;
}
