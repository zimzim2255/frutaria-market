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

const MAGASIN_ID = "7c9fdbf3-ee76-4989-bd63-3473ec34f1d2"; // mg76

async function clearBothTables() {
  console.log("🧹 CLEARING MG76 STOCK FROM BOTH TABLES\n");

  try {
    // 1. Clear store_stocks table (set quantity to 0)
    console.log("📋 Step 1: Clearing store_stocks table for mg76...");
    const { data: storeStocksData, error: storeStocksError } = await supabase
      .from("store_stocks")
      .select("id", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    if (storeStocksError) {
      console.error("❌ Error counting store_stocks:", storeStocksError);
      return;
    }

    const storeStocksCount = storeStocksData ? 0 : 0;
    const { count: actualCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${actualCount} store_stocks records for mg76`);

    if (actualCount > 0) {
      const { data: toDelete } = await supabase
        .from("store_stocks")
        .select("id")
        .eq("store_id", MAGASIN_ID);

      for (const record of toDelete) {
        await supabase.from("store_stocks").delete().eq("id", record.id);
      }
      console.log(`   ✅ Deleted ${actualCount} store_stocks records`);
    } else {
      console.log(`   ℹ️  No records to delete`);
    }

    // 2. Clear products table (set quantity_available to 0)
    console.log("\n📋 Step 2: Clearing products table for mg76 (quantity_available = 0)...");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${productCount} products for mg76`);

    if (productCount > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ quantity_available: 0 })
        .eq("store_id", MAGASIN_ID);

      if (updateError) {
        console.error("❌ Error updating products:", updateError);
        return;
      }
      console.log(`   ✅ Set quantity_available to 0 for ${productCount} products`);
    } else {
      console.log(`   ℹ️  No products to update`);
    }

    console.log("\n✅ CLEARING COMPLETE!");
    console.log(`\n📊 Summary:`);
    console.log(`   • Deleted ${actualCount} store_stocks records`);
    console.log(`   • Zeroed ${productCount} products quantity_available`);

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

clearBothTables();
