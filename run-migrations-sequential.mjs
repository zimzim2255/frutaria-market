import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql') && !file.endsWith('.SKIP'))
  .sort();

console.log('Found', migrationFiles.length, 'migrations to process');

for (const file of migrationFiles) {
  const filePath = path.join(migrationsDir, file);
  console.log(`\nProcessing migration: ${file}`);
  
  try {
    // Run the migration
    execSync(`supabase db push --debug`, { 
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_MIGRATION: file }
    });
    console.log(`✅ Migration ${file} completed successfully`);
  } catch (error) {
    console.log(`❌ Migration ${file} failed - skipping`);
    // Rename the file to SKIP so it won't be processed again
    const skipFile = file + '.SKIP';
    fs.renameSync(filePath, path.join(migrationsDir, skipFile));
    console.log(`Renamed to ${skipFile} to skip in future runs`);
  }
}

console.log('\nMigration process completed!');