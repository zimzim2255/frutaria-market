-- DIAGNOSTIC: Stock Display Comparison - Admin vs Manager/Caissier
-- Run these SELECT queries to see how stock appears in each interface
-- Just for viewing data, no modifies

-- ============================================
-- 1. SHOW ALL PRODUCTS WITH STOCK PER MAGASIN (how ADMIN sees it)
-- ============================================
-- Admin sees one row per product-magasin, can filter by selecting magasin dropdown
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.reference as product_ref,
    p.quantity_available as produits_table_caisse,
    s.id as store_id,
    s.name as magasin_name,
    ss.quantity as caisse_at_this_magasin
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
LEFT JOIN stores s ON ss.store_id = s.id
ORDER BY p.name, s.name;

-- ============================================
-- 2. SHOW STOCK FOR A SPECIFIC MAGASIN (how MANAGER sees it)
-- Replace 'MAGASIN_ID' with actual store_id
-- ============================================
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.reference as product_ref,
    p.quantity_available as produits_table_caisse,
    ss.quantity as caisse_in_your_magasin,  -- This is what caissier sees
    s.name as your_magasin
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
LEFT JOIN stores s ON ss.store_id = s.id
WHERE ss.store_id = 'MAGASIN_ID'  -- Replace with store_id
ORDER BY p.name;

-- ============================================
-- 3. SHOW ALL STORES (to find your MAGASIN_ID)
-- ============================================
SELECT id, name, user_id FROM stores ORDER BY name;

-- ============================================
-- 4. SIDE BY SIDE: Same product in different magasins
-- ============================================
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.reference as product_ref,
    p.quantity_available as produits_caisse,
    s.id as store_id,
    s.name as magasin,
    ss.quantity as caisse_at_magasin,
    (SELECT SUM(ss2.quantity) FROM store_stocks ss2 WHERE ss2.product_id = p.id) as total_all_magasins
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
LEFT JOIN stores s ON ss.store_id = s.id
ORDER BY p.name, s.name
LIMIT 50;