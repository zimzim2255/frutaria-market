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

async function smartInjectByReference() {
  console.log("💉 MG813 SMART INJECTION BY REFERENCE\n");
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

    // Get ALL products with reference
    console.log("📋 Fetching products with references...");
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name, reference")
      .eq("store_id", MAGASIN_ID);

    console.log(`   Found: ${allProducts.length} products\n`);

    // Build maps
    const byReference = new Map(allProducts.map(p => [p.reference?.toLowerCase().trim(), p]));
    const byName = new Map();
    for (const p of allProducts) {
      if (!byName.has(p.name.toLowerCase().trim())) {
        byName.set(p.name.toLowerCase().trim(), p);
      }
    }

    let updated = 0;
    let failed = 0;
    let noMatch = [];

    console.log("💰 Processing...\n");

    // Process each injection item
    for (let i = 0; i < MG813_STOCK_DATA.length; i++) {
      const [productName, quantity] = MG813_STOCK_DATA[i];

      if ((i + 1) % 50 === 0) {
        console.log(`├─ ${i + 1}/${MG813_STOCK_DATA.length}`);
      }

      let foundProduct = null;

      // Try 1: Exact name match first
      const exactMatch = byName.get(productName.toLowerCase().trim());
      if (exactMatch) {
        foundProduct = exactMatch;
      } else {
        // Try 2: Fuzzy name match with higher threshold
        let bestScore = 0;
        for (const product of allProducts) {
          const score = fuzzyMatch(productName, product.name);
          if (score > bestScore && score > 85) {
            foundProduct = product;
            bestScore = score;
          }
        }
      }

      if (foundProduct) {
        // Update product quantity
        await supabase
          .from("products")
          .update({ quantity_available: quantity })
          .eq("id", foundProduct.id);

        // UPSERT into store_stocks
        await supabase
          .from("store_stocks")
          .upsert(
            {
              product_id: foundProduct.id,
              store_id: MAGASIN_ID,
              quantity,
            },
            { onConflict: "product_id,store_id" }
          );

        updated++;
      } else {
        noMatch.push(productName);
        failed++;
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ INJECTION RESULT:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`✅ Updated: ${updated} products`);
    console.log(`❌ Not matched: ${failed} products`);

    if (failed > 0 && failed <= 20) {
      console.log(`\n⚠️  Not matched items:`);
      noMatch.forEach(name => {
        console.log(`   • ${name}`);
      });
    }

  } catch (error) {
    console.error("❌ Fatal error:", error.message);
  }
}

smartInjectByReference();
