'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface StatRadarProps {
  data: Array<{
    stat: string;
    value: number;     // percentile 0-100
    fullMark: number;
  }>;
  /** Optional second dataset for comparison overlay */
  comparisonData?: Array<{
    stat: string;
    value: number;
    fullMark: number;
  }>;
  comparisonLabel?: string;
  primaryLabel?: string;
  height?: number;
}

export function StatRadar({
  data,
  comparisonData,
  comparisonLabel = 'Comparison',
  primaryLabel = 'Prospect',
  height = 350,
}: StatRadarProps) {
  // Merge data for overlay
  const chartData = data.map((d, i) => ({
    stat: d.stat,
    primary: d.value,
    fullMark: d.fullMark,
    ...(comparisonData ? { comparison: comparisonData[i]?.value ?? 0 } : {}),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          tickCount={5}
        />
        <Radar
          name={primaryLabel}
          dataKey="primary"
          stroke="hsl(var(--chart-1))"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.3}
          strokeWidth={2}
        />
        {comparisonData && (
          <Radar
            name={comparisonLabel}
            dataKey="comparison"
            stroke="hsl(var(--chart-3))"
            fill="hsl(var(--chart-3))"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        )}
        {comparisonData && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  );
}
