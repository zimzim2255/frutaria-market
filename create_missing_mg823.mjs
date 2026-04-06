import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { MG823_STOCK_DATA } from "./mg823_stock_data.mjs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createMissing() {
  console.log("🆕 Creating missing products for mg823\n");

  try {
    // Get mg823 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg823%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg823");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Target store ID: ${MAGASIN_ID}\n`);

    // Get all products for mg823
    const { data: products } = await supabase
      .from("products")
      .select("name")
      .eq("store_id", MAGASIN_ID);

    const existingNames = new Set(products.map(p => p.name));

    // Filter to only missing products
    const missingProducts = MG823_STOCK_DATA.filter(([name]) => !existingNames.has(name));

    console.log(`📦 Creating ${missingProducts.length} missing products...\n`);

    let created = 0;
    let errors = 0;

    for (const [productName, quantity] of missingProducts) {
      // Create product
      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert({
          store_id: MAGASIN_ID,
          name: productName,
          reference: productName, // Use name as reference
          purchase_price: 0,
          sale_price: 0,
          quantity_available: quantity,
        })
        .select("id")
        .single();

      if (createError) {
        console.log(`   ❌ ${productName}: ${createError.message}`);
        errors++;
        continue;
      }

      // Create or update store_stocks (upsert)
      const { error: stockError } = await supabase
        .from("store_stocks")
        .upsert({
          product_id: newProduct.id,
          store_id: MAGASIN_ID,
          quantity: quantity,
        }, { onConflict: "product_id,store_id" });

      if (stockError) {
        console.log(`   ❌ Store stocks failed for: ${productName}`);
        errors++;
      } else {
        created++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ CREATION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Created: ${created} products`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

createMissing();