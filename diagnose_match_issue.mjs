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

async function diagnose() {
  console.log("🔍 DIAGNOSING MATCHING ISSUE\n");

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
  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, name, quantity_available")
    .eq("store_id", MAGASIN_ID);

  console.log(`Found ${existingProducts?.length} products in database\n`);

  // Check specific product
  const targetProduct = "COPLACA BLEU 17 KG 1GF69B";
  const targetStock = MG813_STOCK_DATA.find(d => d[0] === targetProduct);
  
  console.log(`Looking for: "${targetProduct}"`);
  console.log(`Stock data quantity: ${targetStock ? targetStock[1] : "NOT FOUND"}`);
  
  // Find in database
  const dbProduct = existingProducts.find(p => p.name === targetProduct);
  console.log(`In database: ${dbProduct ? `YES (qty: ${dbProduct.quantity_available})` : "NO"}`);
  
  // Try fuzzy matching
  console.log("\n--- Fuzzy matching results ---");
  let bestMatch = null;
  let bestScore = 0;
  
  for (const product of existingProducts) {
    const score = fuzzyMatch(targetProduct, product.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
    if (score > 70) {
      console.log(`  Score ${score.toFixed(1)}%: ${product.name} (qty: ${product.quantity_available})`);
    }
  }
  
  console.log(`\nBest match: "${bestMatch?.name}" with score ${bestScore.toFixed(1)}%`);
  
  // Check store_stocks for this product
  if (dbProduct) {
    const { data: stocks } = await supabase
      .from("store_stocks")
      .select("quantity")
      .eq("product_id", dbProduct.id)
      .eq("store_id", MAGASIN_ID);
    
    console.log(`\nStore stocks for this product: ${stocks?.length ? stocks[0].quantity : "NONE"}`);
  }
  
  // Show products with 0 quantity that should have 36
  console.log("\n--- Products with 0 quantity that should have 36 ---");
  const productsWith36 = MG813_STOCK_DATA.filter(d => d[1] === 36);
  let mismatchCount = 0;
  
  for (const [name, expectedQty] of productsWith36) {
    const dbProd = existingProducts.find(p => p.name === name);
    if (dbProd && dbProd.quantity_available === 0) {
      mismatchCount++;
      if (mismatchCount <= 10) {
        console.log(`  "${name}" - expected: ${expectedQty}, actual: ${dbProd.quantity_available}`);
      }
    }
  }
  
  console.log(`\nTotal mismatches (expected 36, got 0): ${mismatchCount}`);
}

diagnose();