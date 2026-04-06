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

function fuzzyMatch(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 100;
  let matches = 0;
  for (let char of s1) {
    if (s2.includes(char)) matches++;
  }
  return (matches / Math.max(s1.length, s2.length)) * 100;
}

function findBestMatch(stockName, products) {
  let best = null;
  let bestScore = 0;
  for (const product of products) {
    const score = fuzzyMatch(stockName, product.name);
    if (score > bestScore && score > 70) {
      best = product;
      bestScore = score;
    }
  }
  return { product: best, score: bestScore };
}

async function smartInject() {
  console.log("💉 MG813 SMART INJECTION (UPSERT LOGIC)\n");
  console.log(`📦 Products to inject: ${MG813_STOCK_DATA.length}\n`);

  try {
    // Get mg813
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg813%");

    if (!stores || stores.length === 0) {
      console.error("❌ Could not find mg813");
      process.exit(1);
    }

    const MAGASIN_ID = stores[0].id;

    // Get all products
    console.log("📋 Fetching products...");
    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, name")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${existingProducts?.length} products\n`);

    let updated = 0;
    let created = 0;
    let failed = 0;

    console.log("💰 Processing...\n");

    for (let i = 0; i < MG813_STOCK_DATA.length; i++) {
      const [productName, quantity] = MG813_STOCK_DATA[i];

      if ((i + 1) % 50 === 0) {
        console.log(`├─ ${i + 1}/${MG813_STOCK_DATA.length}`);
      }

      // Find product
      const { product: foundProduct } = findBestMatch(productName, existingProducts || []);

      if (foundProduct) {
        // Update product quantity
        await supabase
          .from("products")
          .update({ quantity_available: quantity })
          .eq("id", foundProduct.id);

        // UPSERT into store_stocks (insert or update)
        const { error } = await supabase
          .from("store_stocks")
          .upsert(
            {
              product_id: foundProduct.id,
              store_id: MAGASIN_ID,
              quantity,
            },
            { onConflict: "product_id,store_id" }
          );

        if (error) {
          console.log(`   ❌ ${productName}: ${error.message}`);
          failed++;
        } else {
          updated++;
        }
      } else {
        created++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION COMPLETE:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✏️  Updated: ${updated} products`);
    console.log(`❌ Failed: ${failed}`);

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

smartInject();
