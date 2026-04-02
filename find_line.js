const fs = require('fs');
const content = fs.readFileSync('supabase/functions/super-handler/index.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('/sales/') && line.includes('PUT')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});