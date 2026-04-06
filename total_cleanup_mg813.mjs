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

async function totalCleanup() {
  console.log("🔥 TOTAL CLEANUP - MG813 PRODUCTS & STORE_STOCKS\n");

  try {
    // Get mg813 store ID
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Target: ${MAGASIN_ID}\n`);

    // ===== PHASE 1: DELETE ALL STORE_STOCKS =====
    console.log("PHASE 1: Deleting store_stocks...");
    const { count: stockCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${stockCount} records`);

    if (stockCount > 0) {
      const { error: deleteError } = await supabase
        .from("store_stocks")
        .delete()
        .eq("store_id", MAGASIN_ID);

      if (deleteError) {
        console.error("   ❌ Error:", deleteError.message);
      } else {
        console.log(`   ✅ Deleted ${stockCount} records`);
      }
    } else {
      console.log(`   ✅ Already clean`);
    }

    // ===== PHASE 2: ZERO ALL PRODUCT QUANTITIES =====
    console.log("\nPHASE 2: Zeroing product quantities...");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${productCount} products`);

    if (productCount > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ quantity_available: 0 })
        .eq("store_id", MAGASIN_ID);

      if (updateError) {
        console.error("   ❌ Error:", updateError.message);
      } else {
        console.log(`   ✅ Zeroed ${productCount} products`);
      }
    }

    // ===== VERIFICATION =====
    console.log("\nPHASE 3: Verification...");
    const { count: finalStocks } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    const { data: productQuants } = await supabase
      .from("products")
      .select("quantity_available")
      .eq("store_id", MAGASIN_ID);

    const nonZero = productQuants?.filter(p => p.quantity_available > 0).length || 0;

    console.log(`   store_stocks remaining: ${finalStocks}`);
    console.log(`   products with quantity > 0: ${nonZero}`);

    if (finalStocks === 0 && nonZero === 0) {
      console.log("\n✅ COMPLETELY CLEAN! Ready for injection.");
    } else {
      console.log("\n⚠️  WARNING: Data still exists");
    }

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

totalCleanup();
