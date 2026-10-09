const fs = require('fs');
const path = require('path');

function searchDir(dir, pattern, results = []) {
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.next' || f === '.git') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full, pattern, results);
    } else if (/\.(ts|tsx|js)$/.test(f)) {
      const content = fs.readFileSync(full, 'utf8');
      if (pattern.test(content)) results.push(full);
    }
  }
  return results;
}

console.log('--- Files importing SlotStatus or UpdatedBy ---');
console.log(searchDir('app', /import.*(SlotStatus|UpdatedBy).*from/));
console.log(searchDir('ws-server', /import.*(SlotStatus|UpdatedBy).*from/));

console.log('\n--- Files using parkingLot relation ---');
console.log(searchDir('app', /parkingLot\b/));

console.log('\n--- Files using slotStatusLog ---');
console.log(searchDir('app', /slotStatusLog\b/));
console.log(searchDir('ws-server', /slotStatusLog\b/));
