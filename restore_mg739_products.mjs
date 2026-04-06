import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function restoreProducts() {
  console.log("🔄 RESTORING MG739 PRODUCTS FROM PRODUCT_ADDITIONS_HISTORY AND SALES\n");

  try {
    // Get mg739 store ID
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg739%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg739 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Found store: ${stores[0].email}`);
    console.log(`Store ID: ${MAGASIN_ID}\n`);

    // Step 1: Get unique product names from product_additions_history for this store
    console.log("Step 1: Fetching products from product_additions_history...");
    const { data: additionProducts } = await supabase
      .from("product_additions_history")
      .select("product_name, purchase_price, selling_price, unit, reference")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found ${additionProducts?.length || 0} product additions\n`);

    // Step 2: Get products from sales for this store
    console.log("Step 2: Fetching products from sales...");
    const { data: salesProducts } = await supabase
      .from("sales")
      .select("store_id")
      .eq("store_id", MAGASIN_ID)
      .limit(10);

    console.log(`   Found ${salesProducts?.length || 0} sales records\n`);

    // Create a map of product_name -> { purchase_price, selling_price, unit, reference }
    const productMap = new Map();

    // Add product additions data
    if (additionProducts) {
      for (const item of additionProducts) {
        if (item.product_name && !productMap.has(item.product_name)) {
          productMap.set(item.product_name, {
            purchase_price: item.purchase_price || 0,
            selling_price: item.selling_price || 0,
            unit: item.unit || 'unité',
            reference: item.reference || null
          });
        }
      }
    }

    console.log(`Step 3: Unique products to restore: ${productMap.size}\n`);
    console.log("Step 4: Creating products...\n");

    let created = 0;
    let errors = 0;
    let skipped = 0;

    // Check existing products first
    const { data: existingProducts } = await supabase
      .from("products")
      .select("name")
      .eq("store_id", MAGASIN_ID);

    const existingNames = new Set(existingProducts?.map(p => p.name) || []);

    for (const [productName, data] of productMap) {
      // Skip if product already exists
      if (existingNames.has(productName)) {
        skipped++;
        continue;
      }

      // Create product
      const { error } = await supabase
        .from("products")
        .insert({
          store_id: MAGASIN_ID,
          name: productName,
          reference: data.reference || productName,
          purchase_price: data.purchase_price || 0,
          selling_price: data.selling_price || 0,
          unit: data.unit || 'unité',
          quantity_available: 0,
        });

      if (error) {
        console.log(`   ❌ ${productName}: ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ RESTORATION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Created: ${created} products`);
    console.log(`⏭️  Skipped (already exist): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

restoreProducts();