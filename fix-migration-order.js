/**
 * Fix migration file ordering
 * Rename migrations to proper sequential ordering
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'supabase', 'migrations');

const migrations = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql') && !f.endsWith('.SKIP'))
  .sort();

const nameToNum = (name) => {
  const num = name.match(/^(\d+)/);
  if (!num) return 9999;
  return parseInt(num[1], 10);
};

migrations.sort((a, b) => nameToNum(a) - nameToNum(b));

console.log('Correct order:');
migrations.forEach((m, i) => {
  const num = (i + 1).toString().padStart(3, '0');
  const newName = m.replace(/^\d+_/, num + '_');
  if (newName !== m) {
    const oldPath = path.join(MIGRATIONS_DIR, m);
    const newPath = path.join(MIGRATIONS_DIR, newName);
    console.log(`${m} -> ${newName}`);
    fs.renameSync(oldPath, newPath);
  }
});

console.log('\nDone!');