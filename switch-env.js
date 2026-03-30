#!/usr/bin/env node

/**
 * Environment Switcher Script
 * 
 * This script allows you to easily switch between development and production
 * environment configurations.
 * 
 * Usage:
 *   node switch-env.js dev      - Switch to development environment
 *   node switch-env.js prod     - Switch to production environment
 *   node switch-env.js status   - Show current environment
 * 
 * Or use npm scripts:
 *   npm run env:dev            - Switch to development environment
 *   npm run env:prod           - Switch to production environment
 *   npm run env:status         - Show current environment
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = '.env';
const DEV_ENV_FILE = '.env.development';
const PROD_ENV_FILE = '.env.production';

function getCurrentEnvironment() {
  try {
    if (!fs.existsSync(ENV_FILE)) {
      return 'none';
    }
    
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const envModeMatch = envContent.match(/VITE_ENV_MODE=(.+)/);
    
    if (envModeMatch) {
      return envModeMatch[1].trim();
    }
    
    return 'unknown';
  } catch (error) {
    return 'error';
  }
}

function switchEnvironment(env) {
  const sourceFile = env === 'dev' ? DEV_ENV_FILE : PROD_ENV_FILE;
  const targetEnv = env === 'dev' ? 'development' : 'production';
  
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Error: ${sourceFile} not found!`);
    console.log(`Please create ${sourceFile} first.`);
    process.exit(1);
  }
  
  try {
    // Copy the environment file
    const content = fs.readFileSync(sourceFile, 'utf8');
    fs.writeFileSync(ENV_FILE, content);
    
    console.log(`✅ Successfully switched to ${targetEnv} environment!`);
    console.log(`📁 Copied ${sourceFile} to ${ENV_FILE}`);
    console.log(`\nCurrent environment variables:`);
    console.log(content);
    
  } catch (error) {
    console.error(`❌ Error switching environment: ${error.message}`);
    process.exit(1);
  }
}

function showStatus() {
  const currentEnv = getCurrentEnvironment();
  
  console.log('📊 Environment Status');
  console.log('====================');
  console.log(`Current environment: ${currentEnv}`);
  
  if (fs.existsSync(ENV_FILE)) {
    console.log(`\n.env file exists: ✅`);
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    console.log(`\nActive variables:`);
    lines.forEach(line => console.log(`  ${line}`));
  } else {
    console.log(`\n.env file exists: ❌`);
  }
  
  console.log(`\nAvailable environment files:`);
  console.log(`  ${DEV_ENV_FILE}: ${fs.existsSync(DEV_ENV_FILE) ? '✅' : '❌'}`);
  console.log(`  ${PROD_ENV_FILE}: ${fs.existsSync(PROD_ENV_FILE) ? '✅' : '❌'}`);
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'dev':
    switchEnvironment('dev');
    break;
  case 'prod':
    switchEnvironment('prod');
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.log('🔧 Environment Switcher');
    console.log('======================');
    console.log('\nUsage:');
    console.log('  node switch-env.js dev      - Switch to development environment');
    console.log('  node switch-env.js prod     - Switch to production environment');
    console.log('  node switch-env.js status   - Show current environment');
    console.log('\nOr use npm scripts:');
    console.log('  npm run env:dev            - Switch to development environment');
    console.log('  npm run env:prod           - Switch to production environment');
    console.log('  npm run env:status         - Show current environment');
    break;
}
