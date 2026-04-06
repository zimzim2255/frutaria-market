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
  console.log("🗑️  CLEARING MG739 - BOTH TABLES\n");

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

    // Step 2: Delete products
    console.log("\nStep 2: Deleting products...");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found ${productCount} products`);

    if (productCount > 0) {
      const { error: deleteProductError } = await supabase
        .from("products")
        .delete()
        .eq("store_id", MAGASIN_ID);

      if (deleteProductError) {
        console.error(`   ❌ Error deleting products: ${deleteProductError.message}`);
      } else {
        console.log(`   ✅ Deleted ${productCount} products`);
      }
    }

    // Step 3: Verify deletion
    console.log("\nStep 3: Verifying deletion...");
    const { count: remainingStocks } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    const { count: remainingProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Remaining store_stocks: ${remainingStocks}`);
    console.log(`   Remaining products: ${remainingProducts}`);

    if (remainingStocks === 0 && remainingProducts === 0) {
      console.log("\n✅ COMPLETE! Both tables cleared for mg739");
    } else {
      console.log("\n⚠️  WARNING: Some records may still remain");
    }

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

clearBoth();