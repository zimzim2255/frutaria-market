-- ============================================================================
-- Sales Items Matching Products - Complete Details
-- ============================================================================
-- Shows ONLY sale items where caisse matches the product's quantity_available
-- Includes ALL details needed: product name, reference, stock_reference, 
-- caisse, quantity, magasin, and all related information
-- ============================================================================

SELECT 
    -- Magasin Information
    s.name AS "Magasin",
    s.email AS "Email Magasin",
    
    -- Sale Information
    sa.sale_number AS "Numéro Vente",
    sa.sale_date AS "Date Vente",
    sa.total_amount AS "Total Vente MAD",
    sa.payment_status AS "Statut Paiement",
    
    -- Sale Item Information
    si.name AS "Nom Produit Vendu",
    si.reference AS "Référence Vente",
    si.quantity AS "Quantité Vendue",
    si.caisse AS "Caisse Vendue",
    si.unit_price AS "Prix Unitaire MAD",
    si.total_price AS "Total Ligne MAD",
    si.moyenne AS "Moyenne Vente",
    si.category AS "Catégorie Vente",
    si.lot AS "Lot Vente",
    
    -- Product Information (from products table)
    p.name AS "Nom Produit Stock",
    p.reference AS "Référence Stock",
    p.stock_reference AS "Stock Référence",
    p.quantity_available AS "Quantité Disponible",
    p.number_of_boxes AS "Nombre Boîtes",
    p.purchase_price AS "Prix Achat MAD",
    p.sale_price AS "Prix Vente MAD",
    p.category AS "Catégorie Stock",
    
    -- Match Information
    CASE 
        WHEN si.caisse = p.quantity_available AND si.quantity = p.number_of_boxes 
        THEN 'MATCH EXACT'
        WHEN si.caisse = p.quantity_available 
        THEN 'CAISSE MATCH'
        ELSE 'QUANTITÉ MATCH'
    END AS "Type Correspondance",
    
    -- User Information
    u.email AS "Créé Par",
    sa.created_at AS "Date Création"
    
FROM sale_items si
JOIN sales sa ON si.sale_id = sa.id
JOIN stores s ON sa.store_id = s.id
JOIN products p ON si.product_id = p.id
LEFT JOIN users u ON sa.created_by = u.id
WHERE 
    s.id = p.store_id  -- Same magasin
    AND si.caisse = p.quantity_available  -- Caisse must match
ORDER BY s.name, p.name, sa.sale_date DESC;