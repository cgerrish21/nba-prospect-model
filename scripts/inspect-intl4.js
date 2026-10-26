const https = require('https');
const opts = { headers: { 'User-Agent': 'Mozilla/5.0 ProspectModel/1.0' } };

// Check İlyasova's NBA page
const url = 'https://www.basketball-reference.com/players/i/ilyaser01.html';
https.get(url, opts, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Find ALL links with 'international' in them
    const allIntl = [...data.matchAll(/href=["']([^"']*international[^"']*)["']/gi)];
    console.log('All international href matches:');
    allIntl.forEach(m => console.log(' ', m[1]));

    // Also search for the raw text pattern
    const rawMatches = [...data.matchAll(/international\/players\/[^"'\s<>]+/g)];
    console.log('\nRaw URL pattern matches:');
    rawMatches.forEach(m => console.log(' ', m[0]));

    // Check if the page mentions international at all
    const idx = data.indexOf('nternational');
    if (idx > -1) {
      console.log('\nContext:', data.substring(Math.max(0, idx - 100), idx + 200).replace(/<[^>]*>/g, '|'));
    }
  });
}).on('error', e => console.error(e.message));
