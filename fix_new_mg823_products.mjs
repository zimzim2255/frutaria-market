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

async function fixNewProducts() {
  console.log("🔧 Fixing new mg823 products (update quantity + create store_stocks)\n");

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

    // These are the 23 products that were just created
    const newProducts = [
      ["WILLIAM", 1],
      ["TEMAS 45/50 10KG VRAC", 104],
      ["TEMAS 10KG 45/50 VRAC", 64],
      ["SOLDE CREDIT", 24],
      ["SAVEUR 4KG 65/70 SIMPLE", 6],
      ["MELINDA SIMPLE BLAC", 1],
      ["MANGUE AVION", 3],
      ["MANGUE AFRIQUE", 10],
      ["KIWI PLASTIQUE", 61],
      ["KIWI NEA 6 KG", 120],
      ["KIWI NEA 3 KG", 355],
      ["KIWI BARQ 10 KG", 28],
      ["GRANNY S", 2],
      ["GINGEMBRE 5KG", 1],
      ["COOPVAL 60/65 10KG VRAC", 81],
      ["COOPER FRUTAS 10KG 50/55 VRAC", 36],
      ["COOPER 55/60 10KG 8OFL104 EFC", 19],
      ["CONFERENCIA 4.2 KG", 3],
      ["CONFERANCIA 12 KG", 9],
      ["BANANE JOFFRUIT'S 19KG W06/1 EFC", 1],
      ["BANANE JOEFFRUITS", 6],
      ["BANANE ASAP", 10],
      ["ANANAS VELAROSEA", 5],
    ];

    console.log(`📦 Fixing ${newProducts.length} products...\n`);

    let fixed = 0;
    let errors = 0;

    for (const [productName, quantity] of newProducts) {
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

fixNewProducts();