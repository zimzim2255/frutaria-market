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

async function findProductData() {
  console.log("🔍 SEARCHING FOR MG739 PRODUCT DATA IN DATABASE\n");

  try {
    // Get mg739 store ID
    const { data: stores } = await supabase
      .from("stores")
      .select("id, email")
      .ilike("email", "%mg739%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg739 store");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;
    console.log(`Found store: ${stores[0].email}`);
    console.log(`Store ID: ${MAGASIN_ID}\n`);

    const productSet = new Set();

    // Check sales_items table
    console.log("1. Checking sales_items...");
    const { data: salesItems } = await supabase
      .from("sales_items")
      .select("product_name, purchase_price, selling_price, unit")
      .eq("store_id", MAGASIN_ID)
      .limit(200);

    if (salesItems && salesItems.length > 0) {
      console.log(`   Found ${salesItems.length} sales items`);
      for (const item of salesItems) {
        if (item.product_name) {
          productSet.add(JSON.stringify({
            name: item.product_name,
            purchase_price: item.purchase_price || 0,
            selling_price: item.selling_price || 0,
            unit: item.unit || 'unité'
          }));
        }
      }
    } else {
      console.log("   No sales items found");
    }

    // Check product_additions_history table
    console.log("\n2. Checking product_additions_history...");
    const { data: additions } = await supabase
      .from("product_additions_history")
      .select("product_name, purchase_price, selling_price, unit, reference")
      .eq("store_id", MAGASIN_ID)
      .limit(200);

    if (additions && additions.length > 0) {
      console.log(`   Found ${additions.length} product additions`);
      for (const item of additions) {
        if (item.product_name) {
          productSet.add(JSON.stringify({
            name: item.product_name,
            purchase_price: item.purchase_price || 0,
            selling_price: item.selling_price || 0,
            unit: item.unit || 'unité',
            reference: item.reference || null
          }));
        }
      }
    } else {
      console.log("   No product additions found");
    }

    // Check stock_reference_history table
    console.log("\n3. Checking stock_reference_history...");
    const { data: stockHistory } = await supabase
      .from("stock_reference_history")
      .select("product_name, reference, purchase_price, selling_price")
      .eq("store_id", MAGASIN_ID)
      .limit(200);

    if (stockHistory && stockHistory.length > 0) {
      console.log(`   Found ${stockHistory.length} stock reference history items`);
      for (const item of stockHistory) {
        if (item.product_name) {
          productSet.add(JSON.stringify({
            name: item.product_name,
            purchase_price: item.purchase_price || 0,
            selling_price: item.selling_price || 0,
            reference: item.reference || null
          }));
        }
      }
    } else {
      console.log("   No stock reference history found");
    }

    // Parse and display results
    const products = Array.from(productSet).map(s => JSON.parse(s));
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📦 Total unique products found: ${products.length}`);
    console.log(`${"=".repeat(70)}`);

    if (products.length > 0) {
      console.log("\nFirst 10 products:");
      products.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name}`);
      });

      // Save to file for later use
      fs.writeFileSync('mg739_restored_products.json', JSON.stringify(products, null, 2));
      console.log(`\n✅ Full list saved to mg739_restored_products.json`);
    } else {
      console.log("\n❌ No product data found in any table!");
    }

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

findProductData();