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
  console.log("✅ VERIFYING MG76 INJECTION\n");

  try {
    // Get mg76 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg76%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg76");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`📍 Store: ${stores[0].email}\n`);

    // Check store_stocks
    const { count: stockCount } = await supabase
      .from("store_stocks")
      .select("*", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    const { data: stockSamples } = await supabase
      .from("store_stocks")
      .select("product_id, quantity")
      .eq("store_id", MAGASIN_ID)
      .limit(5);

    console.log("📊 Store Stocks Table:");
    console.log(`   Total records: ${stockCount}`);
    if (stockSamples && stockSamples.length > 0) {
      console.log("   Sample records:");
      stockSamples.forEach(s => {
        console.log(`     • product_id: ${s.product_id}, quantity: ${s.quantity}`);
      });
    }
    console.log();

    // Check products
    const { count: productCount } = await supabase
      .from("products")
      .select("id, name, quantity_available", { count: "exact", head: true })
      .eq("store_id", MAGASIN_ID);

    const { data: productStats } = await supabase
      .from("products")
      .select("quantity_available")
      .eq("store_id", MAGASIN_ID)
      .not('quantity_available', 'eq', 0);

    const nonZeroCount = productStats?.length || 0;
    const totalQty = productStats?.reduce((sum, p) => sum + (p.quantity_available || 0), 0) || 0;
    const avgQty = productCount > 0 ? (totalQty / productCount).toFixed(2) : 0;

    console.log("📦 Products Table (mg76):");
    console.log(`   Total products: ${productCount}`);
    console.log(`   Non-zero quantities: ${nonZeroCount}`);
    console.log(`   Total quantity_available: ${totalQty}`);
    console.log(`   Average: ${avgQty}`);

    // Check products with 0 stock
    const zeroStockProducts = await supabase
      .from("products")
      .select("name, quantity_available")
      .eq("store_id", MAGASIN_ID)
      .eq("quantity_available", 0);

    console.log(`\n📋 Products with 0 stock: ${zeroStockProducts.data?.length || 0}`);
    if (zeroStockProducts.data && zeroStockProducts.data.length > 0) {
      console.log("   These products still need stock:");
      zeroStockProducts.data.slice(0, 10).forEach(p => {
        console.log(`     • ${p.name}`);
      });
      if (zeroStockProducts.data.length > 10) {
        console.log(`     ... and ${zeroStockProducts.data.length - 10} more`);
      }
    }

    console.log("\n✅ VERIFICATION COMPLETE!");

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

verify();