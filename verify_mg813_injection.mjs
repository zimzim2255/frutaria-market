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

async function verify() {
  console.log("✅ VERIFYING MG813 INJECTION\n");

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
    console.log(`📍 Store: ${stores[0].email}\n`);

    // Check store_stocks
    console.log("📊 Store Stocks Table:");
    const { count: stockCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);
    console.log(`   Total records: ${stockCount}`);

    // Sample some records
    const { data: samples } = await supabase
      .from("store_stocks")
      .select("id, quantity, product_id")
      .eq("store_id", MAGASIN_ID)
      .limit(5);

    if (samples && samples.length > 0) {
      console.log(`   Sample records:`);
      samples.forEach((s) => {
        console.log(`     • product_id: ${s.product_id}, quantity: ${s.quantity}`);
      });
    }

    // Check products
    console.log("\n📦 Products Table (mg813):");
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);
    console.log(`   Total products: ${productCount}`);

    // Get average quantity_available
    const { data: quantities } = await supabase
      .from("products")
      .select("quantity_available")
      .eq("store_id", MAGASIN_ID);

    if (quantities && quantities.length > 0) {
      const total = quantities.reduce((sum, p) => sum + (p.quantity_available || 0), 0);
      const avg = (total / quantities.length).toFixed(2);
      const nonZero = quantities.filter((p) => p.quantity_available > 0).length;
      console.log(`   Non-zero quantities: ${nonZero}`);
      console.log(`   Total quantity_available: ${total}`);
      console.log(`   Average: ${avg}`);
    }

    console.log("\n✅ VERIFICATION COMPLETE!");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

verify();
