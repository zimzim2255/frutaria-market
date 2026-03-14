#!/usr/bin/env node

/**
 * WIPE DATA SCRIPT - FIXED
 * 
 * This script safely wipes all data while preserving:
 * 1. Admin user: admin.user@hmad.com
 * 2. Admin's supplier record
 * 3. Admin's store
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load from .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  if (match) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim();
  }
}

const SUPABASE_URL = 'https://fjvmssmimoujxzqketsx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ ERROR: Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

async function wipeData() {
  log(colors.bright + colors.red, '\n🗑️  DATA WIPE SCRIPT - PRESERVING ADMIN ONLY\n');

  try {
    // Step 1: Identify admin to preserve
    log(colors.yellow, '📋 Step 1: Identifying admin account to preserve...\n');

    const { data: adminUser, error: adminErr } = await supabase
      .from('users')
      .select('id, email, store_id')
      .eq('email', 'admin.user@hmad.com')
      .single();

    if (adminErr) throw adminErr;

    const adminId = adminUser.id;
    const adminStoreId = adminUser.store_id;

    log(colors.green, `✅ Admin to preserve:`);
    console.log(`   ID: ${adminId}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Store ID: ${adminStoreId}\n`);

    // Step 2: Find admin's supplier
    log(colors.yellow, '📋 Step 2: Finding admin supplier...\n');

    const { data: adminSupplier, error: supplierErr } = await supabase
      .from('suppliers')
      .select('id, name, email')
      .eq('created_by', adminId)
      .limit(1)
      .single();

    let adminSupplierId = null;
    if (!supplierErr && adminSupplier) {
      adminSupplierId = adminSupplier.id;
      log(colors.green, `✅ Admin supplier to preserve:`);
      console.log(`   ID: ${adminSupplierId}`);
      console.log(`   Name: ${adminSupplier.name}`);
      console.log(`   Email: ${adminSupplier.email}\n`);
    } else {
      log(colors.yellow, '⚠️  No supplier found for admin\n');
    }

    // Step 3: Wipe data in correct order (respecting foreign keys)
    log(colors.bright + colors.red, '🗑️  WIPING DATA...\n');

    let totalDeleted = 0;

    // Transaction/Movement tables first
    const tables = [
      'check_safe_usages',
      'check_safe',
      'check_inventory',
      'sale_items',
      'sales',
      'invoices',
      'expenses',
      'cash_payments',
      'borrowed_money_checks',
      'borrowed_money_payments',
      'borrowed_money',
      'discounts',
      'clients',
      'store_stocks',
      'products',
      'product_templates',
      'charge_categories',
    ];

    for (const table of tables) {
      try {
        // Delete all rows where id is not null (deletes everything)
        const { count, error } = await supabase
          .from(table)
          .delete()
          .not('id', 'is', null)
          .select('id', { count: 'exact', head: true });

        if (error) {
          throw error;
        }

        const deletedCount = count || 0;
        totalDeleted += deletedCount;

        if (deletedCount > 0) {
          log(colors.yellow, `🗑️  ${table}: ${deletedCount} rows deleted`);
        }
      } catch (error) {
        log(colors.red, `⚠️  ${table}: ${error.message}`);
      }
    }

    // Delete suppliers except admin's
    try {
      const { count: supplierCount, error: supplierDeleteErr } = await supabase
        .from('suppliers')
        .delete()
        .neq('id', adminSupplierId)
        .select('id', { count: 'exact', head: true });

      if (supplierDeleteErr) throw supplierDeleteErr;

      if (supplierCount > 0) {
        log(colors.yellow, `🗑️  suppliers: ${supplierCount} rows deleted (kept admin supplier)`);
        totalDeleted += supplierCount;
      }
    } catch (error) {
      log(colors.red, `⚠️  suppliers: ${error.message}`);
    }

    // Delete users except admin
    try {
      const { count: userCount, error: userDeleteErr } = await supabase
        .from('users')
        .delete()
        .neq('id', adminId)
        .select('id', { count: 'exact', head: true });

      if (userDeleteErr) throw userDeleteErr;

      if (userCount > 0) {
        log(colors.yellow, `🗑️  users: ${userCount} rows deleted (kept admin)`);
        totalDeleted += userCount;
      }
    } catch (error) {
      log(colors.red, `⚠️  users: ${error.message}`);
    }

    log(colors.green, `\n✅ Total rows deleted: ${totalDeleted}\n`);

    // Step 4: Verify preservation
    log(colors.yellow, '📋 Step 3: Verifying preservation...\n');

    const { data: remainingAdmin } = await supabase
      .from('users')
      .select('id, email, role');

    log(colors.green, `✅ Users remaining: ${remainingAdmin?.length || 0}`);
    if (remainingAdmin && remainingAdmin.length > 0) {
      console.table(remainingAdmin);
    }

    if (adminSupplierId) {
      const { data: remainingSupplier } = await supabase
        .from('suppliers')
        .select('id, name, email');

      log(colors.green, `✅ Suppliers remaining: ${remainingSupplier?.length || 0}`);
      if (remainingSupplier && remainingSupplier.length > 0) {
        console.table(remainingSupplier);
      }
    }

    // Step 5: Show what's left
    log(colors.yellow, '\n📊 DATA SUMMARY AFTER WIPE:\n');

    const tables_to_check = [
      'users',
      'stores',
      'suppliers',
      'products',
      'clients',
      'sales',
      'invoices',
      'expenses',
      'check_inventory',
      'check_safe',
    ];

    for (const table of tables_to_check) {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true });

      if (!error) {
        log(colors.cyan, `${table}: ${count || 0} rows`);
      }
    }

    log(colors.bright + colors.green, '\n✅ DATA WIPE COMPLETED - SYSTEM READY FOR FRESH TESTING\n');

  } catch (error) {
    log(colors.red, `\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Confirmation
log(colors.bright + colors.red, '⚠️  WARNING: This will delete ALL data except admin account and supplier!\n');
log(colors.yellow, 'Proceeding in 3 seconds...\n');

setTimeout(() => {
  wipeData();
}, 3000);
