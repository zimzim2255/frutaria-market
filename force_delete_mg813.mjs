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
  console.log("🔥 FORCE DELETE MG813 STORE_STOCKS\n");

  try {
    // Get mg813 store ID
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Found store: ${stores[0].email}\n`);

    // Get ALL store_stocks for mg813
    console.log("🔍 Fetching ALL store_stocks for mg813...");
    const { data: allStocks, error: fetchError } = await supabase
      .from("store_stocks")
      .select("id")
      .eq("store_id", MAGASIN_ID);

    if (fetchError) {
      console.error("Error fetching:", fetchError);
      process.exit(1);
    }

    console.log(`Found: ${allStocks.length} records\n`);

    if (allStocks.length === 0) {
      console.log("✅ Already clean!");
      process.exit(0);
    }

    // Delete in batches of 100
    console.log("🗑️  Deleting in batches...");
    const batchSize = 100;
    for (let i = 0; i < allStocks.length; i += batchSize) {
      const batch = allStocks.slice(i, i + batchSize);
      const ids = batch.map(s => s.id);

      const { error: deleteError } = await supabase
        .from("store_stocks")
        .delete()
        .in("id", ids);

      if (deleteError) {
        console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
        continue;
      }

      console.log(`   ✅ Deleted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
    }

    console.log(`\n✅ COMPLETE! Deleted ${allStocks.length} records`);

  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

forceDelete();
