const fs = require('fs');
const path = require('path');
const dataset = JSON.parse(fs.readFileSync('./data/dataset.json', 'utf-8'));
const dir = './data/raw/nba';

const results = [];
for (const entry of dataset) {
  if (entry.draftYear > 2020) continue;
  const nbaPath = path.join(dir, entry.slug + '.json');
  if (!fs.existsSync(nbaPath)) continue;
  const d = JSON.parse(fs.readFileSync(nbaPath, 'utf-8'));

  const realSeasons = d.seasons.filter(s => s.season.match(/^\d{4}-\d{2}$/) && s.team && s.team !== '');

  let totalMin = 0;
  let totalGames = 0;
  const seasonMins = [];
  for (const s of realSeasons) {
    const min = (s.minutesPerGame || 0) * (s.gamesPlayed || 0);
    totalMin += min;
    totalGames += s.gamesPlayed || 0;
    seasonMins.push(Math.round(min));
  }

  results.push({
    name: d.name,
    pick: entry.pick,
    year: entry.draftYear,
    seasons: realSeasons.length,
    totalGames,
    totalMin: Math.round(totalMin),
    minPerSeason: realSeasons.length > 0 ? Math.round(totalMin / realSeasons.length) : 0,
    seasonMins,
  });
}

const refs = ['Jrue Holiday', 'Draymond Green', 'Luka Doncic', 'Kyle Kuzma', 'Marcus Smart',
  'Tim Hardaway Jr', 'Patty Mills', 'DeMarre Carroll', 'Reggie Bullock', 'Pat Connaughton',
  'Kevon Looney', 'Georges Niang', 'Isaiah Hartenstein', 'Robert Williams',
  'Markelle Fultz', 'Jimmer Fredette', 'Adam Morrison', 'James Wiseman', 'Jarrett Culver',
  'Bol Bol', 'Hasheem Thabeet', 'Greg Oden', 'Anthony Bennett', 'Sekou Doumbouya'];

console.log('Name'.padEnd(24) + 'Pick'.padStart(4) + ' Year' + ' Szns' + '  Career' + ' Min/Szn' + '  | Season-by-season minutes');
console.log('-'.repeat(140));

for (const ref of refs) {
  const p = results.find(r => r.name.toLowerCase().includes(ref.toLowerCase()));
  if (!p) continue;
  const seasonStr = p.seasonMins.map(m => String(m).padStart(6)).join('');
  console.log(
    p.name.padEnd(24) +
    String(p.pick).padStart(4) +
    String(p.year).padStart(5) +
    String(p.seasons).padStart(5) +
    String(p.totalMin).padStart(8) +
    String(p.minPerSeason).padStart(8) +
    '  |' + seasonStr
  );
}
