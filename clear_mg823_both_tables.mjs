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

async function clearBoth() {
  console.log("🗑️  CLEARING MG823 - STORE_STOCKS AND RESETTING PRODUCTS\n");

  try {
    // Get mg823 store ID
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg823%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg823 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Found store: ${stores[0].email}`);
    console.log(`Store ID: ${MAGASIN_ID}\n`);

    // Step 1: Delete store_stocks
    console.log("Step 1: Deleting store_stocks...");
    const { count: stockCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found ${stockCount} store_stocks records`);

    if (stockCount > 0) {
      const { error: deleteStockError } = await supabase
        .from("store_stocks")
        .delete()
        .eq("store_id", MAGASIN_ID);

      if (deleteStockError) {
        console.error(`   ❌ Error deleting store_stocks: ${deleteStockError.message}`);
      } else {
        console.log(`   ✅ Deleted ${stockCount} store_stocks records`);
      }
    }

    // Step 2: Reset products quantity_available to 0 (NOT delete products)
    console.log("\nStep 2: Resetting products quantity_available to 0...");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found ${productCount} products`);

    if (productCount > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ quantity_available: 0 })
        .eq("store_id", MAGASIN_ID);

      if (updateError) {
        console.error(`   ❌ Error resetting products: ${updateError.message}`);
      } else {
        console.log(`   ✅ Reset ${productCount} products quantity_available to 0`);
      }
    }

    // Step 3: Verify
    console.log("\nStep 3: Verifying...");
    const { count: remainingStocks } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    const { data: productCheck } = await supabase
      .from("products")
      .select("quantity_available")
      .eq("store_id", MAGASIN_ID)
      .not('quantity_available', 'eq', 0);

    console.log(`   Remaining store_stocks: ${remainingStocks}`);
    console.log(`   Products with non-zero quantity: ${productCheck?.length || 0}`);

    if (remainingStocks === 0 && (productCheck?.length || 0) === 0) {
      console.log("\n✅ COMPLETE! store_stocks cleared and products reset for mg823");
    } else {
      console.log("\n⚠️  WARNING: Some records may still have data");
    }

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

clearBoth();