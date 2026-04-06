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

async function nuke() {
  console.log("🔥 NUCLEAR DELETE - MG813 STORE_STOCKS\n");

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
    console.log(`Target store ID: ${MAGASIN_ID}\n`);

    // Step 1: Check how many exist
    console.log("Step 1: Checking current count...");
    const { count: before } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${before} records\n`);

    if (before === 0) {
      console.log("✅ Already clean!");
      process.exit(0);
    }

    // Step 2: Delete all at once
    console.log("Step 2: Deleting all records...");
    const { error: deleteError } = await supabase
      .from("store_stocks")
      .delete()
      .eq("store_id", MAGASIN_ID);

    if (deleteError) {
      console.error("❌ Delete error:", deleteError);
      process.exit(1);
    }

    // Step 3: Verify deletion
    console.log("Step 3: Verifying deletion...");
    const { count: after } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    console.log(`   Remaining: ${after} records\n`);

    if (after === 0) {
      console.log(`✅ SUCCESS! Deleted ${before} records`);
    } else {
      console.log(`⚠️  WARNING: ${after} records still remain`);
    }

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

nuke();
