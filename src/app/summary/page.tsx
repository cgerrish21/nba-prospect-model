'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface Finding {
  title: string;
  body: string;
  detail?: string;
  badge?: string;
  badgeClass?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{f.title}</CardTitle>
          {f.badge && (
            <Badge variant="outline" className={f.badgeClass}>{f.badge}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
        {f.detail && (
          <p className="text-xs text-muted-foreground/70 leading-relaxed">{f.detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

const statTranslation: Finding[] = [
  {
    title: 'College points barely predict NBA points',
    body: 'College PPG has only r=0.107 correlation with NBA PPG — the weakest of any stat. 86% of players score fewer points in the NBA than they did in college. A 20 PPG college scorer and a 12 PPG scorer have nearly the same expected NBA output.',
    detail: 'This is because college scoring is heavily influenced by usage rate and team context, not underlying talent. The model compensates by leaning on other signals (efficiency, athleticism, age).',
    badge: 'r = 0.11',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    title: 'Blocks are the stickiest stat from college to NBA',
    body: 'Shot-blocking translates better than anything else (r=0.635). If a player blocks shots in college, they almost certainly will in the NBA. It\'s the one physical skill that doesn\'t depend heavily on scheme or usage.',
    detail: 'Blocks had the highest model R² (0.507) of any predicted stat. Steals (r=0.481) and assists (r=0.522) are moderately sticky. Rebounds are surprisingly weak (r=0.421) because college rebounding is more about positioning vs. weaker opponents.',
    badge: 'r = 0.64',
    badgeClass: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  {
    title: 'Free throw percentage is the best shooting signal',
    body: 'College FT% correlates with NBA FT% at r=0.494 — better than FG% or 3PT%. It\'s the cleanest measure of pure shooting mechanics because it removes defense, shot selection, and scheme from the equation.',
    detail: 'Players who shoot 80%+ from the line in college average 78.7% in the NBA. Players below 65% average 64.6%. The gap persists. FT% also inversely correlates with NBA FG% (r=-0.387), suggesting good free throw shooters develop more versatile shot profiles.',
    badge: 'r = 0.49',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  {
    title: '3-point shooting is moderate but noisy',
    body: 'College 3PM per game translates moderately (r=0.516). But 3PT% itself is unreliable — small sample sizes (many players attempt <2 per game in college) add noise. Volume matters more than percentage for projection.',
    badge: 'r = 0.52',
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
];

const bustRates: Finding[] = [
  {
    title: 'Top-5 guards are nearly bust-proof',
    body: '0% bust rate across 24 top-5 guards from 2005-2020. 96% became starters. Chris Paul, Westbrook, Harden, Kyrie, Ja Morant — the track record is almost perfect. If you\'re a guard picked top 5, you\'re making it.',
    badge: '0% bust',
    badgeClass: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  {
    title: 'Lottery bigs bust at 2x the rate of lottery guards',
    body: 'Lottery bigs (picks 6-14) bust at 20% vs 13% for guards and 9% for wings. Big man skills are harder to evaluate from college tape — rim protection doesn\'t always scale against NBA athleticism, and post scoring becomes less relevant.',
    badge: '20% bust',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    title: 'Late first-round bigs are a coin flip',
    body: '42% bust rate for bigs drafted 15-30. Only 38% become starters. This is the danger zone — teams are paying first-round money for players who are more likely to bust than become starters.',
    detail: 'Compare to late first-round wings (33% bust, 45% starter) and guards (34% bust, 46% starter). Wings and guards are significantly safer bets in this range.',
    badge: '42% bust',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    title: 'Second-round success stories exist but are rare',
    body: '60-69% of second-round picks bust across all positions. But the ones who hit are often spectacular: Jokic (#41), Draymond Green (#35), Isaiah Thomas (#60), Malcolm Brogdon (#36). The key is identifying the right profile, not the pick number.',
    detail: 'Second-round guards who become starters (19%): Jordan Clarkson, Danny Green, Norman Powell, Patty Mills. The common thread is usually elite work ethic and a specific, translatable skill.',
  },
];

const modelInsights: Finding[] = [
  {
    title: 'The model explains ~40-50% of variance for most stats',
    body: 'Blocks (R²=0.507), assists (R²=0.483), turnovers (R²=0.445), rebounds (R²=0.441), steals (R²=0.427), and 3PM (R²=0.429) all land in a similar band. Points is lower (R²=0.382). FT% is the hardest to predict (R²=0.148).',
    detail: 'This means the model captures roughly half the story. The other half is development, opportunity, coaching, health, and randomness. This is consistent with academic research on draft prediction — nobody gets much above 50% explanatory power from college stats alone.',
  },
  {
    title: 'Age at draft is one of the strongest signals',
    body: 'Younger players (especially freshmen at 19) have more room to grow and more years of NBA development ahead. The model\'s points prediction has a large negative weight on age — older college players\' counting stats get discounted because they\'re closer to their ceiling.',
    detail: 'This is why a 19-year-old scoring 14 PPG can project higher than a 22-year-old senior scoring 20 PPG. The freshman has 3 more years of physical and skill development ahead.',
  },
  {
    title: 'Per-40 stats and usage rate matter more than per-game stats',
    body: 'The model uses per-40-minute stats rather than raw per-game numbers to normalize for playing time differences. A player putting up 12/6/3 in 25 minutes is a different profile than 12/6/3 in 35 minutes — the per-40 version of the first player is much more impressive.',
    detail: 'Usage rate helps disambiguate further: a 20 PPG scorer with 30% usage is less impressive than one with 22% usage, because the first player needed more possessions to produce the same output.',
  },
];

const redFlagInsights: Finding[] = [
  {
    title: 'No clear NBA role is the biggest red flag',
    body: 'Players who can\'t be classified into a translatable NBA archetype (3&D wing, lead guard, stretch big, etc.) bust at significantly higher rates. If you can\'t describe what a prospect does in the NBA in one sentence, that\'s a problem.',
    detail: 'The profiler assigns "fuzzy" confidence to players whose skill mix doesn\'t map to a known NBA role. Volume scorers with poor efficiency, bigs who can\'t shoot or protect the rim, and guards who neither shoot nor pass well all get flagged.',
    badge: 'High severity',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    title: 'Low assist-to-turnover ratio signals decision-making issues',
    body: 'Guards with AST/TOV below 1.0 and wings below 0.6 in college often struggle with NBA speed. The game is faster, defenders are smarter, and poor decision-makers get exposed. This is one of the few college stats that translates almost directly.',
    badge: 'Medium severity',
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
  {
    title: 'Poor free throw shooting in college is hard to fix',
    body: 'Players who shoot below 65% from the line in college average 64.6% in the NBA. While some improve (the Booker/Edwards type), most don\'t. For bigs, bad FT% also signals limited perimeter skill development, capping their offensive ceiling.',
    badge: 'Medium severity',
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
  {
    title: 'Older draft age means less upside',
    body: 'Seniors (22-23) have a narrower growth window than freshmen (19). They\'re closer to their peak, and if their college production isn\'t already at an NBA level, it\'s unlikely to get there. The exception is late bloomers who showed rapid improvement in their final season.',
    badge: 'Context-dependent',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
];

const dataLessons: Finding[] = [
  {
    title: '6.4% of our college data was wrong — for the wrong person entirely',
    body: 'The college scraper grabbed data for 59 completely wrong players (out of 918). Common names like Anthony Davis, Anthony Edwards, and Brandon Miller resolved to different people from different decades on Basketball-Reference. Devin Booker\'s file had Trevor Booker\'s Clemson stats.',
    detail: 'Root cause: the scraper tried URL patterns (firstname-lastname-1, -2) and accepted the first page that returned valid HTML without verifying the school matched the draft data. Fixed by adding school validation — the scraper now checks scraped school against expected college before accepting.',
    badge: '59 wrong files',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    title: 'Basketball-Reference uses inconsistent naming across domains',
    body: 'NBA slugs (bookede01) differ from college slugs (devin-booker-2). School names differ between draft pages (UNC, Texas A&M) and college pages (North Carolina, Texas A&M with HTML entities). Transfer players get per-school subtotal rows that break parsers.',
    detail: 'We maintain a 40+ entry alias map for school name normalization and filter out transfer subtotal rows ("Florida (2 Yrs)"). Anthony Davis was suffix -5, Cameron Johnson was -4 — some players need high suffix numbers because of name collisions.',
  },
  {
    title: 'Validation at scrape time would have prevented all of this',
    body: 'Every data quality issue we found — wrong player, wrong school, broken FT% in the improver analysis — traced back to accepting scraped data without checking it against what we already knew (the draft entry\'s college field). One simple comparison would have caught all 59 errors.',
    detail: 'Lesson: when scraping, always cross-reference against a known ground truth. If your draft data says "Kentucky" and your scraper returns "Clemson", that\'s a signal, not noise.',
    badge: 'Key lesson',
    badgeClass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  },
];

export default function SummaryPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">What We Learned</h1>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Findings from building a multi-output ridge regression model on 20 years of NBA draft data
          (2005-2024). 976 draft picks, 776 with college stats, predicting 9 fantasy-relevant
          NBA stats from college production, physical measurements, and draft context.
        </p>
      </div>

      <Separator />

      <Section title="College Stats Barely Translate (With Exceptions)">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          The biggest surprise: most college stats are weak predictors of NBA stats.
          The game is different — pace, spacing, athleticism, and role all change dramatically.
          But a few signals cut through the noise.
        </p>
        <div className="grid gap-3">
          {statTranslation.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </Section>

      <Separator />

      <Section title="Bust Rates by Position and Pick Range">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Defining &ldquo;bust&rdquo; as a player who never logged 900+ minutes in any NBA season (roughly
          a rotation player threshold). Data from 753 drafted players across 2005-2020 drafts,
          giving each player at least 4 years to establish themselves.
        </p>
        <div className="grid gap-3">
          {bustRates.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </Section>

      <Separator />

      <Section title="What the Model Can and Can't Do">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Multi-output ridge regression with L2 regularization. Each NBA stat is predicted
          independently using the same feature set (college per-40 stats, shooting percentages,
          advanced metrics, age, physical measurements, draft position).
        </p>
        <div className="grid gap-3">
          {modelInsights.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </Section>

      <Separator />

      <Section title="Red Flags That Predict Busts">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          The profiling system flags prospects with statistical patterns associated with higher bust
          rates. These aren&apos;t disqualifying on their own, but multiple flags on the same player
          compounds the risk significantly.
        </p>
        <div className="grid gap-3">
          {redFlagInsights.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </Section>

      <Separator />

      <Section title="Data Quality: The Hidden Risk">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          The most important lesson wasn&apos;t about basketball — it was about data integrity.
          Our model was training on wrong data for ~6% of players, including stars like
          Anthony Davis, Anthony Edwards, and Devin Booker. Everything downstream was compromised.
        </p>
        <div className="grid gap-3">
          {dataLessons.map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </Section>

      <Separator />

      <div className="text-xs text-muted-foreground space-y-1 pb-8">
        <p>
          Built with Next.js, TypeScript, and manual ridge regression (no ML libraries).
          Data from Basketball-Reference (2005-2025 drafts).
        </p>
        <p>
          Model source and scripts at prospect-model/scripts/.
          Training data: 776 college-to-NBA player pairs.
        </p>
      </div>
    </div>
  );
}
