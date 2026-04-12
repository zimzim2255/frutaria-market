/**
 * Migration Runner
 * Pushes pending migrations to the Supabase database
 * Does NOT automatically unskip .SKIP files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'supabase', 'migrations');

console.log('Starting migration runner...\n');

const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql') && !f.endsWith('.SKIP'))
  .sort();

console.log(`Found ${migrationFiles.length} pending migrations to push\n`);

if (migrationFiles.length === 0) {
  console.log('No migrations to push!');
  process.exit(0);
}

console.log('Pushing migrations with supabase db push --include-all --yes...\n');

try {
  execSync(
    `supabase db push --include-all --yes`,
    { stdio: 'inherit' }
  );
  console.log('\nAll migrations pushed successfully!');
} catch (error) {
  console.error('\nMigration push failed');
  process.exit(1);
}