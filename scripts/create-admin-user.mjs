#!/usr/bin/env node
/**
 * Create a Supabase Auth user and ensure the app's public.users record is set to role=admin.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://<project-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   node scripts/create-admin-user.mjs --email admin@hmad.com --password "TempPass#123" --store-first
 *   node scripts/create-admin-user.mjs --email admin@hmad.com --password "TempPass#123" --store-id <uuid>
 */

import process from 'node:process';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const email = getArg('--email');
const password = getArg('--password');
const storeIdArg = getArg('--store-id');
const storeFirst = hasFlag('--store-first');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!email || !password) {
  console.error('Usage: node scripts/create-admin-user.mjs --email <email> --password <password> [--store-id <uuid> | --store-first]');
  process.exit(1);
}

if ((storeIdArg ? 1 : 0) + (storeFirst ? 1 : 0) !== 1) {
  console.error('Provide exactly one of: --store-id <uuid> OR --store-first');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function resolveStoreId() {
  if (storeIdArg) return storeIdArg;

  const { data, error } = await supabase
    .from('stores')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(`Failed to fetch stores: ${error.message}`);
  if (data && data.length > 0) return data[0].id;

  // If no stores exist yet, create one for this admin (your system counts admin as a store).
  // Schema notes (from initial migration): stores.email is UNIQUE NOT NULL, stores.name NOT NULL.
  const storePayload = {
    name: 'Admin',
    email,
    status: 'active',
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('stores')
    .insert(storePayload)
    .select('id')
    .single();

  if (insertErr) throw new Error(`Failed to create admin store: ${insertErr.message}`);
  if (!inserted?.id) throw new Error('Admin store created but no id returned.');
  return inserted.id;
}

async function findUserIdByEmail(targetEmail) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
    if (match) return match.id;
    if (users.length < perPage) return null;
    page++;
  }
}

async function ensureAuthUser(targetEmail, targetPassword) {
  const existingId = await findUserIdByEmail(targetEmail);
  if (existingId) return { id: existingId, created: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email: targetEmail,
    password: targetPassword,
    email_confirm: true,
  });

  if (error) throw new Error(`Failed to create auth user: ${error.message}`);
  const id = data?.user?.id;
  if (!id) throw new Error('Auth user created but no user id returned.');
  return { id, created: true };
}

async function upsertAppUser(userId, storeId) {
  // All permissions for admin
  const allPermissions = [
    // Dashboard
    'Voir le Tableau de Bord',
    
    // Products
    'Voir les Produits',
    'Ajouter un Produit',
    'Modifier un Produit',
    'Supprimer un Produit',
    'Voir les Modèles de Produits',
    'Voir Historique Ajouts',
    'Exporter Historique Ajouts (CSV)',
    "Voir Détails Ajout",
    'Voir Historique Références Stock',
    'Exporter Historique Références Stock (CSV)',
    'Voir Détails Référence Stock',
    'Modifier Historique Références Stock',
    
    // Stores/Magasins
    'Voir les Magasins',
    'Ajouter un Magasin',
    'Modifier un Magasin',
    'Supprimer un Magasin',
    
    // Clients
    'Voir les Clients',
    'Ajouter un Client',
    'Modifier un Client',
    'Supprimer un Client',
    
    // Sales
    'Voir les Ventes',
    'Créer une Vente',
    'Modifier une Vente',
    'Annuler une Vente',
    'Supprimer une Vente',
    'Imprimer une Vente',
    "Voir l'Historique des Ventes",
    'Exporter Ventes (CSV)',
    'Exporter Ventes',
    'Exporter',
    'Voir les Ventes',
    "Voir l'Historique des Ventes",
    
    // Purchases/Transfers
    'Voir Achats/Transferts',
    'Créer un Achat/Transfert',
    
    // Suppliers
    'Voir les Fournisseurs',
    'Ajouter un Fournisseur',
    'Modifier un Fournisseur',
    'Supprimer un Fournisseur',
    
    // Payments
    'Voir les Paiements',
    'Ajouter un Paiement',
    
    // Checks
    'Voir les Chèques',
    'Ajouter un Chèque',
    "Voir l'Inventaire des Chèques",
    'Modifier un Chèque',
    'Supprimer un Chèque',
    'Transférer un Chèque au Coffre',
    'Payer un Fournisseur par Chèque',
    'Payer un Client par Chèque',
    
    // Caisse
    'Voir la Caisse',
    'Exporter Caisse (CSV)',
    'Exporter Caisse',
    'Exporter Caisse (Excel)',
    'Exporter Caisse (PDF)',
    'Voir Détails Paiement (Caisse)',
    'Voir Details Paiement (Caisse)',
    'Voir Details Paiement Caisse',
    'Voir Détails Paiement Caisse',
    
    // Cash Space
    "Voir l'Espace Caisse",
    'Voir Espace Caisse',
    
    // Charges
    'Voir les Charges',
    
    // Coffre
    'Voir le Coffre',
    'Ajouter une Entrée Coffre',
    'Modifier une Entrée Coffre',
    'Supprimer une Entrée Coffre',
    'Créer une Avance Fournisseur (Coffre)',
    'Paiement Global Fournisseur (Coffre)',
    
    // Orders
    'Voir les Commandes',
    
    // Factures
    "Voir la page Facture (Création)",
    'Créer une Facture',
    'Modifier une Facture',
    'Supprimer une Facture',
    "Voir l'Historique des Factures",
    
    // Invoices
    'Voir les Factures',
    
    // Discounts
    'Voir les Remises',
    'Ajouter une Remise',
    'Modifier une Remise',
    'Supprimer une Remise',
    
    // Users Management
    'Gérer les Utilisateurs',
    
    // Borrowed Money
    'Voir les Prêts',
    'Ajouter un Prêt',
    'Enregistrer un Paiement de Prêt',
    'Supprimer un Prêt',
    "Voir le Détail d'un Prêt",
  ];

  const payload = {
    id: userId,
    email,
    role: 'admin',
    store_id: storeId,
    is_active: true,
    permissions: allPermissions,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
  if (error) throw new Error(`Failed to upsert public.users: ${error.message}`);
}

try {
  const authUser = await ensureAuthUser(email, password);
  const storeId = await resolveStoreId();
  await upsertAppUser(authUser.id, storeId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        user_id: authUser.id,
        store_id: storeId,
        auth_user_created: authUser.created,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
}
