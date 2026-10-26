/**
 * Height/weight-adjusted combine analysis.
 * For each athletic metric, regress out height + weight to get a residual:
 * "how much better/worse than expected for your size?"
 * Then correlate that residual with meaningful NBA seasons.
 */

const fs = require('fs');
const path = require('path');

const records = require('../data/dataset.json');

function loadMinutes(slug) {
  const p = path.join(__dirname, '..', 'data', 'raw', 'nba', slug + '.json');
  if (!fs.existsSync(p)) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return (d.seasons || [])
    .filter(s => s.season && s.season.match(/^\d{4}-\d{2}$/) && s.team)
    .map(s => ({ totalMin: Math.round((s.minutesPerGame || 0) * (s.gamesPlayed || 0)) }));
}

const players = records.filter(r => r.draftYear <= 2020).map(r => {
  const mins = loadMinutes(r.slug);
  return { ...r, meaningfulSeasons: mins.filter(m => m.totalMin >= 900).length };
});

function corr(x, y) {
  const n = x.length;
  if (n < 10) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

// OLS regression: val = b0 + b1*height + b2*weight, return residuals (z-scored)
function residualsAfterHW(vals, heights, weights) {
  const n = vals.length;
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const sd = (arr, m) => Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);

  const mV = mean(vals), sV = sd(vals, mV);
  const mH = mean(heights), sH = sd(heights, mH);
  const mW = mean(weights), sW = sd(weights, mW);

  if (sV === 0 || sH === 0 || sW === 0) return vals.map(() => 0);

  const zV = vals.map(v => (v - mV) / sV);
  const zH = heights.map(v => (v - mH) / sH);
  const zW = weights.map(v => (v - mW) / sW);

  let hh = 0, ww = 0, hw = 0, hv = 0, wv = 0;
  for (let i = 0; i < n; i++) {
    hh += zH[i] * zH[i]; ww += zW[i] * zW[i]; hw += zH[i] * zW[i];
    hv += zH[i] * zV[i]; wv += zW[i] * zV[i];
  }
  const det = hh * ww - hw * hw;
  if (Math.abs(det) < 1e-10) return zV;
  const b1 = (ww * hv - hw * wv) / det;
  const b2 = (hh * wv - hw * hv) / det;

  return zV.map((v, i) => v - b1 * zH[i] - b2 * zW[i]);
}

const athleticKeys = [
  { key: 'laneAgility', label: 'Lane Agility', lower: true },
  { key: 'shuttleRun', label: 'Shuttle Run', lower: true },
  { key: 'sprint', label: '3/4 Sprint', lower: true },
  { key: 'standingVertical', label: 'Standing Vert', lower: false },
  { key: 'maxVertical', label: 'Max Vert', lower: false },
  { key: 'benchPress', label: 'Bench Press', lower: false },
  { key: 'handLength', label: 'Hand Length', lower: false },
  { key: 'handWidth', label: 'Hand Width', lower: false },
];

