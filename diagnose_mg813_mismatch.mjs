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

async function diagnose() {
  console.log("🔍 MG813 INJECTION MISMATCH DIAGNOSIS\n");

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
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name, quantity_available")
      .eq("store_id", MAGASIN_ID);

    console.log(`Total mg813 products: ${allProducts.length}`);
    console.log(`Injection data items: ${MG813_STOCK_DATA.length}\n`);

    // Find products that ARE in injection
    let matched = 0;
    let notMatched = 0;
    const notMatchedNames = [];

    for (const [productName, quantity] of MG813_STOCK_DATA) {
      const { product: found } = findBestMatch(productName, allProducts);
      if (found) {
        matched++;
      } else {
        notMatched++;
        notMatchedNames.push(productName);
      }
    }

    console.log(`✅ Injection items matched: ${matched}`);
    console.log(`❌ Injection items NOT matched: ${notMatched}\n`);

    if (notMatched > 0 && notMatched <= 20) {
      console.log("Not matched items:");
      notMatchedNames.forEach(name => {
        console.log(`   • ${name}`);
      });
    }

    // Find products that DON'T have injection data
    console.log(`\n🔎 Products NOT in injection data:`);
    let unmapped = 0;
    const unmappedProducts = [];
    
    for (const prod of allProducts) {
      let hasData = false;
      for (const [injectionName] of MG813_STOCK_DATA) {
        const score = fuzzyMatch(injectionName, prod.name);
        if (score > 70) {
          hasData = true;
          break;
        }
      }
      if (!hasData) {
        unmapped++;
        unmappedProducts.push(prod);
      }
    }

    console.log(`Total: ${unmapped} products`);
    if (unmapped <= 15) {
      console.log(`\nThese products need manual mapping:`);
      unmappedProducts.forEach(p => {
        console.log(`   • ${p.name} (current qty: ${p.quantity_available})`);
      });
    } else {
      console.log(`\nFirst 10 unmapped products:`);
      unmappedProducts.slice(0, 10).forEach(p => {
        console.log(`   • ${p.name}`);
      });
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

diagnose();
