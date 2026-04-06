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

async function clearBothTables() {
  console.log("🧹 CLEARING MG813 STOCK FROM BOTH TABLES\n");

  try {
    // Get mg813 store ID
    console.log("🔍 Finding mg813 store...");
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`   Found: ${stores[0].email} (${MAGASIN_ID})\n`);

    // 1. Clear store_stocks table
    console.log("📋 Step 1: Clearing store_stocks table for mg813...");
    const { count: actualCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${actualCount} store_stocks records for mg813`);

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
    console.log("\n📋 Step 2: Clearing products table for mg813 (quantity_available = 0)...");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${productCount} products for mg813`);

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
