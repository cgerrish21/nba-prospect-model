const XLSX = require('xlsx');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'raw', 'combine', 'NBA Combine Data.xlsx');
const wb = XLSX.readFile(file);

console.log('Sheet names:', wb.SheetNames);
console.log(`Total sheets: ${wb.SheetNames.length}\n`);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`Sheet "${name}": ${data.length} rows`);
  if (data.length > 1) {
    console.log('  Headers:', data[0]);
    console.log('  First row:', data[1]);
  }
  console.log();
}