function analyzeGroup(label, bucket) {
  console.log('\n' + '='.repeat(80));
  console.log(label + ' (n=' + bucket.length + ')');
  console.log('='.repeat(80));
  console.log(
    'Metric'.padEnd(28) +
    'Raw r'.padStart(8) +
    'Adj r'.padStart(9) +
    'N'.padStart(6) +
    'Starter adj'.padStart(13) +
    'Bust adj'.padStart(11)
  );
  console.log('-'.repeat(80));

  const results = [];

  for (const { key, label: metricLabel, lower } of athleticKeys) {
    const pairs = bucket.filter(p => {
      const v = Number(p.features[key]);
      const h = Number(p.features.heightInches);
      const w = Number(p.features.weightLbs);
      return v > 0 && h > 0 && w > 0;
    });
    if (pairs.length < 20) continue;

    const vals = pairs.map(p => Number(p.features[key]));
    const heights = pairs.map(p => Number(p.features.heightInches));
    const weights = pairs.map(p => Number(p.features.weightLbs));
    const seasons = pairs.map(p => p.meaningfulSeasons);

    const rawR = corr(vals, seasons);

    let residuals = residualsAfterHW(vals, heights, weights);
    // Flip lower-is-better so positive residual = better than expected
    if (lower) residuals = residuals.map(r => -r);

    const adjR = corr(residuals, seasons);

    const starters = [], busts = [];
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].meaningfulSeasons >= 5) starters.push(residuals[i]);
      if (pairs[i].meaningfulSeasons <= 1) busts.push(residuals[i]);
    }
    const sAvg = starters.length > 0 ? starters.reduce((s, v) => s + v, 0) / starters.length : 0;
    const bAvg = busts.length > 0 ? busts.reduce((s, v) => s + v, 0) / busts.length : 0;

    results.push({ label: metricLabel, rawR, adjR, n: pairs.length, sAvg, bAvg });
  }

  // Composite: average of sprint + agility + vert residuals
  const compositeKeys = ['sprint', 'laneAgility', 'maxVertical', 'standingVertical'];
  const compositePairs = bucket.filter(p =>
    compositeKeys.every(k => Number(p.features[k]) > 0) &&
    Number(p.features.heightInches) > 0 &&
    Number(p.features.weightLbs) > 0
  );

  if (compositePairs.length >= 20) {
    const allResiduals = compositeKeys.map(key => {
      const vals = compositePairs.map(p => Number(p.features[key]));
      const heights = compositePairs.map(p => Number(p.features.heightInches));
      const weights = compositePairs.map(p => Number(p.features.weightLbs));
      let res = residualsAfterHW(vals, heights, weights);
      if (key === 'sprint' || key === 'laneAgility') res = res.map(r => -r);
      return res;
    });

    const composite = compositePairs.map((_, i) =>
      allResiduals.reduce((s, res) => s + res[i], 0) / allResiduals.length
    );

    const seasons = compositePairs.map(p => p.meaningfulSeasons);
    const compR = corr(composite, seasons);

    const starters = [], busts = [];
    for (let i = 0; i < compositePairs.length; i++) {
      if (compositePairs[i].meaningfulSeasons >= 5) starters.push(composite[i]);
      if (compositePairs[i].meaningfulSeasons <= 1) busts.push(composite[i]);
    }
    const sAvg = starters.length > 0 ? starters.reduce((s, v) => s + v, 0) / starters.length : 0;
    const bAvg = busts.length > 0 ? busts.reduce((s, v) => s + v, 0) / busts.length : 0;

    results.push({ label: '>> COMPOSITE ATHLETIC <<', rawR: 0, adjR: compR, n: compositePairs.length, sAvg, bAvg });
  }

  // Wingspan - height residual (pure length advantage)
  const wsPairs = bucket.filter(p =>
    Number(p.features.wingspanInches) > 0 && Number(p.features.heightInches) > 0
  );
  if (wsPairs.length >= 20) {
    const ws = wsPairs.map(p => Number(p.features.wingspanInches));
    const ht = wsPairs.map(p => Number(p.features.heightInches));
    const seasons = wsPairs.map(p => p.meaningfulSeasons);
    // Simple: wingspan minus height (how much longer are your arms than you are tall)
    const wsAdv = ws.map((w, i) => w - ht[i]);
    const rawR = corr(ws, seasons);
    const adjR = corr(wsAdv, seasons);
    const starters = [], busts = [];
    for (let i = 0; i < wsPairs.length; i++) {
      if (wsPairs[i].meaningfulSeasons >= 5) starters.push(wsAdv[i]);
      if (wsPairs[i].meaningfulSeasons <= 1) busts.push(wsAdv[i]);
    }
    const sAvg = starters.length > 0 ? starters.reduce((s, v) => s + v, 0) / starters.length : 0;
    const bAvg = busts.length > 0 ? busts.reduce((s, v) => s + v, 0) / busts.length : 0;
    results.push({ label: '>> WINGSPAN - HEIGHT <<', rawR, adjR, n: wsPairs.length, sAvg, bAvg });
  }

  results.sort((a, b) => Math.abs(b.adjR) - Math.abs(a.adjR));

  for (const r of results) {
    const flag = Math.abs(r.adjR) >= 0.15 ? ' **' : Math.abs(r.adjR) >= 0.10 ? ' *' : '';
    console.log(
      r.label.padEnd(28) +
      (r.rawR >= 0 ? '+' : '') + r.rawR.toFixed(3).padStart(7) +
      (r.adjR >= 0 ? '  +' : '  ') + r.adjR.toFixed(3).padStart(7) +
      String(r.n).padStart(6) +
      (r.sAvg >= 0 ? '  +' : '  ') + r.sAvg.toFixed(2).padStart(10) +
      (r.bAvg >= 0 ? '  +' : '  ') + r.bAvg.toFixed(2).padStart(8) +
      flag
    );
  }
}

function assignPos(p) {
  const h = Number(p.features.heightInches) || 0;
  const a = Number(p.features.astPer40) || 0;
  const r = Number(p.features.rebPer40) || 0;
  const b = Number(p.features.blkPer40) || 0;
  if (h >= 81 || (r >= 10 && b >= 2)) return 'Big';
  if (h <= 76 || (a >= 5 && r < 7 && h < 79)) return 'Guard';
  return 'Wing';
}

analyzeGroup('ALL POSITIONS', players);
analyzeGroup('GUARDS', players.filter(p => assignPos(p) === 'Guard'));
analyzeGroup('WINGS', players.filter(p => assignPos(p) === 'Wing'));
analyzeGroup('BIGS', players.filter(p => assignPos(p) === 'Big'));
