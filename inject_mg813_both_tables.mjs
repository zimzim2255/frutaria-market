import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { MG813_STOCK_DATA } from "./mg813_stock_data.mjs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Fuzzy match helper
function fuzzyMatch(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  let matches = 0;
  for (let char of s1) {
    if (s2.includes(char)) matches++;
  }

  const similarity = (matches / Math.max(s1.length, s2.length)) * 100;
  return similarity;
}

function findBestMatch(stockName, products) {
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const score = fuzzyMatch(stockName, product.name);
    if (score > bestScore && score > 70) {
      best = product;
      bestScore = score;
    }
  }

  return { product: best, score: bestScore };
}

async function injectWithNoDuplication() {
  console.log("💉 MG813 INJECTION WITH DUPLICATION PREVENTION\n");
  console.log(`📦 Products to inject: ${MG813_STOCK_DATA.length}\n`);

  try {
    // Get mg813 store ID
    console.log("🔍 Finding mg813 store...");
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`   Found: ${stores[0].email}\n`);

    // 1. Get all existing products for mg813
    console.log("📋 Step 1: Fetching existing mg813 products...");
    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, name, quantity_available")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${existingProducts?.length || 0} products\n`);

    // 2. Get all existing store_stocks for mg813
    console.log("📋 Step 2: Fetching existing mg813 store_stocks...");
    const { data: existingStocks } = await supabase
      .from("store_stocks")
      .select("id, product_id, quantity")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${existingStocks?.length || 0} store_stocks records\n`);

    // Create maps for quick lookup
    const productMap = new Map(existingProducts?.map(p => [p.id, p]) || []);
    const stockMap = new Map(existingStocks?.map(s => [s.product_id, s]) || []);

    let injected = 0;
    let updated = 0;
    let created = 0;
    let failed = 0;
    let notFound = [];

    console.log("💰 Processing injections...\n");

    for (let i = 0; i < MG813_STOCK_DATA.length; i++) {
      const [productName, quantity] = MG813_STOCK_DATA[i];

      // Show progress
      if ((i + 1) % 20 === 0) {
        console.log(`├─ ${i + 1}/${MG813_STOCK_DATA.length}`);
      }

      // Try to find product
      const { product: foundProduct, score } = findBestMatch(
        productName,
        existingProducts || []
      );

      if (foundProduct) {
        // PRODUCT EXISTS - Update quantities
        const productId = foundProduct.id;

        // Update products table
        const { error: productError } = await supabase
          .from("products")
          .update({ quantity_available: quantity })
          .eq("id", productId);

        if (productError) {
          console.log(`   ❌ Failed to update product: ${productName}`);
          console.log(`      Error: ${productError.message}`);
          failed++;
          continue;
        }

        // Check if store_stocks record exists
        const existingStock = stockMap.get(productId);

        if (existingStock) {
          // Update existing store_stocks
          const { error: stockError } = await supabase
            .from("store_stocks")
            .update({ quantity })
            .eq("id", existingStock.id);

          if (stockError) {
            console.log(`   ❌ Failed to update store_stocks: ${productName}`);
            console.log(`      Error: ${stockError.message}`);
            failed++;
            continue;
          }
        } else {
          // Create new store_stocks record
          const { error: insertError } = await supabase
            .from("store_stocks")
            .insert({
              product_id: productId,
              store_id: MAGASIN_ID,
              quantity,
            });

          if (insertError) {
            console.log(`   ❌ Failed to create store_stocks for: ${productName}`);
            console.log(`      Error: ${insertError.message}`);
            failed++;
            continue;
          }
        }

        updated++;
      } else {
        // PRODUCT NOT FOUND - Create it
        notFound.push(productName);

        // Get supplier_id (use first or default)
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id")
          .limit(1);

        const supplierId = suppliers?.[0]?.id || null;

        // Create new product
        const { data: newProduct, error: createError } = await supabase
          .from("products")
          .insert({
            name: productName,
            reference: productName.substring(0, 20),
            category: "FRUITS",
            quantity_available: quantity,
            number_of_boxes: 1,
            purchase_price: 0,
            sale_price: 0,
            supplier_id: supplierId,
            store_id: MAGASIN_ID,
          })
          .select();

        if (createError) {
          console.log(`   ❌ Failed to create product: ${productName}`);
          console.log(`      Error: ${createError.message}`);
          failed++;
          continue;
        }

        const productId = newProduct[0].id;

        // Create store_stocks record for new product
        const { error: stockError } = await supabase
          .from("store_stocks")
          .insert({
            product_id: productId,
            store_id: MAGASIN_ID,
            quantity,
          });

        if (stockError) {
          console.log(`   ❌ Failed to create store_stocks for: ${productName}`);
          console.log(`      Error: ${stockError.message}`);
          failed++;
          continue;
        }

        created++;
      }

      injected++;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION RESULT:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Successfully processed: ${injected} products`);
    console.log(`✏️  Updated: ${updated} products`);
    console.log(`🆕 Created: ${created} products`);
    console.log(`❌ Failed: ${failed} products`);

    if (notFound.length > 0) {
      console.log(`\n⚠️  Products created (not found in existing):`);
      notFound.forEach((name) => {
        console.log(`   • ${name}`);
      });
    }

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

injectWithNoDuplication();
