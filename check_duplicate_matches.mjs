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

async function checkDuplicateMatches() {
  console.log("🔍 CHECKING FOR DUPLICATE MATCHES\n");

  try {
    // Get mg813
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .ilike("email", "%mg813%");

    const MAGASIN_ID = stores[0].id;

    // Get all products
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name")
      .eq("store_id", MAGASIN_ID);

    console.log(`Processing ${MG813_STOCK_DATA.length} injection items...\n`);

    const productMatchCount = {};
    const matchedItems = {};

    // Track which products get matched multiple times
    for (const [productName, quantity] of MG813_STOCK_DATA) {
      const { product: found } = findBestMatch(productName, allProducts);
      if (found) {
        if (!productMatchCount[found.id]) {
          productMatchCount[found.id] = [];
        }
        productMatchCount[found.id].push({ name: productName, qty: quantity });
        matchedItems[productName] = found.id;
      }
    }

    // Find products matched multiple times
    const duplicates = Object.entries(productMatchCount)
      .filter(([, matches]) => matches.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    console.log(`❌ Products matched MULTIPLE times: ${duplicates.length}\n`);

    if (duplicates.length > 0) {
      console.log(`Top 10 duplicates:\n`);
      for (let i = 0; i < Math.min(10, duplicates.length); i++) {
        const [productId, matches] = duplicates[i];
        const product = allProducts.find(p => p.id === productId);
        console.log(`Product: "${product.name}" (${matches.length} injection items mapped to it)`);
        matches.forEach(m => {
          console.log(`   • "${m.name}" → qty ${m.qty}`);
        });
        console.log();
      }

      console.log(`\n⚠️  This explains the mismatch!`);
      console.log(`   Multiple injection items are updating the SAME product`);
      console.log(`   Last one wins, overwrites previous quantities`);
    } else {
      console.log(`✅ No duplicates found - each injection item matches unique product`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkDuplicateMatches();
