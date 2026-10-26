/**
 * Script 11: Profile 2026 Mock Draft Prospects Against Historical Red Flags
 *
 * For each prospect, compares their stats against the historical bust/survivor
 * averages for their position × draft range bucket.
 *
 * Outputs: data/2026-profiles.json
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLEGE_DIR = path.join(DATA_DIR, 'raw', 'college-2026');
const MOCK_PATH = path.join(DATA_DIR, 'raw', 'drafts', '2026-mock.json');
const SUCCESS_PATH = path.join(DATA_DIR, 'success-analysis.json');
const OUTPUT_PATH = path.join(DATA_DIR, '2026-profiles.json');

interface MockPick {
  pick: number;
  name: string;
  school: string;
  position: string;
}

type PosGroup = 'Guard' | 'Wing' | 'Big';
type DraftRange = 'Top 5' | 'Lottery (6-14)' | 'Late 1st (15-30)' | '2nd Round (31-60)';

function posGroup(pos: string): PosGroup {
  if (pos === 'PG' || pos === 'SG') return 'Guard';
  if (pos === 'SF') return 'Wing';
  return 'Big';
}

function draftRange(pick: number): DraftRange {
  if (pick <= 5) return 'Top 5';
  if (pick <= 14) return 'Lottery (6-14)';
  if (pick <= 30) return 'Late 1st (15-30)';
  return '2nd Round (31-60)';
}

// ── Expected NBA Role Assignment ──
// If a prospect doesn't clearly map to a role, that's a red flag itself.

interface RoleResult {
  role: string;
  confidence: 'clear' | 'fuzzy';
  detail: string;
}

function assignExpectedRole(
  group: PosGroup,
  per40: { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; fta: number },
  stats: {
    ftPct: number; threePtPct: number; trueShootingPct: number;
    mpg: number; usageRate: number; boxPlusMinus: number;
    threePM: number; assistToTurnover: number;
  },
): RoleResult {
  if (group === 'Guard') {
    const isPlaymaker = per40.ast >= 5.0 && stats.assistToTurnover >= 1.3;
    const isShooter = stats.threePtPct >= 0.36 && stats.ftPct >= 0.78;
    const isScorer = per40.pts >= 22 && stats.usageRate >= 25;
    const isDefender = per40.stl >= 1.8;
    const isEfficient = stats.trueShootingPct >= 0.56;

    if (isPlaymaker && isScorer && isEfficient)
      return { role: 'Lead Guard', confidence: 'clear', detail: 'Creates for self and others efficiently — projects as primary ball-handler' };
    if (isPlaymaker && isEfficient)
      return { role: 'Floor General', confidence: 'clear', detail: 'High assist rate with good decision-making — projects as a setup man' };
    if (isScorer && isShooter)
      return { role: 'Scoring Guard', confidence: 'clear', detail: 'Volume scorer with shooting touch — projects as a go-to offensive option' };
    if (isShooter && isDefender)
      return { role: '3&D Guard', confidence: 'clear', detail: 'Can shoot and defend — the most in-demand guard profile in the NBA' };
    if (isScorer && isDefender)
      return { role: 'Two-Way Guard', confidence: 'clear', detail: 'Scores and defends — versatile backcourt piece' };
    if (isShooter)
      return { role: 'Spot-Up Shooter', confidence: 'clear', detail: 'Floor spacer — will need to shoot to stay on the floor' };
    if (isPlaymaker)
      return { role: 'Playmaker', confidence: 'clear', detail: 'Pass-first guard — value depends on finding shooters around him' };
    if (isScorer && isEfficient)
      return { role: 'Combo Guard', confidence: 'clear', detail: 'Efficient high-usage scorer — can create his own shot and contributes across the board' };
    if (isScorer && !isEfficient)
      return { role: 'Volume Scorer', confidence: 'fuzzy', detail: 'Scores on high usage but without efficiency — role unclear at next level' };
    if (isDefender)
      return { role: 'Defensive Guard', confidence: 'fuzzy', detail: 'Active hands but no clear offensive role — needs a skill to stick' };

    // Tweener check
    return { role: 'Undefined', confidence: 'fuzzy', detail: 'No clear NBA role — not a clear playmaker, scorer, or shooter' };
  }

  if (group === 'Wing') {
    const isShooter = stats.threePtPct >= 0.35 && stats.ftPct >= 0.75;
    const isDefender = per40.stl >= 1.3 || per40.blk >= 1.0;
    const isScorer = per40.pts >= 20 && stats.usageRate >= 24;
    const isPlaymaker = per40.ast >= 3.0 && stats.assistToTurnover >= 1.2;
    const isStarter = stats.mpg >= 28;
    const isEfficient = stats.trueShootingPct >= 0.55;

    if (isScorer && isShooter && isDefender)
      return { role: 'Two-Way Wing', confidence: 'clear', detail: 'Scores, shoots, and defends — premium NBA archetype' };
    if (isShooter && isDefender)
      return { role: '3&D Wing', confidence: 'clear', detail: 'Can shoot and defend — the most reliable wing archetype for NBA longevity' };
    if (isScorer && isPlaymaker && isEfficient)
      return { role: 'Point Forward', confidence: 'clear', detail: 'Creates for self and others from the wing — high-value versatility' };
    if (isScorer && isShooter)
      return { role: 'Scoring Wing', confidence: 'clear', detail: 'Volume scorer with shooting range — projects as an offensive weapon' };
    if (isScorer && isDefender)
      return { role: 'Two-Way Wing', confidence: 'clear', detail: 'Scores and defends without elite shooting — upside depends on shot development' };
    if (isShooter)
      return { role: 'Floor Spacer', confidence: 'clear', detail: 'Shooting specialist from the wing — defined role as a spacer' };
    if (isDefender && isStarter)
      return { role: 'Defensive Wing', confidence: 'clear', detail: 'Defends and earns minutes — offense will determine ceiling' };
    if (isScorer && !isEfficient)
      return { role: 'Volume Scorer', confidence: 'fuzzy', detail: 'Puts up points but without efficiency — may struggle to score at NBA level' };
    if (!isStarter)
      return { role: 'Undefined', confidence: 'fuzzy', detail: 'Could not earn starter minutes in college — role at next level is unclear' };

    return { role: 'Undefined', confidence: 'fuzzy', detail: 'No clear offensive skill plus no elite defensive profile — tweener risk' };
  }

  // Big
  const isRimProtector = per40.blk >= 2.5;
  const hasActiveHands = per40.stl >= 1.2;
  const canPass = per40.ast >= 1.5 && stats.assistToTurnover >= 0.6;
  const canShoot = stats.threePtPct >= 0.33 && stats.ftPct >= 0.70;
  const isScorer = per40.pts >= 20;
  const isRebounder = per40.reb >= 12;
  const isEfficient = stats.trueShootingPct >= 0.58;
  const lowFT = stats.ftPct > 0 && stats.ftPct < 0.60;

  if (isRimProtector && hasActiveHands && (canPass || canShoot))
    return { role: 'Switchable Big', confidence: 'clear', detail: 'Protects the rim, active hands, and has a secondary skill — modern big archetype' };
  if (canShoot && hasActiveHands)
    return { role: 'Stretch Big', confidence: 'clear', detail: 'Can shoot and switch — spaces the floor while contributing defensively' };
  if (isScorer && isEfficient && canPass)
    return { role: 'Scoring Big', confidence: 'clear', detail: 'Efficient scorer who can create — projects as an offensive hub' };
  if (isRimProtector && isRebounder && (canPass || hasActiveHands))
    return { role: 'Anchor Big', confidence: 'clear', detail: 'Elite rim protector and rebounder with enough secondary skills to stick' };
  if (canShoot && isScorer)
    return { role: 'Stretch Scorer', confidence: 'clear', detail: 'Shoots and scores — offensive-minded big with floor spacing' };
  if (hasActiveHands && isRebounder)
    return { role: 'Energy Big', confidence: 'clear', detail: 'Hustle player with active hands and boards — earns minutes through effort' };
  if (isRimProtector && !hasActiveHands && !canPass && !canShoot)
    return { role: 'Rim-Only Big', confidence: 'fuzzy', detail: 'Shot-blocking specialist with no secondary skill — one-dimensional bigs bust at elevated rates' };
  if (isScorer && lowFT && !canShoot)
    return { role: 'Post Scorer', confidence: 'fuzzy', detail: 'Scores inside but poor FT% and no range — limited in modern NBA spacing' };
  if (!isRimProtector && !canShoot && !hasActiveHands && !isScorer)
    return { role: 'Undefined', confidence: 'fuzzy', detail: 'No clear defensive anchor role, no shooting, no active hands — unclear NBA path' };

  return { role: 'Role Big', confidence: 'clear', detail: 'Solid but not elite in any one area — projects as a rotation piece' };
}

function main() {
  const mock: MockPick[] = JSON.parse(fs.readFileSync(MOCK_PATH, 'utf-8'));
  const success = JSON.parse(fs.readFileSync(SUCCESS_PATH, 'utf-8'));

  // Load scraped college data
  const collegeFiles = fs.existsSync(COLLEGE_DIR)
    ? fs.readdirSync(COLLEGE_DIR).filter((f) => f.endsWith('.json'))
    : [];

  const collegeByName = new Map<string, any>();
  for (const f of collegeFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(COLLEGE_DIR, f), 'utf-8'));
    collegeByName.set(data.name, data);
  }

  // Build lookup for bust rates and red flags
  const bustRateMap = new Map<string, any>();
  for (const b of success.bustRates) {
    bustRateMap.set(`${b.position}-${b.range}`, b);
  }

  const redFlagMap = new Map<string, any>();
  for (const rf of success.redFlags) {
    redFlagMap.set(`${rf.position}-${rf.range}`, rf);
  }

  // Historical success markers by position
  const markerMap = new Map<string, any[]>();
  for (const sm of success.successMarkers) {
    markerMap.set(sm.position, sm.markers);
  }

  // Profile each prospect
  const profiles: any[] = [];

  for (const p of mock) {
    const college = collegeByName.get(p.name);
    const group = posGroup(p.position);
    const range = draftRange(p.pick);
    const key = `${group}-${range}`;

    const bustRate = bustRateMap.get(key);
    const redFlags = redFlagMap.get(key);
    const markers = markerMap.get(group) || [];

    const profile: any = {
      pick: p.pick,
      name: p.name,
      school: p.school,
      position: p.position,
      posGroup: group,
      range,
      hasCollegeData: !!college,
      historicalBustRate: bustRate ? bustRate.bustRate : null,
      historicalMedianGames: bustRate ? bustRate.medianGames : null,
    };

    if (!college) {
      profile.flags = [];
      profile.greenLights = [];
      profile.summary = 'No college data available';
      profiles.push(profile);
      continue;
    }

    // Use latest season (or only season for freshmen)
    // Filter out bad slug matches (classYear > 3 for freshmen is suspicious)
    const lastSeason = college.seasons[college.seasons.length - 1];
    const classYear = college.classYear;

    // Flag if data looks wrong
    if (classYear > 3) {
      profile.dataWarning = `${classYear} seasons found — possible wrong player match`;
    }

    profile.stats = {
      ppg: lastSeason.pts,
      rpg: lastSeason.reb,
      apg: lastSeason.ast,
      spg: lastSeason.stl,
      bpg: lastSeason.blk,
      tov: lastSeason.tov,
      mpg: lastSeason.minutesPerGame,
      ftPct: lastSeason.ftPct,
      fgPct: lastSeason.fgPct,
      threePtPct: lastSeason.threePtPct,
      fta: lastSeason.fta,
      threePM: lastSeason.threePM,
      gamesPlayed: lastSeason.gamesPlayed,
      usageRate: lastSeason.usageRate,
      boxPlusMinus: lastSeason.boxPlusMinus,
      winSharesPer40: lastSeason.winSharesPer40,
      trueShootingPct: lastSeason.trueShootingPct,
      classYear,
    };

    // Per-40 minute stats
    const mpg = lastSeason.minutesPerGame || 1;
    const per40 = (stat: number) => (stat / mpg) * 40;
    profile.per40 = {
      pts: per40(lastSeason.pts),
      reb: per40(lastSeason.reb),
      ast: per40(lastSeason.ast),
      stl: per40(lastSeason.stl),
      blk: per40(lastSeason.blk),
      tov: per40(lastSeason.tov),
      fta: per40(lastSeason.fta),
    };
    profile.assistToTurnover = lastSeason.tov > 0
      ? lastSeason.ast / lastSeason.tov
      : lastSeason.ast;

    // ── Expected NBA Role ──
    const roleResult = assignExpectedRole(
      group,
      profile.per40,
      {
        ftPct: lastSeason.ftPct || 0,
        threePtPct: lastSeason.threePtPct || 0,
        trueShootingPct: lastSeason.trueShootingPct || 0,
        mpg: lastSeason.minutesPerGame || 0,
        usageRate: lastSeason.usageRate || 0,
        boxPlusMinus: lastSeason.boxPlusMinus || 0,
        threePM: lastSeason.threePM || 0,
        assistToTurnover: profile.assistToTurnover,
      },
    );
    profile.expectedRole = roleResult.role;
    profile.roleConfidence = roleResult.confidence;
    profile.roleDetail = roleResult.detail;

    // Compare against red flags for their bucket
    const flags: Array<{ label: string; value: string; comparison: string; severity: string; detail: string }> = [];
    const greenLights: Array<{ label: string; value: string; comparison: string; detail: string }> = [];

    if (redFlags) {
      for (const f of redFlags.flags) {
        let playerVal: number | null = null;

        // Map flag labels to player stats
        switch (f.label) {
          case 'FT%': playerVal = lastSeason.ftPct; break;
          case 'True Shooting %': playerVal = lastSeason.trueShootingPct; break;
          case '3PT%': playerVal = lastSeason.threePtPct; break;
          case 'AST/TO': playerVal = profile.assistToTurnover; break;
          case 'PTS/40': playerVal = profile.per40.pts; break;
          case 'Usage Rate': playerVal = lastSeason.usageRate; break;
          case 'MPG': playerVal = lastSeason.minutesPerGame; break;
          case 'STL/40': playerVal = profile.per40.stl; break;
          case 'Box +/-': playerVal = lastSeason.boxPlusMinus; break;
          case 'Win Shares/40': playerVal = lastSeason.winSharesPer40; break;
        }

        if (playerVal == null || playerVal === 0) continue;

        // Skip 3PT% if player barely shoots threes (< 1 attempt per game)
        if (f.label === '3PT%' && lastSeason.threePM < 0.5) continue;

        const isPct = f.isPct;
        // Use more decimal places for small-magnitude stats like WS/40
        const fmtVal = (v: number) => {
          if (isPct) return (v * 100).toFixed(1) + '%';
          if (Math.abs(v) < 1) return v.toFixed(3);
          return v.toFixed(1);
        };

        // Is this player closer to the bust avg or the survivor avg?
        const bustDist = Math.abs(playerVal - f.bustAvg);
        const survDist = Math.abs(playerVal - f.survivorAvg);

        // For stats where higher is better (most), being below bust avg is a red flag
        // For stats where lower is better (age, TOV, lane agility), being above bust avg is a red flag
        const higherIsBetter = !['Lane Agility', 'Shuttle Run', 'Sprint'].includes(f.label);

        // Skip markers where bust avg >= survivor avg (stat doesn't separate busts from survivors)
        if (higherIsBetter && f.bustAvg >= f.survivorAvg) continue;
        if (!higherIsBetter && f.bustAvg <= f.survivorAvg) continue;

        if (higherIsBetter) {
          if (playerVal < f.bustAvg) {
            flags.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              severity: 'high',
              detail: `Below even the bust average for ${group} ${range}`,
            });
          } else if (bustDist < survDist) {
            flags.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              severity: 'medium',
              detail: `Closer to bust average than survivor average`,
            });
          } else {
            greenLights.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              detail: `At or above survivor average`,
            });
          }
        } else {
          // Lower is better (e.g., Lane Agility, Shuttle Run, Sprint)
          if (playerVal > f.bustAvg) {
            flags.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              severity: 'high',
              detail: `Above even the bust average for ${group} ${range} (lower is better)`,
            });
          } else if (bustDist < survDist) {
            flags.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              severity: 'medium',
              detail: `Closer to bust average than survivor average (lower is better)`,
            });
          } else {
            greenLights.push({
              label: f.label,
              value: fmtVal(playerVal),
              comparison: `Bust avg: ${fmtVal(f.bustAvg)}, Survivor avg: ${fmtVal(f.survivorAvg)}`,
              detail: `At or below survivor average (lower is better)`,
            });
          }
        }
      }
    }

    // Additional universal flags

    // Age flag: use classYear as proxy (Fr=19, So=20, Jr=21, Sr=22, 5th=23)
    const estAge = 18 + classYear;
    profile.stats.estimatedAge = estAge;
    if (p.pick <= 14 && estAge >= 22) {
      flags.push({
        label: 'Old for Lottery',
        value: `~${estAge} years old (${classYear === 1 ? 'Fr' : classYear === 2 ? 'So' : classYear === 3 ? 'Jr' : classYear === 4 ? 'Sr' : classYear + 'yr'})`,
        comparison: 'Age at draft correlates -0.26 with NBA career length for guards',
        severity: 'high',
        detail: 'Older lottery picks have less development upside and higher bust rates historically',
      });
    } else if (p.pick <= 30 && estAge >= 23) {
      flags.push({
        label: 'Old for 1st Round',
        value: `~${estAge} years old (${classYear === 1 ? 'Fr' : classYear === 2 ? 'So' : classYear === 3 ? 'Jr' : classYear === 4 ? 'Sr' : classYear + 'yr'})`,
        comparison: 'Age at draft correlates -0.26 with NBA career length for guards',
        severity: 'medium',
        detail: 'Older first-rounders have less room for growth',
      });
    }

    // FT% < 65% for any position in top 14 = red flag
    if (p.pick <= 14 && lastSeason.ftPct > 0 && lastSeason.ftPct < 0.65) {
      flags.push({
        label: 'FT% Critical',
        value: (lastSeason.ftPct * 100).toFixed(1) + '%',
        comparison: 'Historical average for lottery picks: ~75%',
        severity: 'high',
        detail: 'Sub-65% FT shooters in the lottery bust at elevated rates across all positions',
      });
    }

    // Usage rate > 28 without proportional scoring (volume concern)
    if (lastSeason.usageRate > 28 && lastSeason.trueShootingPct && lastSeason.trueShootingPct < 0.54) {
      flags.push({
        label: 'High Volume / Low Efficiency',
        value: `USG: ${lastSeason.usageRate?.toFixed(1)}, TS%: ${(lastSeason.trueShootingPct * 100).toFixed(1)}%`,
        comparison: 'High usage (>28) with below-average efficiency (<54% TS)',
        severity: 'medium',
        detail: 'College volume scorers with poor efficiency often struggle in NBA',
      });
    }

    // Low minutes (< 25 MPG) for a lottery pick
    if (p.pick <= 14 && lastSeason.minutesPerGame > 0 && lastSeason.minutesPerGame < 25) {
      flags.push({
        label: 'Low Minutes',
        value: lastSeason.minutesPerGame.toFixed(1) + ' MPG',
        comparison: 'Lottery picks typically play 28+ MPG in college',
        severity: 'medium',
        detail: `Not a full-time starter — concerning for a pick this high`,
      });
    }

    // Non-shooter flag: wing/forward in the 1st round who barely attempts 3s
    if (p.pick <= 30 && (group === 'Wing' || group === 'Big') && lastSeason.threePM < 0.5) {
      flags.push({
        label: 'Non-Shooter',
        value: `${lastSeason.threePM.toFixed(1)} 3PM/g${lastSeason.threePtPct > 0 ? ', ' + (lastSeason.threePtPct * 100).toFixed(1) + '% 3PT' : ''}`,
        comparison: 'Modern NBA wings/forwards need to space the floor',
        severity: p.pick <= 14 ? 'high' : 'medium',
        detail: 'Barely attempts threes — limits offensive versatility and floor spacing at the next level',
      });
    }

    // Fuzzy role = red flag (no clear NBA role)
    if (roleResult.confidence === 'fuzzy') {
      flags.push({
        label: 'Unclear NBA Role',
        value: roleResult.role,
        comparison: 'Players with a clear, definable NBA role survive at higher rates',
        severity: p.pick <= 14 ? 'high' : 'medium',
        detail: roleResult.detail,
      });
    }

    // FT% > 80% = green light
    if (lastSeason.ftPct >= 0.80) {
      greenLights.push({
        label: 'FT% Elite',
        value: (lastSeason.ftPct * 100).toFixed(1) + '%',
        comparison: '80%+ FT shooters have lower bust rates historically',
        detail: 'Strong FT% is the most translatable shooting stat',
      });
    }

    // STL/40 > 1.5 = green light for guards/wings
    if ((group === 'Guard' || group === 'Wing') && profile.per40.stl > 1.5) {
      greenLights.push({
        label: 'Active Hands',
        value: profile.per40.stl.toFixed(1) + ' STL/40',
        comparison: 'Above-average steal rate translates well to NBA',
        detail: 'Steals correlate with NBA longevity for perimeter players',
      });
    }

    // High BPM = green light
    if (lastSeason.boxPlusMinus && lastSeason.boxPlusMinus > 8) {
      greenLights.push({
        label: 'Impact Player',
        value: 'BPM: ' + lastSeason.boxPlusMinus.toFixed(1),
        comparison: 'BPM > 8 indicates an above-average college impact',
        detail: 'High box plus-minus reflects overall contribution beyond counting stats',
      });
    }

    // Summary
    const flagCount = flags.filter((f) => f.severity === 'high').length;
    const medFlagCount = flags.filter((f) => f.severity === 'medium').length;

    let summary = '';
    if (flagCount >= 2) summary = 'Multiple serious red flags — historically elevated bust risk';
    else if (flagCount === 1) summary = 'One major concern — worth monitoring';
    else if (medFlagCount >= 2) summary = 'Some yellow flags — profile has questions';
    else if (greenLights.length >= 3) summary = 'Strong profile — multiple markers of NBA success';
    else if (greenLights.length >= 1) summary = 'Clean profile — no major red flags';
    else summary = 'Limited data for comparison';

    profile.flags = flags;
    profile.greenLights = greenLights;
    profile.summary = summary;

    profiles.push(profile);
  }

  // Print summary
  console.log('2026 Mock Draft — Red Flag Profile Summary\n');
  for (const p of profiles) {
    if (!p.hasCollegeData) {
      console.log(`  #${String(p.pick).padStart(2)} ${p.name.padEnd(24)} ${p.posGroup.padEnd(6)} — No data`);
      continue;
    }
    const roleTag = p.expectedRole
      ? `[${p.expectedRole}${p.roleConfidence === 'fuzzy' ? ' ⚠' : ''}]`
      : '';
    const flagEmoji = p.flags.filter((f: any) => f.severity === 'high').length > 0 ? '🔴' :
      p.flags.filter((f: any) => f.severity === 'medium').length > 0 ? '🟡' : '🟢';
    console.log(
      `  #${String(p.pick).padStart(2)} ${p.name.padEnd(24)} ${p.posGroup.padEnd(6)} ${roleTag.padEnd(22)} ` +
      `${flagEmoji} ${p.flags.length} flags, ${p.greenLights.length} green — ${p.summary}`
    );
    if (p.dataWarning) console.log(`       ⚠️  ${p.dataWarning}`);
    for (const f of p.flags) {
      console.log(`       ${f.severity === 'high' ? '🔴' : '🟡'} ${f.label}: ${f.value} (${f.detail})`);
    }
    for (const g of p.greenLights) {
      console.log(`       🟢 ${g.label}: ${g.value}`);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), profiles }, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main();
