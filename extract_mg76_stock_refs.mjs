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

async function extractStockRefs() {
  console.log("📝 Extracting mg76 stock_reference values...\n");

  try {
    // Get mg76 store
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg76%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg76");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;

    // Get all products for mg76 with stock_reference
    const { data: products } = await supabase
      .from("products")
      .select("name, stock_reference")
      .eq("store_id", MAGASIN_ID);

    console.log(`Found ${products.length} products\n`);

    // Create a map of products with stock_reference
    const stockRefs = {};
    products.forEach(p => {
      if (p.stock_reference) {
        stockRefs[p.name] = p.stock_reference;
      }
    });

    // Save to file
    const content = `// mg76 stock_reference backup
// Generated: ${new Date().toISOString()}
export const MG76_STOCK_REFS = ${JSON.stringify(stockRefs, null, 2)};
`;

    fs.writeFileSync("mg76_stock_refs.mjs", content);
    console.log("✅ Saved to mg76_stock_refs.mjs");
    console.log(`   Products with stock_reference: ${Object.keys(stockRefs).length}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

extractStockRefs();