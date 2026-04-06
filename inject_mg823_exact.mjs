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

async function exactInject() {
  console.log("💉 MG823 EXACT INJECTION (Update products + Create store_stocks)\n");

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
    console.log(`📦 Products to inject: ${MG823_STOCK_DATA.length}\n`);

    // Get all products for mg823
    console.log("📋 Fetching existing products...");
    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, name")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${existingProducts?.length} products\n`);

    // Create a map for exact matching
    const productMap = new Map();
    for (const product of existingProducts) {
      productMap.set(product.name, product.id);
    }

    let updated = 0;
    let upserted = 0;
    let notFound = 0;
    let errors = 0;

    console.log("💰 Processing with EXACT matching...\n");

    for (let i = 0; i < MG823_STOCK_DATA.length; i++) {
      const [productName, quantity] = MG823_STOCK_DATA[i];

      if ((i + 1) % 50 === 0) {
        console.log(`   ${i + 1}/${MG823_STOCK_DATA.length}`);
      }

      // Try exact match first
      const productId = productMap.get(productName);

      if (productId) {
        updated++;

        // Update products table quantity_available
        const { error: updateError } = await supabase
          .from("products")
          .update({ quantity_available: quantity })
          .eq("id", productId);

        if (updateError) {
          console.log(`   ❌ Update failed for: ${productName}`);
          errors++;
          continue;
        }

        // UPSERT into store_stocks
        const { error: upsertError } = await supabase
          .from("store_stocks")
          .upsert(
            {
              product_id: productId,
              store_id: MAGASIN_ID,
              quantity: quantity,
            },
            { onConflict: "product_id,store_id" }
          );

        if (upsertError) {
          console.log(`   ❌ Store stocks upsert failed for: ${productName} - ${upsertError.message}`);
          errors++;
        } else {
          upserted++;
        }
      } else {
        notFound++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`🎯 Products found and updated: ${updated}`);
    console.log(`✅ Store stocks upserted: ${upserted}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`❓ Not found in DB: ${notFound}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

exactInject();