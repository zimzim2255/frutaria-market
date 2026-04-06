import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { MG739_STOCK_DATA } from "./mg739_stock_data.mjs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function injectBoth() {
  console.log("💉 MG739 INJECTION (Creating products + store_stocks)\n");

  try {
    // Get mg739 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg739%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg739");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Target store ID: ${MAGASIN_ID}\n`);
    console.log(`📦 Products to inject: ${MG739_STOCK_DATA.length}\n`);

    let created = 0;
    let errors = 0;

    console.log("💰 Processing...\n");

    for (let i = 0; i < MG739_STOCK_DATA.length; i++) {
      const [productName, quantity] = MG739_STOCK_DATA[i];

      if ((i + 1) % 50 === 0) {
        console.log(`   ${i + 1}/${MG739_STOCK_DATA.length}`);
      }

      // Create product with all required fields
      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert({
          store_id: MAGASIN_ID,
          name: productName,
          reference: productName, // Use name as reference to satisfy NOT NULL
          purchase_price: 0, // Required field
          sale_price: 0, // Required field
          quantity_available: quantity,
        })
        .select("id")
        .single();

      if (createError) {
        // Check if it's a duplicate (product already exists)
        if (createError.code === '23505') {
          // Try to find existing product and update it
          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("store_id", MAGASIN_ID)
            .eq("name", productName)
            .single();

          if (existingProduct) {
            // Update existing product
            const { error: updateError } = await supabase
              .from("products")
              .update({ quantity_available: quantity })
              .eq("id", existingProduct.id);

            if (!updateError) {
              // Create store_stocks for existing product
              await supabase
                .from("store_stocks")
                .upsert({
                  product_id: existingProduct.id,
                  store_id: MAGASIN_ID,
                  quantity: quantity,
                }, { onConflict: "product_id,store_id" });
              created++;
            } else {
              errors++;
            }
          }
        } else {
          console.log(`   ❌ ${productName}: ${createError.message}`);
          errors++;
        }
      } else if (newProduct) {
        // Create or update store_stocks for new product (upsert)
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
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Created/Updated: ${created} products`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

injectBoth();