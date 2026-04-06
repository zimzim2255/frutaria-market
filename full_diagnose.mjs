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

async function diagnose() {
  console.log("🔍 Checking all store_stocks records for mg76...\n");

  // Get all stocks for mg76
  const { data: mgStocks, error: error1 } = await supabase
    .from("store_stocks")
    .select("id, quantity, product_id, created_at")
    .eq("store_id", MAGASIN_ID);

  if (error1) {
    console.error("❌ Error:", error1.message);
    process.exit(1);
  }

  console.log(`📊 Total store_stocks records for mg76: ${mgStocks.length}`);
  
  if (mgStocks.length > 0) {
    console.log("\nSample records:");
    mgStocks.slice(0, 10).forEach((r, i) => {
      console.log(`  ${i + 1}. Product: ${r.product_id}, Qty: ${r.quantity}, Created: ${r.created_at}`);
    });
    
    if (mgStocks.length > 10) {
      console.log(`  ... and ${mgStocks.length - 10} more`);
    }
  }

  // Also check if there's a different table being used
  console.log("\n📋 Checking if there are other tables...");
  const { data: tables, error: error2 } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public");

  if (!error2 && tables) {
    console.log("Available tables:");
    tables.forEach(t => {
      if (["stock", "product", "store", "inventory", "magasin"].some(word => t.table_name.includes(word))) {
        console.log(`  - ${t.table_name}`);
      }
    });
  }
}

diagnose().catch(console.error);
