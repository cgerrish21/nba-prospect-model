# NBA Draft Prospect Model

Multi-output ridge regression model that predicts NBA statistical production from pre-draft college and combine data. Trained on 20 years of draft history (2005-2024), validated with leave-one-year-out cross-validation, and deployed as an interactive Next.js application with prospect cards, radar charts, and draft class rankings.

## How It Works

The model trains 9 separate ridge regression models, one for each NBA statistical category:

| Category | Description |
|----------|-------------|
| PTS | Points per game |
| REB | Rebounds per game |
| AST | Assists per game |
| STL | Steals per game |
| BLK | Blocks per game |
| 3PM | Three-pointers made per game |
| FG% | Field goal percentage |
| FT% | Free throw percentage |
| TOV | Turnovers per game |

Each model takes a 28-dimensional feature vector (after normalization) and outputs a predicted per-game average for that stat category. Predictions are combined into a composite fantasy score used to tier prospects as Elite, Starter, Rotation, or Bench.

## Features (34 inputs)

The feature vector for each prospect is extracted from college stats, combine measurements, and draft context:

**Demographics & Context**
- Age at draft, class year, draft position, conference tier (3-tier system: power, strong mid-major, other)

**Production Shares**
- Points share, rebounds share, assists share (% of team production)

**Per-40-Minute Stats**
- PTS, REB, AST, STL, BLK, 3PM, TOV, FTA (scaled to 40 minutes played)

**Efficiency**
- True shooting %, free throw %, three-point %, assist-to-turnover ratio

**Physical Measurements**
- Height, weight, wingspan, standing reach (from combine data, with position-average fallbacks)

**Trajectory**
- Year-over-year scoring improvement, year-over-year usage rate change

**Advanced**
- Box Plus/Minus, Win Shares per 40 minutes, usage rate, games played, minutes per game

## Model Details

**Algorithm:** Closed-form ridge regression with L2 regularization. Each target stat gets its own model with a shared regularization parameter (lambda). The system solves `w = (X^TX + λI)^{-1} X^Ty` via Gaussian elimination with partial pivoting.

**Training data:** ~1,200 drafted players from 2005-2024 with matched college stats, combine data, and NBA career outcomes (peak-year stats from years 2-5).

**Validation:** Leave-one-year-out cross-validation. Each draft class is held out in turn, the model trains on the remaining 19 classes, and predictions are evaluated on the held-out year. This prevents data leakage and simulates real-world usage (predicting a class the model has never seen).

**Lambda selection:** Grid search over candidate values [0.01, 0.1, 1, 10, 100, 1000], selecting the lambda that minimizes average MSE across all held-out years and stat categories.

**Normalization:** Z-score normalization (mean=0, std=1) computed on training data and applied to test data using training-set parameters.

## Data Pipeline

The `scripts/` directory contains a numbered pipeline for building the dataset from scratch:

| Script | Purpose |
|--------|---------|
| `1-scrape-drafts.ts` | Draft history from Basketball Reference (picks, teams, schools) |
| `2-scrape-college-stats.ts` | College season stats from Basketball Reference |
| `3-scrape-nba-careers.ts` | NBA career stats for drafted players |
| `4-scrape-combine.ts` | NBA combine measurements |
| `4b-scrape-combine-bref.ts` | Combine data from Basketball Reference (supplemental) |
| `5-build-dataset.ts` | Merges all sources, extracts features, builds training set |
| `6-train-model.ts` | Trains multi-output ridge regression, runs cross-validation |
| `7-predict-class.ts` | Generates predictions for a given draft class |
| `8-scrape-team-stats.ts` | Team-level stats for production share calculations |
| `9-scrape-international.ts` | International prospect data |
| `10-scrape-2026-prospects.ts` | Current prospect class college stats |
| `11-profile-2026-class.ts` | Builds prospect profiles for the 2026 class |
| `12-profile-2025-class.ts` | Builds prospect profiles for the 2025 class |

All scraping scripts include rate limiting (3s delay for Basketball Reference, 1-2s for other sources).

## Project Structure

```
prospect-model/
├── data/
│   ├── raw/              # Scraped source data (drafts, college, NBA, combine)
│   ├── predictions/      # Model output per draft class
│   ├── dataset.json      # Merged training dataset (~1,200 players)
│   ├── model.json        # Trained model weights + normalization parameters
│   ├── 2025-profiles.json # 2025 draft class prospect profiles
│   └── 2026-profiles.json # 2026 draft class prospect profiles
├── scripts/              # Data pipeline (numbered, sequential)
├── src/
│   ├── app/
│   │   ├── page.tsx          # Home page
│   │   ├── draft-2025/       # 2025 draft class rankings
│   │   ├── draft-2026/       # 2026 draft class rankings
│   │   ├── prospect/         # Individual prospect detail pages
│   │   ├── summary/          # Model methodology summary
│   │   ├── success/          # Historical prediction accuracy
│   │   └── api/              # API routes for data access
│   ├── components/
│   │   ├── ProspectCard.tsx  # Prospect display card
│   │   ├── StatRadar.tsx     # Radar chart for stat profiles
│   │   └── Navbar.tsx        # Navigation
│   └── lib/
│       ├── model.ts          # Ridge regression implementation
│       ├── features.ts       # Feature extraction and normalization
│       ├── scoring.ts        # Fantasy scoring and tier classification
│       ├── types.ts          # TypeScript types (FeatureVector, NBAStatLine, etc.)
│       └── constants.ts      # Conference tiers, combine defaults, scoring weights
└── package.json
```

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To rebuild the dataset from scratch (requires internet access for scraping):

```bash
cd scripts
npx tsx 1-scrape-drafts.ts
npx tsx 2-scrape-college-stats.ts
# ... continue through the pipeline
npx tsx 6-train-model.ts
npx tsx 7-predict-class.ts
```

## Tech Stack

- Next.js + React + TypeScript
- Tailwind CSS + shadcn/ui
- All model math implemented from scratch in TypeScript (no ML library dependencies)
