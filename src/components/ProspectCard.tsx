import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

interface ProspectCardProps {
  id: string;
  rank: number;
  name: string;
  school: string;
  position: string;
  age: number;
  fantasyScore: number;
  tier: string;
  projected: Record<string, number>;
  projectedPick?: number;
}

const TIER_CLASSES: Record<string, string> = {
  Elite: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  Starter: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
  Rotation: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
  Bench: 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30',
};

export function ProspectCard({
  id,
  rank,
  name,
  school,
  position,
  age,
  fantasyScore,
  tier,
  projected,
  projectedPick,
}: ProspectCardProps) {
  return (
    <Link href={`/prospect/${id}`}>
      <Card className="transition-colors hover:bg-accent/50 cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-muted-foreground">
                {rank}
              </span>
              <div>
                <CardTitle className="text-base">{name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {school} {position && `· ${position}`} · Age {age.toFixed(0)}
                  {projectedPick && ` · Pick #${projectedPick}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={TIER_CLASSES[tier] || ''}>
                {tier}
              </Badge>
              <span className="text-lg font-bold">{fantasyScore.toFixed(1)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-9 gap-2 text-center text-xs">
            {[
              { key: 'pts', label: 'PTS' },
              { key: 'reb', label: 'REB' },
              { key: 'ast', label: 'AST' },
              { key: 'stl', label: 'STL' },
              { key: 'blk', label: 'BLK' },
              { key: 'threePM', label: '3PM' },
              { key: 'fgPct', label: 'FG%' },
              { key: 'ftPct', label: 'FT%' },
              { key: 'tov', label: 'TOV' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div className="text-muted-foreground">{label}</div>
                <div className="font-medium">
                  {key === 'fgPct' || key === 'ftPct'
                    ? `${((projected[key] || 0) * 100).toFixed(1)}`
                    : (projected[key] || 0).toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
