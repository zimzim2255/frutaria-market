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

async function forceDelete() {
  console.log("🔥 FORCE DELETE MG823 STORE_STOCKS ONLY\n");

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

    // Get ALL store_stocks for mg823
    console.log("🔍 Fetching ALL store_stocks for mg823...");
    const { data: allStocks, error: fetchError } = await supabase
      .from("store_stocks")
      .select("id")
      .eq("store_id", MAGASIN_ID);

    if (fetchError) {
      console.error("Error fetching:", fetchError);
      process.exit(1);
    }

    console.log(`Found: ${allStocks.length} store_stocks records\n`);

    if (allStocks.length === 0) {
      console.log("✅ Already clean!");
      process.exit(0);
    }

    // Delete in batches of 100
    console.log("🗑️  Deleting store_stocks in batches...\n");
    const batchSize = 100;
    for (let i = 0; i < allStocks.length; i += batchSize) {
      const batch = allStocks.slice(i, i + batchSize);
      const ids = batch.map(s => s.id);

      const { error: deleteError } = await supabase
        .from("store_stocks")
        .delete()
        .in("id", ids);

      if (deleteError) {
        console.error(`Error deleting batch ${Math.floor(i / batchSize) + 1}:`, deleteError);
        continue;
      }

      console.log(`   ✅ Deleted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
    }

    // Verify deletion
    const { count: remaining } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`\n   Remaining store_stocks: ${remaining}`);

    if (remaining === 0) {
      console.log("\n✅ COMPLETE! All store_stocks cleared for mg823 (products table untouched)");
    } else {
      console.log(`\n⚠️  WARNING: ${remaining} records still remain`);
    }

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

forceDelete();