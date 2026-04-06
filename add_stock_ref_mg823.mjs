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

async function addStockRef() {
  console.log("🏷️  Adding stock_reference to new mg823 products\n");

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

    // These are the 23 products that were just created (no stock_reference)
    const newProducts = [
      "WILLIAM",
      "TEMAS 45/50 10KG VRAC",
      "TEMAS 10KG 45/50 VRAC",
      "SOLDE CREDIT",
      "SAVEUR 4KG 65/70 SIMPLE",
      "MELINDA SIMPLE BLAC",
      "MANGUE AVION",
      "MANGUE AFRIQUE",
      "KIWI PLASTIQUE",
      "KIWI NEA 6 KG",
      "KIWI NEA 3 KG",
      "KIWI BARQ 10 KG",
      "GRANNY S",
      "GINGEMBRE 5KG",
      "COOPVAL 60/65 10KG VRAC",
      "COOPER FRUTAS 10KG 50/55 VRAC",
      "COOPER 55/60 10KG 8OFL104 EFC",
      "CONFERENCIA 4.2 KG",
      "CONFERANCIA 12 KG",
      "BANANE JOFFRUIT'S 19KG W06/1 EFC",
      "BANANE JOEFFRUITS",
      "BANANE ASAP",
      "ANANAS VELAROSEA",
    ];

    console.log(`📦 Updating ${newProducts.length} products with stock_reference...\n`);

    let updated = 0;
    let errors = 0;

    for (const productName of newProducts) {
      const { error } = await supabase
        .from("products")
        .update({ stock_reference: "STOCKS MG 823" })
        .eq("store_id", MAGASIN_ID)
        .eq("name", productName);

      if (error) {
        console.log(`   ❌ Failed for: ${productName}`);
        errors++;
      } else {
        updated++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ UPDATE COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Updated: ${updated} products`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

addStockRef();