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

// The 29 missing products
const MISSING_PRODUCTS = [
  ["MANGUE AFRIQUE", 1070],
  ["SAVEUR 32 60/65 4KG 25OFL86 EFC", 203],
  ["COOPVAL 60/65 10KG 20PS40 EFC", 104],
  ["KIWI NEA 6 KG", 91],
  ["PEAR 45/50 10KG 10OFL98 EFC", 88],
  ["COOPVAL 60/65 10KG 24PS40 EFC", 74],
  ["KIWI BARQUETTE SND", 71],
  ["GINGEMBRE VRAC", 64],
  ["ANANAS GOLDEN", 54],
  ["CHAMPIGNON MIXTES 1- 6SN40MIX", 41],
  ["WILLIAM", 35],
  ["MANGUE AVION", 34],
  ["KIWI PLASTIQUE", 30],
  ["SOLDE CREDIT", 21],
  ["POIRE PLASTIC 65/70", 19],
  ["GINGEMBRE 5KG", 19],
  ["COOPER 60/65 10KG 12OFL99 EFC", 16],
  ["COOPER 60/65 10KG 16OFL99 EFC", 14],
  ["BANANE JOEFFRUITS", 11],
  ["MELON", 10],
  ["COOPVAL 55/60 10KG VRAC", 6],
  ["KIWI NEA 3 KG", 6],
  ["POIRE ARCOSIGRE", 4],
  ["PEAR 60/65 VRAC 10KG", 3],
  ["ASPERGE", 2],
  ["COOPVAL 60/65 10KG VRAC", 2],
  ["PEAR 50/55 VRAC 10KG", 2],
  ["CONFERANCIA 12 KG", 1],
  ["COOPER 32 60/65 4KG 13OFL52 EFC", 1],
];

async function fixMissing() {
  console.log("🔧 Fixing missing mg76 products (update quantity + create store_stocks)\n");

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

    console.log(`📦 Fixing ${MISSING_PRODUCTS.length} products...\n`);

    let fixed = 0;
    let errors = 0;

    for (const [productName, quantity] of MISSING_PRODUCTS) {
      // Find product
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("store_id", MAGASIN_ID)
        .eq("name", productName)
        .single();

      if (!product) {
        console.log(`   ❌ Product not found: ${productName}`);
        errors++;
        continue;
      }

      // Update products.quantity_available
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
        console.log(`   ❌ Store stocks failed for: ${productName} - ${stockError.message}`);
        errors++;
      } else {
        fixed++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ FIX COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Fixed: ${fixed} products`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

fixMissing();