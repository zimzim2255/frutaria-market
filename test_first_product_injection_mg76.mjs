import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MG76_STOCK_DATA } from './mg76_stock_data.mjs';

// Supabase credentials from .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const urlMatch = envContent.match(/SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = urlMatch ? urlMatch[1].trim() : '';
const SUPABASE_SERVICE_ROLE_KEY = keyMatch ? keyMatch[1].trim() : '';

const MAGASIN_ID = '7c9fdbf3-ee76-4989-bd63-3473ec34f1d2'; // mg76
const MAGASIN_NAME = 'mg76';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('\n╔════════════════════════════════════════════╗');
console.log('║   TEST INJECTION - FIRST PRODUCT ONLY     ║');
console.log('║            (MG76 - 84 PRODUCTS)           ║');
console.log('╚════════════════════════════════════════════╝\n');
console.log('ℹ️  Using Supabase Service Role (bypasses all RLS)\n');

// Step 0: Verify magasin exists
console.log('⏳ Step 0: Verifying magasin exists in database...\n');
const { data: allStoresCheck } = await supabase
  .from('stores')
  .select('id, name, email')
  .limit(100);

if (!allStoresCheck || allStoresCheck.length === 0) {
  console.error(`❌ No stores found in database at all!`);
  process.exit(1);
}

console.log(`✅ Found ${allStoresCheck.length} stores in database:\n`);
allStoresCheck.forEach((store, idx) => {
  const indicator = store.id === MAGASIN_ID ? ' 👈 TARGET' : '';
  console.log(`  ${idx + 1}. ${store.name || 'Unknown'} ${store.email ? `(${store.email})` : ''} (${store.id})${indicator}`);
});

const magasinStore = allStoresCheck.find(s => s.id === MAGASIN_ID);
if (!magasinStore) {
  console.error(`\n❌ Magasin ${MAGASIN_NAME} (${MAGASIN_ID}) not found!`);
  process.exit(1);
}

console.log(`\n✅ Magasin found: ${MAGASIN_NAME}`);
console.log(`   ID: ${MAGASIN_ID}`);
console.log(`   Email: ${magasinStore.email || 'N/A'}\n`);

// First product details
const testProductName = MG76_STOCK_DATA[0][0];
const testProductStock = MG76_STOCK_DATA[0][1];

console.log(`📦 Product to test: "${testProductName}"`);
console.log(`   New Stock Value: ${testProductStock}\n`);

// Step 1: Get all products
console.log('⏳ Step 1: Fetching all products from database...\n');
const { data: allProducts, error: productsError } = await supabase
  .from('products')
  .select('id, name, reference')
  .limit(1000);

if (productsError) {
  console.error('❌ Error fetching products:', productsError.message);
  process.exit(1);
}

// Step 2: Find test product
console.log('⏳ Step 2: Finding product in database...\n');
let foundProduct = allProducts.find(p => p.name.toUpperCase() === testProductName.toUpperCase());

// If exact match not found, try partial match
if (!foundProduct) {
  const searchTerm = testProductName.split(' ').slice(0, 2).join(' ').toUpperCase();
  foundProduct = allProducts.find(p => p.name.toUpperCase().includes(searchTerm));
}

if (!foundProduct) {
  console.error(`❌ Product "${testProductName}" not found in database!`);
  console.error(`   Available products: ${allProducts.slice(0, 5).map(p => p.name).join(', ')}...`);
  process.exit(1);
}

console.log(`✅ Product found!`);
console.log(`   ID: ${foundProduct.id}`);
console.log(`   Name: ${foundProduct.name}`);
console.log(`   Reference: ${foundProduct.reference || 'N/A'}\n`);

const PRODUCT_ID = foundProduct.id;

// Step 3: Check current stock BEFORE injection
console.log('⏳ Step 3: Checking CURRENT stock before injection...\n');
const { data: stockBefore } = await supabase
  .from('store_stocks')
  .select('quantity')
  .eq('product_id', PRODUCT_ID)
  .eq('store_id', MAGASIN_ID)
  .single();

const beforeQty = stockBefore?.quantity || null;
console.log(`📊 Current stock in ${MAGASIN_NAME}:`);
console.log(`   Before: ${beforeQty === null ? 'NO RECORD' : beforeQty}`);
console.log(`   After: ${testProductStock}`);
console.log(`   Change: ${beforeQty === null ? 'NEW RECORD' : `${beforeQty} → ${testProductStock}`}\n`);

