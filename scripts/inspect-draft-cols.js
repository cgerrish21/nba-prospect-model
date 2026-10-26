const https = require('https');
const url = 'https://www.basketball-reference.com/draft/NBA_2023.html';
const opts = { headers: { 'User-Agent': 'Mozilla/5.0 ProspectModel/1.0' } };
https.get(url, opts, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const tableMatch = data.match(/<table[^>]*id="stats"[^>]*>([\s\S]*?)<\/table>/) ||
                        data.match(/<table[^>]*id="draft"[^>]*>([\s\S]*?)<\/table>/) ||
                        data.match(/<table[^>]*id="picks"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) { console.log('No table found'); return; }

    // Get header data-stats
    const headerMatch = tableMatch[1].match(/<thead>([\s\S]*?)<\/thead>/);
    if (headerMatch) {
      const stats = [...headerMatch[1].matchAll(/data-stat="([^"]*)"/g)].map(m => m[1]);
      console.log('Header data-stats:', stats);
    }

    // Get first data row data-stats and values
    const tbodyIdx = tableMatch[1].indexOf('<tbody>');
    const tbody = tbodyIdx >= 0 ? tableMatch[1].substring(tbodyIdx) : tableMatch[1];
    const rows = [...tbody.matchAll(/<tr(?:(?!class="thead")[^>])*>([\s\S]*?)<\/tr>/g)];
    if (rows.length > 0) {
      const cells = [...rows[0][1].matchAll(/data-stat="([^"]*)"[^>]*>([^<]*)/g)];
      console.log('\nFirst row:');
      cells.forEach(c => console.log(`  ${c[1]}: [${c[2].trim()}]`));
    }
  });
});
