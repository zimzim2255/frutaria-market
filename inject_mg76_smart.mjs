import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { MG76_STOCK_DATA } from "./mg76_stock_data.mjs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function smartInject() {
  console.log("💉 MG76 SMART INJECTION (Skip products with existing stock)\n");

  try {
    // Get mg76 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg76%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg76");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Target store ID: ${MAGASIN_ID}\n`);

    // Get all products for mg76
    const { data: products } = await supabase
      .from("products")
      .select("id, name, quantity_available")
      .eq("store_id", MAGASIN_ID);

    console.log(`📦 Total products in DB: ${products.length}`);

    // Create a map for quick lookup
    const productMap = new Map();
    products.forEach(p => {
      productMap.set(p.name, p);
    });

    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    let errors = 0;

    console.log("\n💰 Processing...\n");

    for (const [productName, quantity] of MG76_STOCK_DATA) {
      const product = productMap.get(productName);

      if (!product) {
        notFound++;
        continue;
      }

      // Check if product already has stock
      if (product.quantity_available > 0) {
        skipped++;
        continue;
      }

      // Update products.quantity_available (only if 0)
      const { error: updateError } = await supabase
        .from("products")
        .update({ quantity_available: quantity })
        .eq("id", product.id);

      if (updateError) {
        console.log(`   ❌ Update failed for: ${productName}`);
        errors++;
        continue;
      }

      // Upsert store_stocks
      const { error: stockError } = await supabase
        .from("store_stocks")
        .upsert({
          product_id: product.id,
          store_id: MAGASIN_ID,
          quantity: quantity,
        }, { onConflict: "product_id,store_id" });

      if (stockError) {
        console.log(`   ❌ Store stocks failed for: ${productName}`);
        errors++;
      } else {
        updated++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`🎯 Updated (had 0 stock): ${updated}`);
    console.log(`⏭️  Skipped (already had stock): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`❓ Not found in DB: ${notFound}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

smartInject();