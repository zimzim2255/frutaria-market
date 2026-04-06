import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { MG813_STOCK_DATA } from "./mg813_stock_data.mjs";

const envLocalContent = fs.readFileSync(".env.local", "utf-8");
const supabaseUrlMatch = envLocalContent.match(/SUPABASE_URL=(.+)/);
const supabaseKeyMatch = envLocalContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

const SUPABASE_URL = supabaseUrlMatch[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = supabaseKeyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function showMissing() {
  try {
    // Get mg813 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;

    // Get all products for mg813
    const { data: products } = await supabase
      .from("products")
      .select("name")
      .eq("store_id", MAGASIN_ID);

    const existingNames = new Set(products.map(p => p.name));

    console.log("🔍 Products from mg813 stock data NOT found in database:\n");

    let count = 0;
    MG813_STOCK_DATA.forEach(([name, qty]) => {
      if (!existingNames.has(name)) {
        count++;
        console.log(`   ${count}. ${name} (stock: ${qty})`);
      }
    });

    console.log(`\nTotal missing: ${count} products`);

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

showMissing();