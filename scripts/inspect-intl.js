const https = require('https');
const url = 'https://www.basketball-reference.com/international/players/luka-doncic-1.html';
const opts = { headers: { 'User-Agent': 'Mozilla/5.0 ProspectModel/1.0' } };
https.get(url, opts, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Find table IDs
    const tableIds = [...data.matchAll(/id="([^"]*)"/g)].map(m => m[1]).filter(id =>
      id.includes('stats') || id.includes('per_game') || id.includes('totals') || id.includes('game')
    );
    console.log('Table IDs:', tableIds);

    // Try per_game
    let tableMatch = data.match(/<table[^>]*id="per_game"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) {
      // Try stats
      tableMatch = data.match(/<table[^>]*id="stats"[^>]*>([\s\S]*?)<\/table>/);
    }
    if (!tableMatch) {
      // Try any table with per_game in id
      tableMatch = data.match(/<table[^>]*id="[^"]*per_game[^"]*"[^>]*>([\s\S]*?)<\/table>/);
    }
    if (!tableMatch) {
      console.log('No matching table found, trying first table...');
      tableMatch = data.match(/<table[^>]*>([\s\S]*?)<\/table>/);
    }
    if (!tableMatch) {
      console.log('No tables at all');
      return;
    }

    // Print header row
    const headerMatch = tableMatch[1].match(/<thead>([\s\S]*?)<\/thead>/);
    if (headerMatch) {
      const headerCells = [...headerMatch[1].matchAll(/data-stat="([^"]*)"/g)].map(m => m[1]);
      console.log('\nHeader data-stats:', headerCells.join(', '));
    }

    // Print data rows
    const tbodyIdx = tableMatch[1].indexOf('<tbody>');
    const tbody = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx) : tableMatch[1];
    const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    console.log('\nData rows:', rows.length);

    rows.slice(0, 4).forEach((r, i) => {
      const cells = [...r[1].matchAll(/data-stat="([^"]*)"\s*[^>]*>(?:<[^>]*>)?([^<]*)/g)];
      console.log(`\nRow ${i}:`);
      cells.forEach(c => {
        if (c[2].trim()) console.log(`  ${c[1]}: ${c[2].trim()}`);
      });
    });
  });
});
