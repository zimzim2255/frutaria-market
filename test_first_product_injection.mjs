#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TEST SCRIPT - FIRST PRODUCT ONLY
// ============================================
// This script tests the injection with ONLY the first product
// to verify nothing gets affected before running full injection

const MAGASIN_ID = 'cafa8f1e-081e-41c3-8488-f77908439583';
const MAGASIN_NAME = 'mg739';

// Test data - ONLY the first product
const TEST_DATA = [
  ["BANANE JOFFRUIT'S 19KG W06/1 EFC", 19]
];

// Load environment variables
const envPath = path.resolve('.env.local');
let SUPABASE_URL = '';
let SUPABASE_SERVICE_ROLE_KEY = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const urlMatch = envContent.match(/SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  
  if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
  if (keyMatch) SUPABASE_SERVICE_ROLE_KEY = keyMatch[1].trim();
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Could not find Supabase credentials in .env.local');
  process.exit(1);
}

// Create admin client that can bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  try {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   TEST INJECTION - FIRST PRODUCT ONLY     ║');
    console.log('╚════════════════════════════════════════════╝\n');

    console.log('ℹ️  Using Supabase Service Role (bypasses all RLS)\n');

    // Step 0: Verify magasin exists
    console.log('⏳ Step 0: Verifying magasin exists in database...\n');
    
    // First, try to get ALL stores
    const { data: allStoresCheck, error: allStoresError } = await supabase
      .from('stores')
      .select('id, name, email')
      .limit(100);

    if (allStoresError) {
      console.error(`❌ Error querying stores table:`, allStoresError);
      process.exit(1);
    }

    if (!allStoresCheck || allStoresCheck.length === 0) {
      console.error(`❌ No stores found in database at all!`);
      console.log('\n⚠️  The stores table appears to be empty.');
      console.log('   Please verify the store was created in the database.\n');
      process.exit(1);
    }

    console.log(`✅ Found ${allStoresCheck.length} stores in database:\n`);
    allStoresCheck.forEach((s, i) => {
      const match = s.id === MAGASIN_ID ? '👈 TARGET' : '';
      console.log(`  ${i + 1}. ${s.name} (${s.id}) ${match}`);
    });
    console.log('');

    // Now look for the specific magasin
    const { data: magasinCheck, error: magasinError } = await supabase
      .from('stores')
      .select('id, name, email')
      .eq('id', MAGASIN_ID)
      .single();

    if (magasinError || !magasinCheck) {
      console.error(`\n❌ Magasin ${MAGASIN_NAME} (${MAGASIN_ID}) not found!`);
      process.exit(1);
    }

    console.log(`✅ Magasin found: ${magasinCheck.name}`);
    console.log(`   ID: ${magasinCheck.id}`);
    console.log(`   Email: ${magasinCheck.email}\n`);

    const [productName, newStock] = TEST_DATA[0];

    console.log(`📦 Product to test: "${productName}"`);
    console.log(`   New Stock Value: ${newStock}\n`);

    // ========================================
    // STEP 1: Get all products
    // ========================================
    console.log('⏳ Step 1: Fetching all products from database...\n');
    const { data: allProducts, error: productsError } = await supabase
      .from('products')
      .select('id, name, reference')
      .limit(1000);

    if (productsError) {
      console.error('❌ Error fetching products:', productsError);
      process.exit(1);
    }

    // ========================================
    // STEP 2: Find the product
    // ========================================
    console.log('⏳ Step 2: Finding product in database...\n');
    let product = allProducts?.find(p => p.name.toLowerCase() === productName.toLowerCase());
    
    if (!product) {
      const searchTerm = productName.split(' ')[0].toLowerCase();
      product = allProducts?.find(p => p.name.toLowerCase().includes(searchTerm));
    }

    if (!product) {
      console.error(`❌ Product not found: "${productName}"`);
      console.log('\nSearching for similar products...\n');
      const similar = allProducts?.filter(p => 
        p.name.toLowerCase().includes(productName.split(' ')[0].toLowerCase())
      ) || [];
      
      similar.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name}`);
      });
      process.exit(1);
    }

    console.log(`✅ Product found!`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Name: ${product.name}`);
    console.log(`   Reference: ${product.reference || 'N/A'}\n`);

    // ========================================
    // STEP 3: Check current stock BEFORE
    // ========================================
    console.log('⏳ Step 3: Checking CURRENT stock before injection...\n');
    const { data: beforeStock } = await supabase
      .from('store_stocks')
      .select('id, quantity')
      .eq('product_id', product.id)
      .eq('store_id', MAGASIN_ID)
      .single();

    const currentStock = beforeStock?.quantity || 'NO RECORD';
    console.log(`📊 Current stock in ${MAGASIN_NAME}:`);
    console.log(`   Before: ${currentStock}`);
    console.log(`   After: ${newStock}`);
    console.log(`   Change: ${typeof currentStock === 'number' ? newStock - currentStock : 'NEW RECORD'}\n`);

    // ========================================
    // STEP 4: Check other magasins BEFORE
    // ========================================
    console.log('⏳ Step 4: Checking stock in OTHER magasins (before injection)...\n');
    const { data: otherMagasins, error: otherError } = await supabase
      .from('store_stocks')
      .select('store_id, quantity, stores(id, name)')
      .eq('product_id', product.id)
      .neq('store_id', MAGASIN_ID);

    const before_other_magasins = otherMagasins || [];
    console.log(`Same product in other magasins (BEFORE):`);
    if (before_other_magasins.length === 0) {
      console.log(`   (No stock records in other magasins)`);
    } else {
      before_other_magasins.forEach((ss, i) => {
        console.log(`   ${i + 1}. Magasin: ${ss.stores?.name || ss.store_id} → Stock: ${ss.quantity}`);
      });
    }
    console.log('');

    // ========================================
    // STEP 5: PERFORM THE INJECTION
    // ========================================
    console.log('⏳ Step 5: INJECTING stock for this product...\n');
    
    let result;
    if (beforeStock) {
      // Update existing
      result = await supabase
        .from('store_stocks')
        .update({
          quantity: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', beforeStock.id);
      console.log(`✅ UPDATED existing store_stocks record`);
    } else {
      // Insert new
      result = await supabase
        .from('store_stocks')
        .insert({
          product_id: product.id,
          store_id: MAGASIN_ID,
          quantity: newStock,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      console.log(`✅ INSERTED new store_stocks record`);
    }

    if (result.error) {
      console.error(`❌ Injection failed:`, result.error);
      process.exit(1);
    }
    console.log('');

    // ========================================
    // STEP 6: VERIFY INJECTION - Check mg739
    // ========================================
    console.log('⏳ Step 6: VERIFYING injection in mg739...\n');
    const { data: afterStock } = await supabase
      .from('store_stocks')
      .select('quantity')
      .eq('product_id', product.id)
      .eq('store_id', MAGASIN_ID)
      .single();

    const verifiedStock = afterStock?.quantity;
    console.log(`📊 Stock in ${MAGASIN_NAME} (AFTER injection):`);
    console.log(`   Value: ${verifiedStock}`);
    
    if (verifiedStock === newStock) {
      console.log(`   ✅ CORRECT! Matches expected value (${newStock})\n`);
    } else {
      console.log(`   ❌ MISMATCH! Expected ${newStock}, got ${verifiedStock}\n`);
      process.exit(1);
    }

    // ========================================
    // STEP 7: VERIFY SAFETY - Check other magasins
    // ========================================
    console.log('⏳ Step 7: VERIFYING other magasins were NOT affected...\n');
    const { data: otherMagasinsAfter } = await supabase
      .from('store_stocks')
      .select('store_id, quantity, stores(id, name)')
      .eq('product_id', product.id)
      .neq('store_id', MAGASIN_ID);

    const after_other_magasins = otherMagasinsAfter || [];
    console.log(`Same product in other magasins (AFTER - should be UNCHANGED):`);
    if (after_other_magasins.length === 0) {
      console.log(`   (No stock records in other magasins) ✅`);
    } else {
      let allUnchanged = true;
      after_other_magasins.forEach((ss, i) => {
        const before = before_other_magasins.find(b => b.store_id === ss.store_id);
        const changed = before && before.quantity !== ss.quantity;
        const status = changed ? '❌ CHANGED!' : '✅';
        console.log(`   ${i + 1}. Magasin: ${ss.stores?.name || ss.store_id} → ${ss.quantity} ${status}`);
        if (changed) allUnchanged = false;
      });
      
      if (!allUnchanged) {
        console.error('\n❌ ERROR: Some other magasins were affected!');
        process.exit(1);
      }
    }
    console.log('');

    // ========================================
    // SUCCESS!
    // ========================================
    console.log('╔════════════════════════════════════════════╗');
    console.log('║        ✅ TEST PASSED SUCCESSFULLY!       ║');
    console.log('╚════════════════════════════════════════════╝\n');
    
    console.log('Summary:');
    console.log(`  ✅ Product found in database`);
    console.log(`  ✅ Stock injected for ${MAGASIN_NAME}`);
    console.log(`  ✅ Injection verified (correct value)`);
    console.log(`  ✅ Other magasins NOT affected`);
    console.log('\n🎉 Safe to proceed with FULL injection!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
