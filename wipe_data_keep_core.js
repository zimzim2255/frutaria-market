#!/usr/bin/env node

/**
 * WIPE DATA SCRIPT (keep core entities)
 *
 * Deletes transactional/operational data while preserving:
 *   - users
 *   - stores
 *   - suppliers
 *   - clients
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load from .env.local (project convention)
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  if (match) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim();
  }
  const matchUrl = envContent.match(/SUPABASE_URL=(.+)/);
  if (matchUrl) {
    process.env.SUPABASE_URL = matchUrl[1].trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fjvmssmimoujxzqketsx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ ERROR: Missing SUPABASE_SERVICE_ROLE_KEY (expected in .env.local)');
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

async function deleteAllRows(table) {
  // Use a condition that matches all rows. Prefer `not('id','is',null)` for id-based tables.
  // If a table doesn't have `id`, fall back to `neq` on a likely column won't work;
  // so we try `not id is null` first and if it errors, we retry with a generic delete().
  const tryWithIdPredicate = async () => {
    return await supabase
      .from(table)
      .delete()
      .not('id', 'is', null)
      .select('id', { count: 'exact', head: true });
  };

  const tryPlainDelete = async () => {
    // WARNING: PostgREST requires a filter for delete unless `delete` is allowed without filters.
    // Many setups allow delete with a filter only. We'll attempt a common always-true filter.
    // If table has created_at, use not created_at is null. Otherwise, just return an error.
    const meta = await supabase.from(table).select('*').limit(1);
    if (meta.error) throw meta.error;

    const row = (meta.data || [])[0] || null;
    const cols = row ? Object.keys(row) : [];

    const fallbackCol = cols.includes('created_at')
      ? 'created_at'
      : (cols.includes('store_id') ? 'store_id' : (cols.includes('amount') ? 'amount' : null));

    if (!fallbackCol) {
      throw new Error(`Cannot determine a safe delete predicate for table ${table} (no id/created_at/store_id/amount found)`);
    }

    return await supabase
      .from(table)
      .delete()
      .not(fallbackCol, 'is', null)
      .select(fallbackCol, { count: 'exact', head: true });
  };

  let res = await tryWithIdPredicate();
  if (!res.error) return res;

  // Retry fallback
  res = await tryPlainDelete();
  return res;
}

async function wipe() {
  log(colors.bright + colors.red, '\n🗑️  WIPE DATA (KEEP users/stores/suppliers/clients)\n');
  log(colors.yellow, 'Target Supabase URL:', SUPABASE_URL);

  // Tables to preserve
  const keep = new Set(['users', 'stores', 'suppliers', 'clients']);

  // Delete order (children first) to respect foreign keys.
  // This list is intentionally broad; missing tables will be skipped with a warning.
  const tablesToWipe = [
    // cheque safe ledgers
    'check_safe_usages',
    'check_safe',

    // cheque inventory
    'check_inventory',
    'checks',

    // sales/invoices
    'sale_items',
    'sales',
    'invoices',

    // payments modules
    'client_global_payments',
    'store_global_payments',
    'payments',
    'partial_payments',
    'cash_payments',

    // supplier admin / magasin admin modules
    'supplier_admin_global_payments',
    'admin_supplier_invoices',

    // other finance
    'discounts',
    'expenses',
    'borrowed_money_checks',
    'borrowed_money_payments',
    'borrowed_money',

    // stock
    'store_stocks',
    'products',
    'product_templates',
    'stock_reference_details',

    // misc
    'orders',
    'order_items',
    'transfers',
    'transfer_items',
    'charge_categories',
    'supplier_advances',
    'supplier_passages',
  ].filter((t) => !keep.has(t));

  let totalDeleted = 0;

  for (const table of tablesToWipe) {
    try {
      const { count, error } = await deleteAllRows(table);

      if (error) {
        const msg = String(error.message || '');
        // Skip missing tables/views
        if (msg.toLowerCase().includes('could not find the') || msg.toLowerCase().includes('relation') || msg.toLowerCase().includes('not found')) {
          log(colors.cyan, `ℹ️  ${table}: skipped (not found)`);
          continue;
        }
        throw error;
      }

      const deleted = count || 0;
      totalDeleted += deleted;
      if (deleted > 0) {
        log(colors.yellow, `🗑️  ${table}: ${deleted} rows deleted`);
      } else {
        log(colors.cyan, `ℹ️  ${table}: 0 rows`);
      }
    } catch (e) {
      log(colors.red, `⚠️  ${table}: ${e.message || e}`);
    }
  }

  log(colors.green, `\n✅ Total rows deleted: ${totalDeleted}\n`);

  // Summary of preserved tables
  log(colors.yellow, '📊 Remaining core tables:\n');
  for (const table of ['users', 'stores', 'suppliers', 'clients']) {
    try {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      if (error) throw error;
      log(colors.green, `✅ ${table}: ${count || 0}`);
    } catch (e) {
      log(colors.red, `⚠️  ${table}: ${e.message || e}`);
    }
  }

  log(colors.bright + colors.green, '\n✅ WIPE COMPLETED\n');
}

log(colors.bright + colors.red, '⚠️  WARNING: This will delete MOST DATA, keeping only: users, stores, suppliers, clients');
log(colors.yellow, 'Starting in 3 seconds... (Ctrl+C to cancel)\n');

setTimeout(() => {
  wipe().catch((err) => {
    log(colors.red, `\n❌ Fatal error: ${err?.message || err}`);
    process.exit(1);
  });
}, 3000);