// Step 4: Check stock in OTHER magasins BEFORE injection
console.log('⏳ Step 4: Checking stock in OTHER magasins (before injection)...\n');
const { data: otherStocksBefore } = await supabase
  .from('store_stocks')
  .select('store_id, quantity, stores(name)')
  .eq('product_id', PRODUCT_ID)
  .neq('store_id', MAGASIN_ID)
  .limit(5);

if (otherStocksBefore && otherStocksBefore.length > 0) {
  console.log('Same product in other magasins (BEFORE):');
  otherStocksBefore.forEach((stock, idx) => {
    console.log(`   ${idx + 1}. Magasin: ${stock.stores?.name || stock.store_id} → Stock: ${stock.quantity}`);
  });
  console.log();
}

// Step 5: INJECT stock
console.log('⏳ Step 5: INJECTING stock for this product...\n');

if (beforeQty === null) {
  // Insert new record
  const now = new Date().toISOString();
  const { data: insertData, error: insertError } = await supabase
    .from('store_stocks')
    .insert({
      product_id: PRODUCT_ID,
      store_id: MAGASIN_ID,
      quantity: testProductStock,
      created_at: now,
      updated_at: now
    })
    .select();

  if (insertError) {
    console.error('❌ Error inserting stock:', insertError.message);
    console.error('   Code:', insertError.code);
    process.exit(1);
  }
  console.log('✅ INSERTED new store_stocks record\n');
} else {
  // Update existing record
  const { data: updateData, error: updateError } = await supabase
    .from('store_stocks')
    .update({
      quantity: testProductStock,
      updated_at: new Date().toISOString()
    })
    .eq('product_id', PRODUCT_ID)
    .eq('store_id', MAGASIN_ID)
    .select();

  if (updateError) {
    console.error('❌ Error updating stock:', updateError.message);
    process.exit(1);
  }
  console.log('✅ UPDATED store_stocks record\n');
}

// Step 6: VERIFY injection in mg76
console.log('⏳ Step 6: VERIFYING injection in mg76...\n');
const { data: stockAfter, error: verifyError } = await supabase
  .from('store_stocks')
  .select('quantity')
  .eq('product_id', PRODUCT_ID)
  .eq('store_id', MAGASIN_ID)
  .single();

const afterQty = stockAfter?.quantity;
const isCorrect = afterQty === testProductStock;

console.log(`📊 Stock in ${MAGASIN_NAME} (AFTER injection):`);
console.log(`   Value: ${afterQty}`);
console.log(`   ${isCorrect ? '✅ CORRECT! Matches expected value (' + testProductStock + ')' : '❌ INCORRECT! Expected ' + testProductStock + ' but got ' + afterQty}\n`);

if (!isCorrect) {
  console.error('❌ Verification failed!');
  process.exit(1);
}

// Step 7: VERIFY other magasins NOT affected
console.log('⏳ Step 7: VERIFYING other magasins were NOT affected...\n');
const { data: otherStocksAfter } = await supabase
  .from('store_stocks')
  .select('store_id, quantity, stores(name)')
  .eq('product_id', PRODUCT_ID)
  .neq('store_id', MAGASIN_ID)
  .limit(5);

let othersUnaffected = true;
if (otherStocksBefore && otherStocksBefore.length > 0) {
  console.log('Same product in other magasins (AFTER - should be UNCHANGED):');
  otherStocksAfter.forEach((stock, idx) => {
    const before = otherStocksBefore.find(s => s.store_id === stock.store_id);
    const isUnchanged = before && before.quantity === stock.quantity;
    const indicator = isUnchanged ? ' ✅' : ' ❌ CHANGED!';
    console.log(`   ${idx + 1}. Magasin: ${stock.stores?.name || stock.store_id} → ${stock.quantity}${indicator}`);
    if (!isUnchanged) othersUnaffected = false;
  });
  console.log();
}

if (!othersUnaffected) {
  console.error('❌ ERROR: Other magasins were affected!');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════════╗');
console.log('║        ✅ TEST PASSED SUCCESSFULLY!       ║');
console.log('╚════════════════════════════════════════════╝\n');
console.log('Summary:');
console.log('  ✅ Product found in database');
console.log('  ✅ Stock injected for mg76');
console.log('  ✅ Injection verified (correct value)');
console.log('  ✅ Other magasins NOT affected\n');
console.log('🎉 Safe to proceed with FULL injection!\n');
