// Force redeploy - stock deduction logging added - invoice generation fix
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

type AppRole = "admin" | "manager" | "user";

function normalizeRole(role: any): AppRole {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "manager" || r === "user") return r;
  return "user";
}

function buildRoleBasedPermissions(role: AppRole): string[] {
  // Centralized, role-based permissions. Never trust client-provided permissions.
  // NOTE: Strings must match what the frontend checks.

  const allPermissions: string[] = [
    "Voir le Tableau de Bord",
    "Voir les Rapports",

    "Voir les Produits",
    "Ajouter un Produit",
    "Modifier un Produit",
    "Supprimer un Produit",

    "Voir les Modèles de Produits",
    "Ajouter un Modèle de Produit",
    "Modifier un Modèle de Produit",
    "Supprimer un Modèle de Produit",

    "Voir les Magasins",
    "Ajouter un Magasin",
    "Modifier un Magasin",
    "Supprimer un Magasin",
    "Échanges Inter-Magasins",

    "Voir les Fournisseurs",
    "Ajouter un Fournisseur",
    "Modifier un Fournisseur",
    "Supprimer un Fournisseur",

    "Voir les Commandes",
    "Créer une Commande",
    "Modifier une Commande",
    "Supprimer une Commande",
    "Voir les Bons de Commande",
    "Créer un Bon de Commande",
    "Modifier un Bon de Commande",
    "Supprimer un Bon de Commande",

    "Voir les Ventes",
    "Créer une Vente",
    "Modifier une Vente",
    "Supprimer une Vente",
    "Voir l'Historique des Ventes",
    "Imprimer une Vente",

    "Voir les Paiements",
    "Ajouter un Paiement",
    "Modifier un Paiement",
    "Supprimer un Paiement",

    "Voir les Chèques",
    "Ajouter un Chèque",
    "Modifier un Chèque",
    "Supprimer un Chèque",
    "Voir l'Inventaire des Chèques",
    "Transférer un Chèque au Coffre",
    "Payer un Fournisseur par Chèque",
    "Payer un Client par Chèque",

    "Voir Achats/Transferts",
    "Créer un Achat/Transfert",
    "Modifier un Achat/Transfert",
    "Supprimer un Achat/Transfert",

    "Voir la page Facture (Création)",
    "Créer une Facture",

    "Voir l'Historique des Factures",
    "Voir le Détail d'une Facture",
    "Imprimer / Télécharger une Facture (PDF)",
    "Modifier une Facture",
    "Supprimer une Facture",

    "Voir les Remises",
    "Ajouter une Remise",
    "Modifier une Remise",
    "Supprimer une Remise",

    "Voir les Clients",
    "Ajouter un Client",
    "Modifier un Client",
    "Supprimer un Client",

    "Voir la Caisse",
    "Voir l'Espace Caisse",
    "Voir les Charges",
    "Exporter Caisse (CSV)",
    "Voir Détails Paiement (Caisse)",

    "Voir les Prêts",
    "Ajouter un Prêt",
    "Enregistrer un Paiement de Prêt",
    "Supprimer un Prêt",
    "Voir le Détail d'un Prêt",

    "Voir Historique Ajouts",
    "Exporter Historique Ajouts (CSV)",
    "Voir Détails Ajout",
    "Voir Historique Références Stock",
    "Exporter Historique Références Stock (CSV)",
    "Voir Détails Référence Stock",
    "Modifier Historique Références Stock",

    "Voir le Coffre",
    "Ajouter une Entrée Coffre",
    "Modifier une Entrée Coffre",
    "Supprimer une Entrée Coffre",
    "Créer une Avance Fournisseur (Coffre)",
    "Paiement Global Fournisseur (Coffre)",

    "Gérer les Utilisateurs",
  ];

  if (role === "admin") return allPermissions;

  if (role === "manager") {
    // Managers: all permissions except Coffre + no cheque transfer to Coffre + no user management
    return allPermissions.filter((p) => {
      if (p === "Gérer les Utilisateurs") return false;
      if (p.includes("Coffre")) return false;
      if (p === "Transférer un Chèque au Coffre") return false;
      return true;
    });
  }

  // role === 'user' (Gestionnaire)
  return [
    "Voir le Tableau de Bord",

    "Voir les Ventes",
    "Créer une Vente",

    "Voir Achats/Transferts",
    "Créer un Achat/Transfert",

    "Voir les Clients",
    "Ajouter un Client",

    "Voir les Fournisseurs",
    "Ajouter un Fournisseur",

    "Voir les Paiements",
    "Ajouter un Paiement",

    "Voir les Chèques",
    "Ajouter un Chèque",
    "Voir l'Inventaire des Chèques",
    "Payer un Fournisseur par Chèque",
    "Payer un Client par Chèque",

    "Voir la Caisse",
    "Voir l'Espace Caisse",
    "Voir les Charges",
  ];
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

async function getCurrentUser(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return null;

    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Return auth user info - don't try to fetch from users table here
    // to avoid circular dependency
    return {
      id: user.id,
      email: user.email,
      role: null,
      store_id: null,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

async function getCurrentUserWithRole(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return null;

    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email, role, store_id")
      .eq("id", user.id)
      .single();

    if (userError || !userData) return null;

    return {
      id: user.id,
      email: user.email,
      role: userData.role,
      store_id: userData.store_id,
    };
  } catch (error) {
    console.error("Error getting current user with role:", error);
    return null;
  }
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

function formatDateFrench(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return d.toLocaleDateString('fr-FR', options);
}

function toNum(v: any): number {
  const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function insertProductAdditionHistoryRow(params: {
  created_at?: string;
  created_by: string | null;
  created_by_email: string | null;
  store_id: string | null;
  product_id: string;
  stock_reference: string | null;
  reference: string | null;
  name: string | null;
  category: string | null;
  supplier_id: string | null;
  lot: string | null;
  purchase_price: number;
  sale_price: number;
  fourchette_min: number | null;
  fourchette_max: number | null;
  caisse: number;
  quantite: number;
  moyenne: number;
  total_value: number;
}) {
  const payload = {
    created_at: params.created_at || new Date().toISOString(),
    created_by: params.created_by,
    created_by_email: params.created_by_email,
    store_id: params.store_id,
    product_id: params.product_id,
    stock_reference: params.stock_reference,
    reference: params.reference,
    name: params.name,
    category: params.category,
    supplier_id: params.supplier_id,
    lot: params.lot,
    purchase_price: params.purchase_price,
    sale_price: params.sale_price,
    fourchette_min: params.fourchette_min,
    fourchette_max: params.fourchette_max,
    caisse: params.caisse,
    quantite: params.quantite,
    moyenne: params.moyenne,
    total_value: params.total_value,
  };

  const { error } = await supabase
    .from('product_additions_history')
    .insert([payload]);

  if (error) throw error;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let path = url.pathname;

  if (path.startsWith("/super-handler")) {
    path = path.replace("/super-handler", "");
  }
  if (path.startsWith("/functions/v1/super-handler")) {
    path = path.replace("/functions/v1/super-handler", "");
  }

  const method = req.method;

  console.log(`${method} ${path}`);

  if (path === "/health" && method === "GET") {
    return jsonResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  // ===== Supplier Payments (Global supplier payment from Coffre) =====
  // POST /payments
  // Required behavior for payment_method=check:
  //  - Create payment row
  //  - Create Coffre movement in expenses (always when coffer_id provided)
  //  - Create check_safe_usages row (this is what drives Disponible/Utilisé in UI)
  //  - If any side-effect fails => rollback payment and fail request
  if (path === "/payments" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);

      const supplierId = body.supplier_id ? String(body.supplier_id).trim() : null;
      const cofferId = body.coffer_id ? String(body.coffer_id).trim() : null;
      const storeIdFromBody = body.store_id ? String(body.store_id).trim() : null;
      const orderId = body.order_id ? String(body.order_id).trim() : null;
      const paymentMethod = String(body.payment_method || '').trim().toLowerCase();
      const referenceNumber = body.reference_number ? String(body.reference_number).trim() : null;

      const amount = typeof body.amount === 'string'
        ? Number(String(body.amount).replace(',', '.'))
        : Number(body.amount);

      if (!supplierId) return jsonResponse({ error: 'supplier_id is required' }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: 'amount must be > 0' }, 400);
      if (!paymentMethod) return jsonResponse({ error: 'payment_method is required' }, 400);

      // Coffre global supplier payment must include coffer_id so we can log movement.
      if (!cofferId) return jsonResponse({ error: 'coffer_id is required' }, 400);

      // Resolve store_id
      let storeId = storeIdFromBody;
      if (!storeId) {
        const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
        storeId = (currentUser?.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId || null;
      }
      if (!storeId) {
        const { data: supplierRow, error: sErr } = await supabase
          .from('suppliers')
          .select('store_id')
          .eq('id', supplierId)
          .maybeSingle();
        if (sErr) throw sErr;
        storeId = supplierRow?.store_id ? String(supplierRow.store_id).trim() : null;
      }
      if (!storeId) return jsonResponse({ error: 'store_id is required (could not be resolved)' }, 400);

      // Create payment
      const { data: insertedPayments, error: payErr } = await supabase
        .from('payments')
        .insert([
          {
            order_id: orderId,
            store_id: storeId,
            supplier_id: supplierId,
            amount,
            payment_method: paymentMethod,
            reference_number: referenceNumber,
            notes: body.notes || null,
            created_by: currentUser?.id || null,
          },
        ])
        .select('*')
        .limit(1);

      if (payErr) throw payErr;
      const payment = insertedPayments?.[0];
      const paymentId = payment?.id ? String(payment.id) : null;
      if (!paymentId) throw new Error('Failed to create payment');

      const rollback = async (err: any) => {
        try {
          await supabase.from('payments').delete().eq('id', paymentId);
        } catch (e) {
          console.error('[payments POST] rollback delete failed:', e);
        }
        throw err;
      };

      // Create Coffre expense movement
      const expenseType = paymentMethod === 'check'
        ? 'coffer_out_check'
        : (paymentMethod === 'bank_transfer' ? 'coffer_out_bank_transfer' : 'coffer_out_cash');

      const expenseNotes = [
        String(body.notes || '').trim() || null,
        `supplier_payment_id=${paymentId}`,
        `supplier_id=${supplierId}`,
      ].filter(Boolean).join(' | ');

      // expenses table differs across deployments (some DBs don't have `description`).
      // Insert with `notes` first, then retry without `notes` if schema cache is stale.
      const isSchemaCacheMissingColumn = (err: any, col: string) => {
        const msg = String(err?.message || '');
        return msg.includes(`Could not find the '${col}' column`) ||
          msg.includes(`Could not find the "${col}" column`) ||
          (msg.toLowerCase().includes('schema cache') && msg.toLowerCase().includes(col.toLowerCase()));
      };

      const expenseRow: any = {
        store_id: storeId,
        coffer_id: cofferId,
        // Coffre supplier payments are OUTFLOWS and must REDUCE coffre totals.
        // Therefore store them as NEGATIVE amounts.
        amount: -Math.abs(amount),
        expense_type: expenseType,
        // Prefer `reason` (exists in older migrations) and keep notes for traceability.
        reason: `Paiement Fournisseur (${paymentMethod})`,
        notes: expenseNotes,
        created_by: currentUser?.id || null,
      };

      const ins1 = await supabase.from('expenses').insert([expenseRow]);
      if (ins1.error) {
        // If notes column is missing in schema cache, retry without notes.
        if (isSchemaCacheMissingColumn(ins1.error, 'notes')) {
          const retryRow: any = { ...expenseRow };
          delete retryRow.notes;
          const ins2 = await supabase.from('expenses').insert([retryRow]);
          if (ins2.error) return await rollback(ins2.error);
        } else {
          return await rollback(ins1.error);
        }
      }

      // If cheque: create check_safe_usages (drives Utilisé)
      if (paymentMethod === 'check') {
        const checkSafeId = body.check_safe_id ? String(body.check_safe_id).trim() : null;
        if (!checkSafeId) return await rollback(new Error('check_safe_id is required when payment_method=check'));

        const { error: usageErr } = await supabase
          .from('check_safe_usages')
          .insert([
            {
              check_safe_id: checkSafeId,
              amount_used: Math.abs(amount),
              usage_type: 'supplier_payment',
              ref_table: 'payments',
              ref_id: paymentId,
              store_id: storeId,
              coffer_id: cofferId,
              created_by: currentUser?.id || null,
            },
          ]);

        if (usageErr) return await rollback(usageErr);

        // Optional best-effort status update; UI uses usages.
        try {
          const { error: stErr } = await supabase
            .from('check_safe')
            .update({ status: 'utilise', updated_at: new Date().toISOString() })
            .eq('id', checkSafeId);
          if (stErr) {
            await supabase
              .from('check_safe')
              .update({ status: 'used', updated_at: new Date().toISOString() })
              .eq('id', checkSafeId);
          }
        } catch (_e) {
          // ignore
        }
      }

      return jsonResponse({ success: true, payment });
    } catch (error: any) {
      console.error('Error creating supplier payment (Coffre):', error);
      return jsonResponse({ error: error.message || String(error) }, 500);
    }
  }

  // ===== Magasin Debts (Admin consolidated + magasin self) =====
  // Accrual rule:
  // - Debt increases at TRANSFER creation time (sales rows with sale_number TRANSFER-*)
  // - Debt decreases only when magasin pays later (store_global_payments)
  //
  // GET /magasin-debts
  // - Admin only: returns debts for ALL magasins
  //
  // GET /magasin-debts/mine
  // - Non-admin: returns debts for the current user's store only
  //
  // ===== Admin Supplier Debts (per-admin totals for Fournisseur Admin module) =====
  // GET /admin-supplier-debts
  // Returns totals grouped by admin_user_id.
  // Source of truth:
  // - total_facture: admin_supplier_invoices.total_amount
  // - total_paye: supplier_admin_global_payments.amount + discounts.discount_amount (remise)
  //   linked to a supplier_admin_global_payments row via discounts.ref_table/ref_id
  if (path === "/admin-supplier-debts" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || "").toLowerCase();
      if (role !== "admin" && role !== "manager" && role !== "magasin_manager") {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      // Store scoping for non-admin:
      // - Prefer DB users.store_id
      // - Fallback to auth user_metadata.store_id (older accounts may not be backfilled)
      // - Allow explicit override via ?store_id=... (still non-admin scoped, not "all")
      const url = new URL(req.url);
      const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
      const effectiveStoreId = requestedStoreId || myStoreId;

      // 1) Invoices: scoped to manager's store when not admin
      let invQuery = supabase
        .from('admin_supplier_invoices')
        .select('id, admin_user_id, store_id, total_amount');

      if (role !== 'admin') {
        if (!effectiveStoreId) return jsonResponse({ debts: [] });
        invQuery = invQuery.eq('store_id', effectiveStoreId);
      }

      const { data: invoices, error: invErr } = await invQuery;
      if (invErr) throw invErr;

      const adminIds = Array.from(
        new Set((invoices || []).map((r: any) => r.admin_user_id).filter(Boolean).map((v: any) => String(v)))
      );

      // 2) Payments: proper table (no notes parsing)
      let paymentsQuery = supabase
        .from('supplier_admin_global_payments')
        .select('id, admin_user_id, paid_by_store_id, amount');

      if (role !== 'admin') {
        if (!effectiveStoreId) return jsonResponse({ debts: [] });
        paymentsQuery = paymentsQuery.eq('paid_by_store_id', effectiveStoreId);
      }

      const { data: payments, error: payErr } = await paymentsQuery;
      if (payErr) throw payErr;

      // 3) Remises: linked via discounts.ref_table/ref_id
      const paymentIds = Array.from(
        new Set((payments || []).map((p: any) => p?.id).filter(Boolean).map((v: any) => String(v)))
      );

      let remises: any[] = [];
      if (paymentIds.length > 0) {
        let remQuery = supabase
          .from('discounts')
          .select('ref_id, discount_amount')
          .eq('ref_table', 'supplier_admin_global_payments')
          .in('ref_id', paymentIds)
          .eq('status', 'active');

        // For non-admin we already restricted paymentsQuery by paid_by_store_id,
        // so remises are implicitly scoped.
        const { data: remRows, error: remErr } = await remQuery;
        if (remErr) throw remErr;
        remises = remRows || [];
      }

      const remiseByPaymentId = new Map<string, number>();
      (remises || []).forEach((r: any) => {
        const rid = r?.ref_id ? String(r.ref_id) : null;
        if (!rid) return;
        const amt = Number(r.discount_amount || 0) || 0;
        remiseByPaymentId.set(rid, (remiseByPaymentId.get(rid) || 0) + amt);
      });

      const paidByAdmin = new Map<string, number>();
      (payments || []).forEach((p: any) => {
        const aid = p?.admin_user_id ? String(p.admin_user_id) : null;
        if (!aid) return;
        const amt = Number(p.amount || 0) || 0;
        const rm = remiseByPaymentId.get(String(p.id)) || 0;
        paidByAdmin.set(aid, (paidByAdmin.get(aid) || 0) + amt + rm);
      });

      // 4) Resolve admin emails
      const emailByAdminId = new Map<string, string>();
      if (adminIds.length > 0) {
        const { data: adminRows, error: adminErr } = await supabase
          .from('users')
          .select('id, email')
          .in('id', adminIds);
        if (adminErr) throw adminErr;
        (adminRows || []).forEach((u: any) => {
          if (u?.id) emailByAdminId.set(String(u.id), u?.email || String(u.id));
        });
      }

      const totalByAdmin = new Map<string, number>();
      (invoices || []).forEach((r: any) => {
        const aid = r?.admin_user_id ? String(r.admin_user_id) : null;
        if (!aid) return;
        const amt = Number(r.total_amount || 0) || 0;
        totalByAdmin.set(aid, (totalByAdmin.get(aid) || 0) + amt);
      });

      const debts = (adminIds as string[]).map((aid: string) => {
        const total_facture = totalByAdmin.get(aid) || 0;
        const total_paye = paidByAdmin.get(aid) || 0;
        const remaining = total_facture - total_paye;
        return {
          admin_user_id: aid,
          admin_email: emailByAdminId.get(aid) || aid,
          total_facture,
          total_paye,
          solde_restant: remaining,
        };
      });

      return jsonResponse({ debts });
    } catch (error: any) {
      console.error('Error fetching admin supplier debts:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // GET /admin-supplier-invoices
  // Lists admin supplier invoices for an admin_user_id.
  if (path === "/admin-supplier-invoices" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'manager' && role !== 'magasin_manager') {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const url = new URL(req.url);
      const adminUserId = String(url.searchParams.get('admin_user_id') || '').trim();
      if (!adminUserId) return jsonResponse({ invoices: [] });

      let q = supabase
        .from('admin_supplier_invoices')
        .select('*')
        .eq('admin_user_id', adminUserId)
        .order('created_at', { ascending: false });

      if (role !== 'admin') {
        // Manager accounts may have missing users.store_id; fallback to auth metadata or explicit ?store_id
        const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
        const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
        const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
        const effectiveStoreId = requestedStoreId || myStoreId;

        if (!effectiveStoreId) return jsonResponse({ invoices: [] });
        q = q.eq('store_id', effectiveStoreId);
      }

      const { data, error } = await q;
      if (error) throw error;

      return jsonResponse({ invoices: data || [] });
    } catch (error: any) {
      console.error('Error fetching admin supplier invoices:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Supplier Admin Global Payments (Paiement Global Fournisseur Admin) =====
  // GET  /supplier-admin-global-payments?admin_user_id=...&paid_by_store_id=...
  // POST /supplier-admin-global-payments
  // This is the schema-backed replacement for parsing store_global_payments.notes.
  if (path === "/supplier-admin-global-payments" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'manager' && role !== 'magasin_manager') {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const url = new URL(req.url);
      const adminUserId = String(url.searchParams.get('admin_user_id') || '').trim() || null;
      const paidByStoreId = String(url.searchParams.get('paid_by_store_id') || '').trim() || null;

      // Non-admin: must be restricted to their store
      const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
      const effectiveStoreId = (role === 'admin') ? (requestedStoreId || null) : (requestedStoreId || myStoreId);

      let q = supabase
        .from('supplier_admin_global_payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (adminUserId) q = q.eq('admin_user_id', adminUserId);
      if (paidByStoreId) q = q.eq('paid_by_store_id', paidByStoreId);

      if (role !== 'admin') {
        if (!effectiveStoreId) return jsonResponse({ payments: [] });
        q = q.eq('paid_by_store_id', effectiveStoreId);
      }

      const { data: rows, error } = await q;
      if (error) throw error;

      // Confirmed status (Supplier Admin Global Payments):
      // Business rule:
      // - check           : confirmed only if ALL linked check_inventory rows have a coffer_id set
      // - cash/bank_transfer: MUST be confirmed by admin ("Paiements Reçus")
      //   We model this by requiring a pending_coffer_transfers row to be CONFIRMED.
      //
      // Linking strategy (best-effort, backward compatible):
      // 1) If payment.store_global_payment_id is present: pending_coffer_transfers.notes contains "store_global_payment_id=<id>"
      // 2) Else: pending_coffer_transfers.notes contains "supplier_admin_global_payment_id=<id>"

      // 1) Cheque confirmation lookup
      const checkIds = Array.from(
        new Set(
          (rows || [])
            .flatMap((r: any) => Array.isArray(r?.check_inventory_ids) ? r.check_inventory_ids : [])
            .filter(Boolean)
            .map((v: any) => String(v))
        )
      );

      const cofferByCheckId = new Map<string, string | null>();
      if (checkIds.length > 0) {
        const { data: checks, error: cErr } = await supabase
          .from('check_inventory')
          .select('id, coffer_id')
          .in('id', checkIds)
          .limit(5000);
        if (cErr) throw cErr;
        (checks || []).forEach((c: any) => {
          cofferByCheckId.set(String(c.id), c?.coffer_id ? String(c.coffer_id) : null);
        });
      }

      // 2) Cash/bank_transfer confirmation lookup via pending_coffer_transfers
      const paymentIds = Array.from(
        new Set((rows || []).map((r: any) => r?.id).filter(Boolean).map((v: any) => String(v)))
      );

      const storeGpIds = Array.from(
        new Set((rows || []).map((r: any) => r?.store_global_payment_id).filter(Boolean).map((v: any) => String(v)))
      );

      // We will fetch recent transfers and try to match by marker in notes.
      // RLS: service-role client in edge function can read all.
      const pendingStatusByPaymentId = new Map<string, 'pending' | 'confirmed' | 'rejected'>();

      if (paymentIds.length > 0 || storeGpIds.length > 0) {
        // Pull a bounded window to avoid huge scans.
        // We match by notes markers; this is best-effort until we add a dedicated FK column.
        const { data: transfers, error: tErr } = await supabase
          .from('pending_coffer_transfers')
          .select('id, status, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(5000);

        if (tErr) throw tErr;

        const transfersRows: any[] = (transfers as any[]) || [];

        // For each Supplier Admin payment, the pending transfer may be linked either by:
        // - supplier_admin_global_payment_id=<id>
        // - OR store_global_payment_id=<store_gp_id> (when created through Clients Magasins flow)
        for (const pId of paymentIds) {
          const paymentRow = (rows || []).find((r: any) => String(r?.id || '') === String(pId));
          const sgpId = paymentRow?.store_global_payment_id ? String(paymentRow.store_global_payment_id) : null;

          const markerA = `supplier_admin_global_payment_id=${pId}`;
          const markerB = sgpId ? `store_global_payment_id=${sgpId}` : null;

          const t: any = transfersRows.find((tr: any) => {
            const notes = String(tr?.notes || '');
            return notes.includes(markerA) || (markerB ? notes.includes(markerB) : false);
          });

          const rawStatus: string | null = (t && (t as any).status !== undefined && (t as any).status !== null)
            ? String((t as any).status)
            : null;

          const st = rawStatus ? rawStatus.toLowerCase() : null;
          if (st === 'confirmed' || st === 'rejected' || st === 'pending') {
            pendingStatusByPaymentId.set(String(pId), st);
          }
        }
      }

      const enriched = (rows || []).map((r: any) => {
        const pm = String(r?.payment_method || '').toLowerCase();

        if (pm === 'check') {
          const ids = Array.isArray(r?.check_inventory_ids) ? r.check_inventory_ids : [];
          if (ids.length === 0) return { ...r, confirmed: false };

          const allConfirmed = ids.every((id: any) => {
            const cid = String(id);
            const cofferId = cofferByCheckId.get(cid);
            return Boolean(cofferId);
          });

          return { ...r, confirmed: allConfirmed };
        }

        // cash / bank_transfer
        const pid = r?.id ? String(r.id) : '';
        const st = pendingStatusByPaymentId.get(pid) || 'pending';
        const confirmed = st === 'confirmed';
        return { ...r, confirmed, pending_status: st };
      });

      return jsonResponse({ payments: enriched });
    } catch (error: any) {
      console.error('Error fetching supplier admin global payments:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/supplier-admin-global-payments" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'manager' && role !== 'magasin_manager') {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const adminUserId = String(body.admin_user_id || '').trim();
      const paidByStoreId = String(body.paid_by_store_id || '').trim();
      const storeGlobalPaymentId = body.store_global_payment_id ? String(body.store_global_payment_id).trim() : null;

      const amount = Number(body.amount);
      const paymentMethod = String(body.payment_method || '').trim();
      const paymentDate = body.payment_date ? String(body.payment_date) : new Date().toISOString();
      const referenceNumber = body.reference_number ? String(body.reference_number).trim() : null;
      const notes = body.notes ? String(body.notes) : null;

      const checkIds = Array.isArray(body.check_inventory_ids)
        ? body.check_inventory_ids.map((x: any) => String(x)).filter(Boolean)
        : [];

      if (!adminUserId) return jsonResponse({ error: 'admin_user_id is required' }, 400);
      if (!paidByStoreId) return jsonResponse({ error: 'paid_by_store_id is required' }, 400);
      if (!paymentMethod) return jsonResponse({ error: 'payment_method is required' }, 400);

      if (paymentMethod !== 'cash' && paymentMethod !== 'check' && paymentMethod !== 'bank_transfer' && paymentMethod !== 'other') {
        return jsonResponse({ error: 'Invalid payment_method' }, 400);
      }

      // For real payments, require amount > 0. For remise-only tracking, allow 0.
      if (!Number.isFinite(amount) || amount < 0) {
        return jsonResponse({ error: 'amount must be >= 0' }, 400);
      }

      // Validate admin user role
      const { data: adminRow, error: adminErr } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', adminUserId)
        .maybeSingle();
      if (adminErr) throw adminErr;
      if (!adminRow) return jsonResponse({ error: 'admin_user_id not found' }, 400);
      if (String(adminRow.role || '').toLowerCase() !== 'admin') {
        return jsonResponse({ error: 'admin_user_id must be a user with role=admin' }, 400);
      }

      // Non-admin: enforce store scope
      if (role !== 'admin') {
        const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
        const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
        if (!myStoreId) return jsonResponse({ error: 'User has no store_id' }, 400);
        if (String(myStoreId) !== String(paidByStoreId)) {
          return jsonResponse({ error: 'Unauthorized' }, 403);
        }
      }

      const { data: inserted, error } = await supabase
        .from('supplier_admin_global_payments')
        .insert([
          {
            admin_user_id: adminUserId,
            paid_by_store_id: paidByStoreId,
            store_global_payment_id: storeGlobalPaymentId,
            amount: Number(amount) || 0,
            payment_method: paymentMethod,
            payment_date: paymentDate,
            reference_number: referenceNumber,
            notes,
            check_inventory_ids: checkIds,
            created_by: currentUser.id,
            created_by_email: currentUser.email,
          },
        ])
        .select('*')
        .maybeSingle();

      if (error) throw error;

      return jsonResponse({ success: true, payment: inserted });
    } catch (error: any) {
      console.error('Error creating supplier admin global payment:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/magasin-debts" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Allow managers to view this consolidated list (they need it for Fournisseur Admin page)
      // NOTE: this endpoint uses service role on the backend; we still gate by user role here.
      const role = String(currentUser.role || "").toLowerCase();
      if (role !== "admin" && role !== "manager" && role !== "magasin_manager") {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      // 1) Load all stores (magasins)
      const { data: stores, error: storesErr } = await supabase
        .from("stores")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (storesErr) throw storesErr;

      const storeList = stores || [];
      const storeIds = storeList.map((s: any) => String(s.id));

      if (storeIds.length === 0) {
        return jsonResponse({ debts: [] });
      }

      // 2) Trading debts: compute magasin balance from TRANSFER/PURCHASE flows.
      // We must include BOTH directions:
      // - Incoming  (destination store_id) => store OWES (debt increases)
      // - Outgoing  (source_store_id)      => store is OWED (debt decreases)
      // Document types:
      // - TRANSFER-*        : inter-store transfer
      // - PURCHASE-*        : inter-store purchase (also affects balance)
      // - TRANSFER-ADMIN-*  : admin supplier invoice (always incoming accrual for the magasin)
      //
      // Backward-compatible UI fields:
      //   total_transfers := total incoming (TRANSFER + PURCHASE + TRANSFER-ADMIN)
      //   total_payments  := total outgoing (TRANSFER + PURCHASE) + store_global_payments (magasin payments)
      //   remaining_balance := incoming - total_payments

      // Incoming (destination store_id)
      const { data: incomingDocs, error: inErr } = await supabase
        .from("sales")
        .select("id, store_id, sale_number, total_amount, created_at, notes")
        .in("store_id", storeIds)
        .or(
          "sale_number.ilike.TRANSFER-%,sale_number.ilike.PURCHASE-%,sale_number.ilike.TRANSFER-ADMIN-%"
        )
        .order("created_at", { ascending: false });
      if (inErr) throw inErr;

      // Outgoing (source_store_id)
      const { data: outgoingDocs, error: outErr } = await supabase
        .from("sales")
        .select("id, source_store_id, sale_number, total_amount, created_at, notes")
        .in("source_store_id", storeIds)
        .or("sale_number.ilike.TRANSFER-%,sale_number.ilike.PURCHASE-%")
        .order("created_at", { ascending: false });
      if (outErr) throw outErr;

      const incomingTotalByStore = new Map<string, number>();
      (incomingDocs || []).forEach((s: any) => {
        const sid = s?.store_id ? String(s.store_id) : null;
        if (!sid) return;
        const amt = Number(s.total_amount || 0) || 0;
        incomingTotalByStore.set(sid, (incomingTotalByStore.get(sid) || 0) + amt);
      });

      const outgoingTotalByStore = new Map<string, number>();
      (outgoingDocs || []).forEach((s: any) => {
        const sid = s?.source_store_id ? String(s.source_store_id) : null;
        if (!sid) return;
        const amt = Number(s.total_amount || 0) || 0;
        outgoingTotalByStore.set(sid, (outgoingTotalByStore.get(sid) || 0) + amt);
      });

      // 3) Payments made by magasins (store_global_payments)
      // IMPORTANT: Split confirmation rules by payment method.
      // - cash / bank_transfer: count immediately (no confirmation)
      // - check: count ONLY after confirmation (cheque entered into inventory/safe)
      // NOTE: payments can be recorded under either:
      // - paid_by_store_id (standard)
      // - acted_as_store_id (admin acting on behalf of a magasin)
      // We include BOTH so totals always update after "Paiement Global Magasin".
      const { data: storePayments, error: spErr } = await supabase
        .from('store_global_payments')
        .select('id, paid_by_store_id, acted_as_store_id, amount, payment_method, check_inventory_id')
        .or(`paid_by_store_id.in.(${storeIds.join(',')}),acted_as_store_id.in.(${storeIds.join(',')})`);
      if (spErr) throw spErr;

      // 4) Remises linked to store_global_payments (discounts.ref_table/ref_id)
      // We keep it additive (do not remove any other logic). This only affects total_payments meaning.
      const storeGpIds = Array.from(
        new Set((storePayments || []).map((p: any) => p?.id).filter(Boolean).map((v: any) => String(v)))
      );

      let storeRemises: any[] = [];
      if (storeGpIds.length > 0) {
        const { data: remRows, error: remErr } = await supabase
          .from('discounts')
          .select('ref_id, discount_amount')
          .eq('ref_table', 'store_global_payments')
          .in('ref_id', storeGpIds)
          .eq('status', 'active');
        if (remErr) throw remErr;
        storeRemises = remRows || [];
      }

      // Confirmation rule (SPLIT) + payment_method fallback:
      // - cash/bank_transfer: confirmed ONLY after an admin confirms the pending_coffer_transfers row
      // - check: confirmed only when linked to check_inventory (preferred) or marker fallback
      // Some legacy rows may have missing payment_method due to backend/cache fallback issues.
      // Treat missing/empty as "cash" so totals don't drop to 0.
      const confirmedPaymentIds = new Set<string>();

      // 1) cash/bank_transfer: confirm ONLY via pending_coffer_transfers marker
      //    Marker: store_global_payment_id=<payment_id>
      const pendingConfirmedCashTransferIds = new Set<string>();
      try {
        const { data: transfersRows, error: tErr } = await supabase
          .from('pending_coffer_transfers')
          .select('status, notes')
          .order('created_at', { ascending: false })
          .limit(5000);

        if (tErr) {
          console.error('[magasin-debts] pending_coffer_transfers lookup failed:', tErr);
        } else {
          (transfersRows || []).forEach((tr: any) => {
            const st = String(tr?.status || '').toLowerCase();
            if (st !== 'confirmed') return;
            const notes = String(tr?.notes || '');
            const m = notes.match(/store_global_payment_id=([a-f0-9\-]+)/i);
            if (m && m[1]) pendingConfirmedCashTransferIds.add(String(m[1]));
          });
        }
      } catch (e) {
        console.error('[magasin-debts] pending_coffer_transfers scan failed:', e);
      }

      (storePayments || []).forEach((p: any) => {
        const pid = p?.id ? String(p.id) : null;
        if (!pid) return;

        const pm = String(p?.payment_method || '').trim().toLowerCase();
        const resolvedPm = pm || 'cash';

        if (resolvedPm === 'check') return;

        // cash/bank_transfer (and other non-check methods): require admin confirmation
        if (pendingConfirmedCashTransferIds.has(pid)) confirmedPaymentIds.add(pid);
      });

      // 2) Confirm cheques via deterministic link: store_global_payments.check_inventory_id
      const chequeInventoryIds = Array.from(
        new Set(
          (storePayments || [])
            .filter((p: any) => String(p?.payment_method || '').toLowerCase() === 'check')
            .map((p: any) => p?.check_inventory_id)
            .filter(Boolean)
            .map((v: any) => String(v))
        )
      );

      if (chequeInventoryIds.length > 0) {
        const { data: invRows, error: invErr } = await supabase
          .from('check_inventory')
          .select('id')
          .in('id', chequeInventoryIds)
          .limit(5000);

        if (invErr) {
          console.error('[magasin-debts] Failed to load cheque confirmations by check_inventory_id:', invErr);
        } else {
          const invIdSet = new Set((invRows || []).map((r: any) => String(r.id)));
          (storePayments || []).forEach((p: any) => {
            const pid = p?.id ? String(p.id) : null;
            if (!pid) return;
            if (String(p?.payment_method || '').toLowerCase() !== 'check') return;
            const invId = p?.check_inventory_id ? String(p.check_inventory_id) : null;
            if (invId && invIdSet.has(invId)) confirmedPaymentIds.add(pid);
          });
        }
      }

      // 3) Fallback for legacy rows: parse notes marker store_global_payment_id=<payment_id>
      try {
        const legacyPaymentIds = Array.from(
          new Set(
            (storePayments || [])
              .filter((p: any) => String(p?.payment_method || '').toLowerCase() === 'check')
              .map((p: any) => p?.id)
              .filter(Boolean)
              .map((v: any) => String(v))
          )
        );

        if (legacyPaymentIds.length > 0) {
          const { data: invRows2, error: invErr2 } = await supabase
            .from('check_inventory')
            .select('notes')
            .ilike('notes', '%store_global_payment_id=%')
            .order('created_at', { ascending: false })
            .limit(2000);

          if (invErr2) {
            console.error('[magasin-debts] Failed to load legacy cheque confirmations by notes marker:', invErr2);
          } else {
            (invRows2 || []).forEach((r: any) => {
              const notes = String(r?.notes || '');
              const m = notes.match(/store_global_payment_id=([a-f0-9\-]+)/i);
              if (m && m[1]) confirmedPaymentIds.add(String(m[1]));
            });
          }
        }
      } catch (e) {
        console.error('[magasin-debts] Legacy marker parse failed:', e);
      }

      const storePaymentsByStore = new Map<string, number>();
      (storePayments || []).forEach((p: any) => {
        const pid = p?.id ? String(p.id) : null;
        if (!pid) return;
        if (!confirmedPaymentIds.has(pid)) return; // count only confirmed per rules above

        // Store resolution priority:
        // 1) acted_as_store_id (admin acting on behalf of a magasin)
        // 2) paid_by_store_id
        // 3) fallback: parse store_id=<uuid> from notes (legacy)
        let sid = p?.acted_as_store_id
          ? String(p.acted_as_store_id)
          : (p?.paid_by_store_id ? String(p.paid_by_store_id) : null);

        if (!sid) {
          const notes = String(p?.notes || '');
          const m = notes.match(/\bstore_id=([a-f0-9\-]+)\b/i);
          if (m && m[1]) sid = String(m[1]);
        }

        if (!sid) return;
        const amt = Number(p.amount || 0) || 0;
        storePaymentsByStore.set(sid, (storePaymentsByStore.get(sid) || 0) + amt);
      });

      const remiseByStoreGpId = new Map<string, number>();
      (storeRemises || []).forEach((r: any) => {
        const rid = r?.ref_id ? String(r.ref_id) : null;
        if (!rid) return;
        const amt = Number(r.discount_amount || 0) || 0;
        remiseByStoreGpId.set(rid, (remiseByStoreGpId.get(rid) || 0) + amt);
      });

      const storeRemiseByStore = new Map<string, number>();
      (storePayments || []).forEach((p: any) => {
        const gpId = p?.id ? String(p.id) : null;

        let sid = p?.acted_as_store_id
          ? String(p.acted_as_store_id)
          : (p?.paid_by_store_id ? String(p.paid_by_store_id) : null);

        if (!sid) {
          const notes = String(p?.notes || '');
          const m = notes.match(/\bstore_id=([a-f0-9\-]+)\b/i);
          if (m && m[1]) sid = String(m[1]);
        }

        if (!gpId || !sid) return;
        const rm = remiseByStoreGpId.get(gpId) || 0;
        if (rm <= 0) return;
        storeRemiseByStore.set(sid, (storeRemiseByStore.get(sid) || 0) + rm);
      });

      const debts = storeList.map((st: any) => {
        const sid = String(st.id);
        const totalIn = incomingTotalByStore.get(sid) || 0;
        const paid = storePaymentsByStore.get(sid) || 0;
        const remise = storeRemiseByStore.get(sid) || 0;

        // total_payments in UI = money that reduces the debt (cash/check/transfer + remise)
        // IMPORTANT: magasin payments reduce the debt ONLY after admin confirms them.
        // We represent confirmation by inserting into check_inventory with notes marker:
        //   store_global_payment_id=<id>
        // This endpoint counts ONLY confirmed store_global_payments.
        const totalPayments = paid + remise;
        const remaining = totalIn - totalPayments;

        return {
          store_id: sid,
          store_name: st.name || sid,
          // Keep field names for existing UI (Clients Magasins):
          total_transfers: totalIn,
          total_payments: totalPayments,
          remaining_balance: remaining,
        };
      });

      return jsonResponse({ debts });
    } catch (error: any) {
      console.error("Error fetching magasin debts (admin):", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/magasin-debts/mine" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Admin: full access.
      // For convenience, allow admin to use this endpoint as an "all magasins" view.
      // This keeps the frontend page working even when opened by admin.
      if (currentUser.role === "admin") {
        // 1) Load all stores (magasins)
        const { data: stores, error: storesErr } = await supabase
          .from("stores")
          .select("id, name")
          .order("created_at", { ascending: false });
        if (storesErr) throw storesErr;

        const storeList = stores || [];
        const storeIds = storeList.map((s: any) => String(s.id));

        if (storeIds.length === 0) {
          return jsonResponse({ debt: null });
        }

        // 2) Transfers (sales with sale_number TRANSFER- where destination store_id is the magasin)
        const { data: transferSales, error: salesErr } = await supabase
          .from("sales")
          .select("id, store_id, sale_number, total_amount, created_at, notes")
          .in("store_id", storeIds)
          .ilike("sale_number", "TRANSFER-%")
          .order("created_at", { ascending: false });
        if (salesErr) throw salesErr;

        // 3) Payments (store_global_payments paid by magasin)
        const { data: payments, error: payErr } = await supabase
          .from("store_global_payments")
          .select("id, paid_by_store_id, amount, payment_method, payment_date, created_at, reference_number, notes")
          .in("paid_by_store_id", storeIds)
          .order("payment_date", { ascending: false });
        if (payErr) throw payErr;

        const totalTransfers = (transferSales || []).reduce((sum: number, s: any) => sum + (Number(s.total_amount || 0) || 0), 0);
        const totalPayments = (payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount || 0) || 0), 0);
        // IMPORTANT: allow negative balance (credit) when payments > transfers
        const remaining = totalTransfers - totalPayments;

        const debt = {
          store_id: 'ALL',
          store_name: 'Tous les magasins',
          total_transfers: totalTransfers,
          total_payments: totalPayments,
          remaining_balance: remaining,
          // Provide recent history (for UI tables)
          recent_transfers: (transferSales || []).slice(0, 50),
          recent_payments: (payments || []).slice(0, 50),
        };

        return jsonResponse({ debt });
      }

      // Store resolution (fix wrong store_id due to missing backfill/cache):
      // - Prefer users.store_id
      // - Fallback to auth user_metadata.store_id (older accounts)
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
      if (!myStoreId) {
        return jsonResponse({ debt: null });
      }

      // Load store name
      const { data: storeRow, error: storeErr } = await supabase
        .from("stores")
        .select("id, name")
        .eq("id", myStoreId)
        .maybeSingle();
      if (storeErr) throw storeErr;

      // Incoming docs to me (TRANSFER/PURCHASE increase what I owe)
      const { data: incomingDocs, error: inErr } = await supabase
        .from("sales")
        .select("id, store_id, sale_number, total_amount, created_at, notes")
        .eq("store_id", myStoreId)
        .or("sale_number.ilike.TRANSFER-%,sale_number.ilike.PURCHASE-%,sale_number.ilike.TRANSFER-ADMIN-%")
        .order("created_at", { ascending: false });
      if (inErr) throw inErr;

      // Outgoing docs from me (TRANSFER/PURCHASE decrease what I owe)
      const { data: outgoingDocs, error: outErr } = await supabase
        .from("sales")
        .select("id, source_store_id, sale_number, total_amount, created_at, notes")
        .eq("source_store_id", myStoreId)
        .or("sale_number.ilike.TRANSFER-%,sale_number.ilike.PURCHASE-%")
        .order("created_at", { ascending: false });
      if (outErr) throw outErr;

      const totalTransfers = (incomingDocs || []).reduce((sum: number, s: any) => sum + (Number(s.total_amount || 0) || 0), 0);
      const totalPayments = (outgoingDocs || []).reduce((sum: number, s: any) => sum + (Number(s.total_amount || 0) || 0), 0);
      const remaining = totalTransfers - totalPayments;

      const debt = {
      store_id: myStoreId,
      store_name: storeRow?.name || myStoreId,
      total_transfers: totalTransfers,
      total_payments: totalPayments,
      remaining_balance: remaining,
      // Provide recent history (for UI tables)
      recent_transfers: (incomingDocs || []).slice(0, 50),
      recent_payments: (outgoingDocs || []).slice(0, 50),
      };

      return jsonResponse({ debt });
    } catch (error: any) {
      console.error("Error fetching magasin debts (mine):", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/" && method === "GET") {
    return jsonResponse({
      message: "super-handler is running",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  if (path === "/product-additions-history" && method === "GET") {
    try {
      const url = new URL(req.url);
      const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
      const requestedStockReference = String(url.searchParams.get('stock_reference') || '').trim() || null;

      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;

      const effectiveStoreId = role === 'admin'
        ? (requestedStoreId || null)
        : myStoreId;

      let q = supabase
        .from('product_additions_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (effectiveStoreId) q = q.eq('store_id', effectiveStoreId);
      if (requestedStockReference) q = q.eq('stock_reference', requestedStockReference);

      const { data: rows, error } = await q;
      if (error) throw error;

      const userIds = Array.from(
        new Set((rows || []).map((r: any) => r?.created_by).filter(Boolean).map((v: any) => String(v)))
      );
      const storeIds = Array.from(
        new Set((rows || []).map((r: any) => r?.store_id).filter(Boolean).map((v: any) => String(v)))
      );
      const supplierIds = Array.from(
        new Set((rows || []).map((r: any) => r?.supplier_id).filter(Boolean).map((v: any) => String(v)))
      );

      const emailByUserId = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users, error: uErr } = await supabase
          .from('users')
          .select('id, email')
          .in('id', userIds);
        if (uErr) throw uErr;
        (users || []).forEach((u: any) => {
          if (u?.id) emailByUserId.set(String(u.id), String(u.email || ''));
        });
      }

      const nameByStoreId = new Map<string, string>();
      if (storeIds.length > 0) {
        const { data: stores, error: sErr } = await supabase
          .from('stores')
          .select('id, name')
          .in('id', storeIds);
        if (sErr) throw sErr;
        (stores || []).forEach((s: any) => {
          if (s?.id) nameByStoreId.set(String(s.id), String(s.name || ''));
        });
      }

      const nameBySupplierId = new Map<string, string>();
      if (supplierIds.length > 0) {
        const { data: sups, error: supErr } = await supabase
          .from('suppliers')
          .select('id, name')
          .in('id', supplierIds);
        if (supErr) throw supErr;
        (sups || []).forEach((s: any) => {
          if (s?.id) nameBySupplierId.set(String(s.id), String(s.name || ''));
        });
      }

      const history = (rows || []).map((r: any) => {
        const createdById = r?.created_by ? String(r.created_by) : '';
        const storeId = r?.store_id ? String(r.store_id) : '';
        const supplierId = r?.supplier_id ? String(r.supplier_id) : '';

        return {
          ...r,
          created_by_email: r?.created_by_email || (createdById ? (emailByUserId.get(createdById) || null) : null),
          store_name: storeId ? (nameByStoreId.get(storeId) || null) : null,
          supplier_name: supplierId ? (nameBySupplierId.get(supplierId) || null) : null,
        };
      });

      return jsonResponse({ history });
    } catch (error: any) {
      console.error('Error fetching product additions history:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/products" && method === "GET") {
    try {
      const url = new URL(req.url);
      const requestedStoreId = url.searchParams.get("store_id");
      const requestedStockReference = url.searchParams.get("stock_reference");

      const currentUser = await getCurrentUserWithRole(req);

      console.log("[/products GET] currentUser:", currentUser);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Store resolution (fix wrong store_id due to missing backfill/cache):
      // - Admin can act as a specific store via ?store_id=
      // - Non-admin: prefer users.store_id, fallback to auth user_metadata.store_id
      const role = String((currentUser as any)?.role || '').toLowerCase();
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;

      const effectiveStoreId = role === "admin"
        ? (requestedStoreId || null)
        : myStoreId;

      // Security: non-admin users must only see their magasin stock.
      // We filter the base products list by store_stocks.
      // Admin:
      //  - if effectiveStoreId is set => return only products that exist in that store
      //  - else => return all products
      let products: any[] = [];

      if (currentUser.role === "admin" && !effectiveStoreId) {
        const { data, error: productsError } = await supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false });

        if (productsError) throw productsError;
        products = data || [];
      } else {
        if (!effectiveStoreId) {
          // No magasin => no stock visibility
          return jsonResponse({ products: [], stores: [] });
        }

        // Get product_ids that exist in this store
        const { data: stockRows, error: stockErr } = await supabase
          .from("store_stocks")
          .select("product_id")
          .eq("store_id", effectiveStoreId);

        if (stockErr) throw stockErr;

        const productIds = Array.from(
          new Set((stockRows || []).map((r: any) => r.product_id).filter(Boolean))
        );

        if (productIds.length === 0) {
          return jsonResponse({ products: [], stores: [] });
        }

        const { data, error: productsError } = await supabase
          .from("products")
          .select("*")
          .in("id", productIds)
          .order("created_at", { ascending: false });

        if (productsError) throw productsError;
        products = data || [];
      }

      console.log(`[/products GET] Fetched ${products?.length || 0} products`);
      console.log("[/products GET] Returning products ids (first 20):", (products || []).slice(0, 20).map((p: any) => p.id));

      // Fetch stores for UI.
      // Admin can see all stores.
      // Non-admin should only receive their own store to avoid leaking magasin names.
      let stores: any[] = [];

      if (currentUser.role === "admin") {
        const { data, error: storesError } = await supabase
          .from("stores")
          .select("id, name, user_id");

        if (storesError) throw storesError;
        stores = data || [];
      } else {
        if (!currentUser.store_id) {
          // No assigned store
          return jsonResponse({ products: [], stores: [] });
        }

        const { data, error: storesError } = await supabase
          .from("stores")
          .select("id, name, user_id")
          .eq("id", currentUser.store_id);

        if (storesError) throw storesError;
        stores = data || [];
      }

      console.log(`[/products GET] Fetched ${stores?.length || 0} stores`);
      console.log("[/products GET] Returning store ids:", (stores || []).map((s: any) => s.id));
      console.log("[/products GET] Returning store names:", (stores || []).map((s: any) => s.name));

      // Fetch users mapping (id -> store_id) so every product can have a reliable store_id.
      // This is critical for strict magasin filtering in the UI.
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, store_id");

      if (usersError) {
        console.warn("Could not fetch users for product->store mapping:", usersError.message);
      }

      const userToStoreId = new Map<string, string>();
      (users || []).forEach((u: any) => {
        if (u?.id && u?.store_id) userToStoreId.set(String(u.id), String(u.store_id));
      });

      // Fetch store stocks for each product (if table exists)
      let storeStocks: any[] = [];
      const { data: stocks, error: stocksError } = await supabase
        .from("store_stocks")
        .select("product_id, store_id, quantity");

      if (stocksError) {
        console.warn("store_stocks table not found or error:", stocksError.message);
        // Continue without store_stocks - it's optional
      } else {
        storeStocks = stocks || [];
        console.log(`Fetched ${storeStocks.length} store stock records`);
      }

      // Build store_stocks object for each product + add computed store_id
      let filteredProducts = products || [];

      // Optional filter by stock_reference (used by Fournisseur Admin operation details)
      if (requestedStockReference) {
        const sr = String(requestedStockReference).trim();
        filteredProducts = filteredProducts.filter((p: any) => String(p?.stock_reference || '').trim() === sr);
      }

      const productsWithStoreStocks = (filteredProducts || []).map((product: any) => {
        const store_stocks: any = {};
        let totalStoreStock = 0;

        // Get stocks for this product from store_stocks table
        const productStocks = (storeStocks || []).filter(
          (stock: any) => stock.product_id === product.id
        );

        // Build store_stocks object from store_stocks table
        productStocks.forEach((stock: any) => {
          store_stocks[stock.store_id] = stock.quantity;
          totalStoreStock += stock.quantity;
        });

        // Compute a reliable store_id for the product.
        // Priority:
        //  1) existing product.store_id
        //  2) map product.created_by -> users.store_id
        const computedStoreId =
          (product as any).store_id ||
          (product?.created_by ? userToStoreId.get(String(product.created_by)) : null) ||
          null;

        const rawSalePrice = (product as any).sale_price;
        const normalizedSalePrice =
          typeof rawSalePrice === "string"
            ? (parseFloat(rawSalePrice.replace(",", ".")) || 0)
            : (Number(rawSalePrice) || 0);

        // Frontend expects a per-unit price for display (“Prix unitaire / Prix de vente���).
        // Historically, this project sometimes misused `sale_price` for fees.
        // To make the intent explicit and keep backward compatibility, expose `unit_price`.
        const unit_price = normalizedSalePrice;

        return {
          ...product,
          // ensure sale_price is always returned as a number for the frontend
          sale_price: normalizedSalePrice,
          unit_price,
          store_id: computedStoreId,
          store_stocks,
          global_stock: totalStoreStock,
          total_store_stock: totalStoreStock,
        };
      });

      return jsonResponse({ products: productsWithStoreStocks, stores });
    } catch (error: any) {
      console.error("Error fetching products:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Admin Supplier Invoice (Fournisseur Admin) =====
  // POST /admin-supplier-invoices
  // Creates a TRANSFER-like sales row (accrual) + a metadata row to link it to an admin user
  // and optionally a stock_reference (so supplier details can display product groups).
  if (path === "/admin-supplier-invoices" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      const isAdmin = role === 'admin';
      const isManager = role === 'manager' || role === 'magasin_manager';

      // Admin and managers can create these invoices.
      // Managers are restricted to their own store_id (forced).
      if (!isAdmin && !isManager) {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const adminUserId = String(body.admin_user_id || '').trim();

      // Determine effective store_id:
      // - admin can choose
      // - manager is forced to their own store
      const storeId = isAdmin
        ? String(body.store_id || '').trim()
        : (currentUser.store_id ? String(currentUser.store_id) : '');

      const stockReference = body.stock_reference ? String(body.stock_reference).trim() : null;
      const totalAmount = Number(body.total_amount);

      if (!adminUserId) return jsonResponse({ error: "admin_user_id is required" }, 400);
      if (!storeId) return jsonResponse({ error: "store_id is required" }, 400);
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        return jsonResponse({ error: "total_amount must be > 0" }, 400);
      }

      // Validate admin user exists and has role=admin
      const { data: adminRow, error: adminErr } = await supabase
        .from('users')
        .select('id, role, email')
        .eq('id', adminUserId)
        .maybeSingle();
      if (adminErr) throw adminErr;
      if (!adminRow) return jsonResponse({ error: "admin_user_id not found" }, 400);
      if (String(adminRow.role || '').toLowerCase() !== 'admin') {
        return jsonResponse({ error: "admin_user_id must be a user with role=admin" }, 400);
      }

      // Validate store exists
      const { data: storeRow, error: storeErr } = await supabase
        .from('stores')
        .select('id, name')
        .eq('id', storeId)
        .maybeSingle();
      if (storeErr) throw storeErr;
      if (!storeRow) return jsonResponse({ error: "store_id not found" }, 400);

      const notes = String(body.notes || '').trim() || null;

      // Create a sales row that will be counted by /magasin-debts as a TRANSFER accrual.
      const saleNumber = `TRANSFER-ADMIN-${Date.now()}`;

      const { data: saleInserted, error: saleErr } = await supabase
        .from('sales')
        .insert([
          {
            store_id: storeId,
            sale_number: saleNumber,
            total_amount: totalAmount,
            notes: notes || `Fournisseur Admin invoice (${adminRow.email || adminUserId})`,
            created_by: currentUser.id,
          }
        ])
        .select('id')
        .maybeSingle();

      if (saleErr) throw saleErr;
      const saleId = saleInserted?.id ? String(saleInserted.id) : null;

      // Create metadata row
      const { data: inv, error: invErr } = await supabase
        .from('admin_supplier_invoices')
        .insert([
          {
            admin_user_id: adminUserId,
            store_id: storeId,
            stock_reference: stockReference,
            sale_id: saleId,
            total_amount: totalAmount,
            notes,
          }
        ])
        .select('*')
        .maybeSingle();

      if (invErr) throw invErr;

      return jsonResponse({ success: true, invoice: inv, sale_id: saleId });
    } catch (error: any) {
      console.error('Error creating admin supplier invoice:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Store Trading (Purchase/Transfer) =====
  // GET /store-trading?store_id=...
  // Returns only PURCHASE/TRANSFER sales rows where:
  // - store_id == store_id (destination)
  // - OR source_store_id == store_id (source)
  //
  // This endpoint is meant to power the "client-like" magasin page without downloading all sales.
  if (path === "/store-trading" && method === "GET") {
    try {
      const url = new URL(req.url);
      const requestedStoreId = url.searchParams.get("store_id");

      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      if (!requestedStoreId) {
        return jsonResponse({ sales: [] });
      }

      // Admin: can request any store.
      // Non-admin: only allowed to request their own store.
      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ sales: [] });
        if (String(currentUser.store_id) !== String(requestedStoreId)) {
          return jsonResponse({ error: "Unauthorized" }, 403);
        }
      }

      const storeId = String(requestedStoreId);

      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .or(`store_id.eq.${storeId},source_store_id.eq.${storeId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const filtered = (data || []).filter((s: any) => {
        const sn = String(s?.sale_number || "");
        return sn.includes("PURCHASE-") || sn.includes("TRANSFER-");
      });

      return jsonResponse({ sales: filtered });
    } catch (error: any) {
      console.error("Error fetching store trading:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/products" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUser(req);
      
      // Admin can create stock for a specific magasin by passing store_id.
      // Non-admin users are restricted to their own store_id.
      const currentUserWithRole = await getCurrentUserWithRole(req);
      const requestedStoreId = body.store_id ? String(body.store_id) : null;
      const resolvedStoreId = (currentUserWithRole?.role === "admin")
        ? requestedStoreId
        : (currentUserWithRole?.store_id ? String(currentUserWithRole.store_id) : null);

      // ALWAYS create a new product record for this store
      // Don't reuse existing products - each store gets their own record
      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert([
          {
            name: body.name,
            reference: body.reference,
            stock_reference: body.stock_reference || null,
            category: body.category,
            quantity_available: body.quantity_available || 0, // Use Caisse (quantity_available) as stock
            purchase_price: body.purchase_price || 0,
            sale_price: body.sale_price || 0,
            supplier_id: body.supplier_id || null,
            number_of_boxes: body.number_of_boxes || 0,
            total_net_weight: body.total_net_weight || 0,
            avg_net_weight_per_box: body.avg_net_weight_per_box || 0, // Store as DECIMAL (16.50)
            max_purchase_limit: body.max_purchase_limit || null,
            fourchette_min: body.fourchette_min || null,
            fourchette_max: body.fourchette_max || null,
            van_delivery_attachment_url: body.van_delivery_attachment_url || null,
            van_delivery_attachment_type: body.van_delivery_attachment_type || null,
            van_delivery_notes: body.van_delivery_notes || null,
            created_by: currentUser?.id || null,
            // Ensure product is associated with the magasin for correct stock grouping/filtering
            store_id: resolvedStoreId,
          },
        ])
        .select();

      if (createError) throw createError;
      const productId = newProduct?.[0]?.id;
      console.log(`Created new product with ID: ${productId}`);

      // Determine target store for store_stocks row.
      // - Admin can specify store_id
      // - Non-admin is forced to their own store
      const storeId = resolvedStoreId;

      if (storeId) {
        // Ensure store stock row exists for this store.
        // Use UPSERT so creating the same product twice for same store doesn't break.
        const qty = body.quantity_available || 0;
        const { error: upsertErr } = await supabase
          .from("store_stocks")
          .upsert(
            [{ product_id: productId, store_id: storeId, quantity: qty }],
            { onConflict: "product_id,store_id" }
          );

        if (upsertErr) throw upsertErr;
        console.log(`Upserted store stock for product ${productId} in store ${storeId} with quantity ${qty}`);
      } else {
        console.warn("No store_id resolved; store_stocks entry not created");
      }

      // Fetch the complete product with store stocks
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (fetchError) throw fetchError;

      // Write immutable history snapshot (Ajout Stock)
      // Mapping must match current UI:
      //  - Caisse   = quantity_available
      //  - Quantité = number_of_boxes
      //  - Moyenne  = avg_net_weight_per_box else Quantité/Caisse
      //  - Valeur Totale = Caisse * Prix d'Achat
      try {
        const caisse = toNum(body.quantity_available ?? product.quantity_available ?? 0);
        const quantite = toNum(body.number_of_boxes ?? product.number_of_boxes ?? 0);
        const purchase = toNum(body.purchase_price ?? product.purchase_price ?? 0);
        const moyenneDb = toNum(body.avg_net_weight_per_box ?? product.avg_net_weight_per_box ?? 0);
        const moyenne = moyenneDb > 0 ? moyenneDb : (caisse > 0 && quantite > 0 ? round2(quantite / caisse) : 0);
        const totalValue = caisse * purchase;

        await insertProductAdditionHistoryRow({
          created_at: product.created_at || new Date().toISOString(),
          created_by: currentUser?.id || null,
          created_by_email: currentUser?.email || null,
          store_id: storeId || null,
          product_id: String(productId),
          stock_reference: product.stock_reference || body.stock_reference || null,
          reference: product.reference || body.reference || null,
          name: product.name || body.name || null,
          category: product.category || body.category || null,
          supplier_id: product.supplier_id || body.supplier_id || null,
          lot: product.lot || body.lot || null,
          purchase_price: purchase,
          sale_price: toNum(body.sale_price ?? product.sale_price ?? 0),
          fourchette_min: body.fourchette_min ?? product.fourchette_min ?? null,
          fourchette_max: body.fourchette_max ?? product.fourchette_max ?? null,
          caisse,
          quantite,
          moyenne,
          total_value: totalValue,
        });
      } catch (e) {
        console.error('[products POST] Failed to insert product_additions_history row:', e);
        // Do not fail the main flow; stock add must continue to work.
      }

      return jsonResponse({ success: true, product });
    } catch (error: any) {
      console.error("Error creating product:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // PATCH /products/:id
  // Dedicated "edit product" endpoint.
  // Rationale: the PUT /products/:id handler below has special semantics for restocking
  // (delta updates + possible new product row when stock_reference changes).
  // Editing a product from the admin UI must be a deterministic SET of fields.
  if (path.startsWith("/products/") && method === "PATCH") {
    try {
      const productId = path.split("/")[2];
      const body = await req.json().catch(() => ({}));

      const currentUserWithRole = await getCurrentUserWithRole(req);
      if (!currentUserWithRole) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUserWithRole.role || '').toLowerCase();
      if (role !== 'admin') return jsonResponse({ error: "Unauthorized" }, 403);

      // Load current product
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!currentProduct) return jsonResponse({ error: 'Product not found' }, 404);

      // Determine store_id for stock update
      // - If body.store_id is provided use it
      // - else fallback to product.store_id
      const storeId = body.store_id
        ? String(body.store_id)
        : (currentProduct.store_id ? String(currentProduct.store_id) : null);

      // Build update patch (SET semantics)
      // Keep it explicit to avoid accidental column writes.
      const patch: any = {};

      if (body.name !== undefined) patch.name = body.name;
      if (body.reference !== undefined) patch.reference = body.reference;
      if (body.stock_reference !== undefined) patch.stock_reference = body.stock_reference || null;
      if (body.category !== undefined) patch.category = body.category;

      if (body.purchase_price !== undefined) {
        const v = body.purchase_price;
        patch.purchase_price = (v === '' || v === null) ? 0 : v;
      }
      if (body.sale_price !== undefined) {
        const v = body.sale_price;
        patch.sale_price = (v === '' || v === null) ? 0 : v;
      }
      if (body.supplier_id !== undefined) patch.supplier_id = body.supplier_id || null;

      if (body.number_of_boxes !== undefined) {
        const v = body.number_of_boxes;
        patch.number_of_boxes = (v === '' || v === null) ? 0 : v;
      }
      if (body.quantity_available !== undefined) {
        const v = body.quantity_available;
        patch.quantity_available = (v === '' || v === null) ? 0 : v;
      }

      if (body.total_net_weight !== undefined) {
        const v = body.total_net_weight;
        patch.total_net_weight = (v === '' || v === null) ? 0 : v;
      }
      if (body.avg_net_weight_per_box !== undefined) {
        const v = body.avg_net_weight_per_box;
        patch.avg_net_weight_per_box = (v === '' || v === null) ? 0 : v;
      }
      if (body.max_purchase_limit !== undefined) {
        const v = body.max_purchase_limit;
        patch.max_purchase_limit = (v === '' || v === null) ? null : v;
      }
      if (body.fourchette_min !== undefined) {
        const v = body.fourchette_min;
        patch.fourchette_min = (v === '' || v === null) ? null : v;
      }
      if (body.fourchette_max !== undefined) {
        const v = body.fourchette_max;
        patch.fourchette_max = (v === '' || v === null) ? null : v;
      }

      if (body.van_delivery_attachment_url !== undefined) patch.van_delivery_attachment_url = body.van_delivery_attachment_url || null;
      if (body.van_delivery_attachment_type !== undefined) patch.van_delivery_attachment_type = body.van_delivery_attachment_type || null;
      if (body.van_delivery_notes !== undefined) patch.van_delivery_notes = body.van_delivery_notes || null;

      // Some deployments do not have the `entrepot` column on products.
      // Avoid failing the whole edit when schema cache is missing this column.
      if (body.entrepot !== undefined) {
        patch.entrepot = body.entrepot || null;
      }

      if (body.store_id !== undefined) patch.store_id = body.store_id || null;

      patch.updated_at = new Date().toISOString();

      const isMissingColumn = (err: any, col: string) => {
        const msg = String(err?.message || '');
        return msg.includes(`Could not find the '${col}' column`) ||
          msg.includes(`Could not find the "${col}" column`) ||
          (msg.toLowerCase().includes('schema cache') && msg.toLowerCase().includes(col.toLowerCase()));
      };

      let updatedProduct: any = null;
      const first = await supabase
        .from('products')
        .update(patch)
        .eq('id', productId)
        .select('*')
        .maybeSingle();

      if (first.error) {
        // Retry without optional columns that may not exist in some DBs.
        if (isMissingColumn(first.error, 'entrepot')) {
          const retryPatch: any = { ...patch };
          delete retryPatch.entrepot;

          const second = await supabase
            .from('products')
            .update(retryPatch)
            .eq('id', productId)
            .select('*')
            .maybeSingle();

          if (second.error) throw second.error;
          updatedProduct = second.data;
        } else {
          throw first.error;
        }
      } else {
        updatedProduct = first.data;
      }

      // Keep store_stocks in sync if we have a storeId and quantity_available is provided.
      if (storeId && body.quantity_available !== undefined) {
        const q = toNum(body.quantity_available);
        const { error: ssErr } = await supabase
          .from('store_stocks')
          .upsert(
            [{ product_id: productId, store_id: storeId, quantity: q }],
            { onConflict: 'product_id,store_id' }
          );
        if (ssErr) throw ssErr;
      }

      // Always return the persisted DB state (avoid relying on schema cache / returned rows).
      const { data: persisted, error: persistedErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();

      if (persistedErr) throw persistedErr;

      return jsonResponse({
        success: true,
        product: persisted,
        debug: {
          patch_applied: patch,
          store_id_for_stock: storeId,
          has_entrepot_column: Object.prototype.hasOwnProperty.call(persisted || {}, 'entrepot'),
        },
      });
    } catch (error: any) {
      console.error('Error editing product (PATCH):', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/products/") && method === "PUT") {
    try {
      const productId = path.split("/")[2];
      const body = await req.json();

      // If admin is adding stock "as" a specific magasin, update store_stocks for that store_id.
      const currentUserWithRole = await getCurrentUserWithRole(req);
      const requestedStoreId = body.store_id ? String(body.store_id) : null;
      const resolvedStoreId = (currentUserWithRole?.role === "admin")
        ? requestedStoreId
        : (currentUserWithRole?.store_id ? String(currentUserWithRole.store_id) : null);

      // Fetch current product to check stock_reference
      const { data: currentProduct, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (fetchError) throw fetchError;

      // If stock_reference is provided and different from current, AND quantity_available is being updated (adding stock), create a new product instead of updating
      const isAddingStock = body.quantity_available !== undefined;
      if (isAddingStock && body.stock_reference !== undefined && String(body.stock_reference).trim() !== String(currentProduct.stock_reference || '').trim()) {
        // Create new product with updated data
        const newProductData: any = {
          ...currentProduct,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };

        // Apply updates
        if (body.name !== undefined) newProductData.name = body.name;
        if (body.reference !== undefined) newProductData.reference = body.reference;
        newProductData.stock_reference = body.stock_reference; // Set the new stock_reference
        if (body.category !== undefined) newProductData.category = body.category;
        if (body.quantity_available !== undefined) {
          const v = body.quantity_available;
          newProductData.quantity_available = (v === '' || v === null) ? 0 : v;
        }
        if (body.purchase_price !== undefined) {
          const v = body.purchase_price;
          newProductData.purchase_price = (v === '' || v === null) ? 0 : v;
        }
        if (body.sale_price !== undefined) {
          const v = body.sale_price;
          newProductData.sale_price = (v === '' || v === null) ? 0 : v;
        }
        if (body.supplier_id !== undefined) newProductData.supplier_id = body.supplier_id || null;
        if (body.number_of_boxes !== undefined) {
          const v = body.number_of_boxes;
          newProductData.number_of_boxes = (v === '' || v === null) ? 0 : v;
        }
        if (body.total_net_weight !== undefined) {
          const v = body.total_net_weight;
          newProductData.total_net_weight = (v === '' || v === null) ? 0 : v;
        }
        if (body.avg_net_weight_per_box !== undefined) {
          const v = body.avg_net_weight_per_box;
          newProductData.avg_net_weight_per_box = (v === '' || v === null) ? 0 : v;
        }
        if (body.max_purchase_limit !== undefined) {
          const v = body.max_purchase_limit;
          newProductData.max_purchase_limit = (v === '' || v === null) ? null : v;
        }
        if (body.fourchette_min !== undefined) {
          const v = body.fourchette_min;
          newProductData.fourchette_min = (v === '' || v === null) ? null : v;
        }
        if (body.fourchette_max !== undefined) {
          const v = body.fourchette_max;
          newProductData.fourchette_max = (v === '' || v === null) ? null : v;
        }
        if (body.van_delivery_attachment_url !== undefined) newProductData.van_delivery_attachment_url = body.van_delivery_attachment_url || null;
        if (body.van_delivery_attachment_type !== undefined) newProductData.van_delivery_attachment_type = body.van_delivery_attachment_type || null;
        if (body.van_delivery_notes !== undefined) newProductData.van_delivery_notes = body.van_delivery_notes || null;

        // Remove id to create new
        delete newProductData.id;

        const { data: newProduct, error: createError } = await supabase
          .from("products")
          .insert([newProductData])
          .select()
          .single();

        if (createError) throw createError;

        // Update store_stocks for the new product
        if (body.quantity_available !== undefined && resolvedStoreId) {
          const qty = Number(newProductData.quantity_available ?? body.quantity_available ?? 0) || 0;
          const { error: upsertErr } = await supabase
            .from("store_stocks")
            .upsert(
              [{ product_id: newProduct.id, store_id: resolvedStoreId, quantity: qty }],
              { onConflict: "product_id,store_id" }
            );
          if (upsertErr) throw upsertErr;
        }

        // Write immutable history snapshot (Ajout Stock) for the newly created product
        try {
          const caisse = toNum(body.quantity_available ?? newProduct.quantity_available ?? 0);
          const quantite = toNum(body.number_of_boxes ?? newProduct.number_of_boxes ?? 0);
          const purchase = toNum(body.purchase_price ?? newProduct.purchase_price ?? 0);
          const moyenneDb = toNum(body.avg_net_weight_per_box ?? newProduct.avg_net_weight_per_box ?? 0);
          const moyenne = moyenneDb > 0 ? moyenneDb : (caisse > 0 && quantite > 0 ? round2(quantite / caisse) : 0);
          const totalValue = caisse * purchase;

          await insertProductAdditionHistoryRow({
            created_at: newProduct.created_at || new Date().toISOString(),
            created_by: currentUserWithRole?.id || null,
            created_by_email: currentUserWithRole?.email || null,
            store_id: resolvedStoreId || null,
            product_id: String(newProduct.id),
            stock_reference: newProduct.stock_reference || body.stock_reference || null,
            reference: newProduct.reference || body.reference || null,
            name: newProduct.name || body.name || null,
            category: newProduct.category || body.category || null,
            supplier_id: newProduct.supplier_id || body.supplier_id || null,
            lot: newProduct.lot || body.lot || null,
            purchase_price: purchase,
            sale_price: toNum(body.sale_price ?? newProduct.sale_price ?? 0),
            fourchette_min: body.fourchette_min ?? newProduct.fourchette_min ?? null,
            fourchette_max: body.fourchette_max ?? newProduct.fourchette_max ?? null,
            caisse,
            quantite,
            moyenne,
            total_value: totalValue,
          });
        } catch (e) {
          console.error('[products PUT new-product] Failed to insert product_additions_history row:', e);
        }

        return jsonResponse({ success: true, product: newProduct });
      } else {
        // Normal update
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        if (body.name !== undefined) updateData.name = body.name;
        if (body.reference !== undefined) updateData.reference = body.reference;
        if (body.stock_reference !== undefined) updateData.stock_reference = body.stock_reference; // keep existing if not provided
        if (body.category !== undefined) updateData.category = body.category;
        if (body.quantity_available !== undefined) {
          const v = body.quantity_available;
          updateData.quantity_available = (v === '' || v === null) ? 0 : v;
        }
        if (body.purchase_price !== undefined) {
          const v = body.purchase_price;
          updateData.purchase_price = (v === '' || v === null) ? 0 : v;
        }
        if (body.sale_price !== undefined) {
          const v = body.sale_price;
          updateData.sale_price = (v === '' || v === null) ? 0 : v;
        }
        if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null;
        if (body.number_of_boxes !== undefined) {
          const v = body.number_of_boxes;
          updateData.number_of_boxes = (v === '' || v === null) ? 0 : v;
        }
        if (body.total_net_weight !== undefined) {
          const v = body.total_net_weight;
          updateData.total_net_weight = (v === '' || v === null) ? 0 : v;
        }
        if (body.avg_net_weight_per_box !== undefined) {
          const v = body.avg_net_weight_per_box;
          updateData.avg_net_weight_per_box = (v === '' || v === null) ? 0 : v;
        }
        if (body.max_purchase_limit !== undefined) {
          const v = body.max_purchase_limit;
          updateData.max_purchase_limit = (v === '' || v === null) ? null : v;
        }
        if (body.fourchette_min !== undefined) {
          const v = body.fourchette_min;
          updateData.fourchette_min = (v === '' || v === null) ? null : v;
        }
        if (body.fourchette_max !== undefined) {
          const v = body.fourchette_max;
          updateData.fourchette_max = (v === '' || v === null) ? null : v;
        }
        if (body.van_delivery_attachment_url !== undefined) updateData.van_delivery_attachment_url = body.van_delivery_attachment_url || null;
        if (body.van_delivery_attachment_type !== undefined) updateData.van_delivery_attachment_type = body.van_delivery_attachment_type || null;
        if (body.van_delivery_notes !== undefined) updateData.van_delivery_notes = body.van_delivery_notes || null;

        const { data, error } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", productId)
          .select();

        if (error) throw error;

        // Stock update rule:
        // - quantity_available from the UI is a DELTA ("Caisse") to ADD into store_stocks.
        // - number_of_boxes from the UI is a DELTA ("Quantité") to ADD into products.number_of_boxes.
        // This is needed when restocking an existing product: both fields must accumulate.
        if (resolvedStoreId) {
        // 1) Update store-specific stock (CAISSE)
        if (body.quantity_available !== undefined) {
        const delta = Number(body.quantity_available ?? 0) || 0;
        
        const { data: row, error: rowErr } = await supabase
        .from("store_stocks")
        .select("id, quantity")
        .eq("product_id", productId)
        .eq("store_id", resolvedStoreId)
        .maybeSingle();
        
        if (rowErr && rowErr.code !== 'PGRST116') throw rowErr;
        
        const currentQty = Number(row?.quantity ?? 0) || 0;
        const newQty = currentQty + delta;
        
        if (row?.id) {
        const { error: updErr } = await supabase
        .from("store_stocks")
        .update({ quantity: newQty })
        .eq("id", row.id);
        if (updErr) throw updErr;
        } else {
        const { error: insErr } = await supabase
        .from("store_stocks")
        .insert([{ product_id: productId, store_id: resolvedStoreId, quantity: newQty }]);
        if (insErr) throw insErr;
        }
        }
        
        // 2) Update product-level quantity ("Quantité" / number_of_boxes) as a delta-add.
        // Some flows decrement number_of_boxes when transferring/purchasing; this keeps restock consistent.
        if (body.number_of_boxes !== undefined) {
        const deltaBoxes = Number(body.number_of_boxes ?? 0) || 0;
        
        const currentBoxes = Number(currentProduct?.number_of_boxes ?? 0) || 0;
        const newBoxes = currentBoxes + deltaBoxes;
        
        const { error: boxErr } = await supabase
        .from('products')
        .update({ number_of_boxes: newBoxes, updated_at: new Date().toISOString() })
        .eq('id', productId);
        
        if (boxErr) throw boxErr;
        }
        }

        // Write immutable history snapshot (Ajout Stock) for restock of existing product.
        // Only when the request is actually a delta-add (quantity_available / number_of_boxes present).
        try {
          const deltaCaisse = body.quantity_available !== undefined ? toNum(body.quantity_available ?? 0) : 0;
          const deltaQuantite = body.number_of_boxes !== undefined ? toNum(body.number_of_boxes ?? 0) : 0;

          // Only record when it's an Add Stock-like call.
          if (body.quantity_available !== undefined || body.number_of_boxes !== undefined) {
            const purchase = toNum(body.purchase_price ?? currentProduct.purchase_price ?? 0);
            const moyenneDb = toNum(body.avg_net_weight_per_box ?? currentProduct.avg_net_weight_per_box ?? 0);
            const moyenne = moyenneDb > 0 ? moyenneDb : (deltaCaisse > 0 && deltaQuantite > 0 ? round2(deltaQuantite / deltaCaisse) : 0);
            const totalValue = deltaCaisse * purchase;

            await insertProductAdditionHistoryRow({
              created_at: new Date().toISOString(),
              created_by: currentUserWithRole?.id || null,
              created_by_email: currentUserWithRole?.email || null,
              store_id: resolvedStoreId || null,
              product_id: String(productId),
              stock_reference: body.stock_reference ?? currentProduct.stock_reference ?? null,
              reference: body.reference ?? currentProduct.reference ?? null,
              name: body.name ?? currentProduct.name ?? null,
              category: body.category ?? currentProduct.category ?? null,
              supplier_id: body.supplier_id ?? currentProduct.supplier_id ?? null,
              lot: body.lot ?? currentProduct.lot ?? null,
              purchase_price: purchase,
              sale_price: toNum(body.sale_price ?? currentProduct.sale_price ?? 0),
              fourchette_min: body.fourchette_min ?? currentProduct.fourchette_min ?? null,
              fourchette_max: body.fourchette_max ?? currentProduct.fourchette_max ?? null,
              caisse: deltaCaisse,
              quantite: deltaQuantite,
              moyenne,
              total_value: totalValue,
            });
          }
        } catch (e) {
          console.error('[products PUT] Failed to insert product_additions_history row:', e);
        }

        return jsonResponse({ success: true, product: data?.[0] });
      }
    } catch (error: any) {
      console.error("Error updating product:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/products/") && method === "DELETE") {
    try {
      const productId = path.split("/")[2];
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting product:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/clients" && method === "GET") {
    try {
      const url = new URL(req.url);
      const requestedStoreId = url.searchParams.get("store_id");

      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Admin behavior:
      // - If ?store_id is provided => filter by that store_id ("act as")
      // - If not provided => return ALL clients (admin overview)
      // Non-admin:
      // - Always restricted to their own store.
      const effectiveStoreId = currentUser.role === "admin"
        ? (requestedStoreId || null)
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      let query = supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentUser.role === "admin") {
        if (effectiveStoreId) {
          query = query.eq("store_id", effectiveStoreId);
        }
      } else {
        // Non-admin must have a store to see clients
        if (!effectiveStoreId) {
          return jsonResponse({ clients: [] });
        }
        query = query.eq("store_id", effectiveStoreId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ clients: data || [] });
    } catch (error: any) {
      console.error("Error fetching clients:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/clients" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);
      
      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Determine store_id based on user role
      let storeId: string | null = null;

      if (currentUser.role === "admin") {
        // Admin MUST choose which magasin they are creating the client for.
        // This avoids silently assigning the first store and makes auditing clear.
        if (!body.store_id) {
          return jsonResponse({ error: "store_id is required for admin client creation" }, 400);
        }
        storeId = String(body.store_id);
      } else {
        // Non-admin users must have a store_id assigned
        if (!currentUser.store_id) {
          return jsonResponse({ error: "User must have a store assigned" }, 400);
        }
        storeId = String(currentUser.store_id);
      }

      const { data, error } = await supabase
        .from("clients")
        .insert([
          {
            store_id: storeId,
            name: body.name,
            phone: body.phone,
            address: body.address,
            ice: body.ice,
            if_number: body.if_number || null,
            rc: body.rc || null,
            patente: body.patente || null,
            balance: 0,
            status: "active",
            created_by: currentUser.id,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, client: data?.[0] });
    } catch (error: any) {
      console.error("Error creating client:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/clients/") && method === "PUT") {
    try {
      const clientId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("clients")
        .update({
          name: body.name,
          phone: body.phone,
          address: body.address,
          ice: body.ice,
          if_number: body.if_number || null,
          rc: body.rc || null,
          patente: body.patente || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, client: data?.[0] });
    } catch (error: any) {
      console.error("Error updating client:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/clients/") && method === "DELETE") {
    try {
      const clientId = path.split("/")[2];
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting client:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if ((path === "/stores") && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      console.log("[/stores GET] currentUser:", currentUser);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const url = new URL(req.url);
      const includeAll = String(url.searchParams.get('all') || '').toLowerCase() === 'true';

      let query = supabase
        .from("stores")
        .select("*")
        .order("created_at", { ascending: false });

      // Security:
      // - Admin: can see all stores
      // - Non-admin:
      //    - default: only own store
      //    - if ?all=true: return all stores (needed for transfer source selector)
      if (String(currentUser.role || '').toLowerCase() !== "admin") {
        if (!includeAll) {
          if (!currentUser.store_id) {
            return jsonResponse({ stores: [] });
          }
          query = query.eq("id", currentUser.store_id);
        }
      }

      const { data, error } = await query;
      console.log(`[/stores GET] Returning ${data?.length || 0} stores`);
      console.log("[/stores GET] Returning store ids:", (data || []).map((s: any) => s.id));
      console.log("[/stores GET] Returning store names:", (data || []).map((s: any) => s.name));

      if (error) throw error;
      return jsonResponse({ stores: data || [] });
    } catch (error: any) {
      console.error("Error fetching stores:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if ((path === "/stores") && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      const { data, error } = await supabase
        .from("stores")
        .insert([
          {
            name: body.name,
            email: body.email || null,
            phone: body.phone,
            address: body.address,
            city: body.city,
            postal_code: body.postal_code,
            contact_person: body.contact_person,
            balance: 0,
            status: "active",
            // Link the store to the creating user when possible.
            // This makes "take my place" and store filtering work reliably.
            user_id: currentUser?.id || null,
          },
        ])
        .select();

      if (error) throw error;

      // Backfill the creating user's store_id if missing.
      // This keeps the association consistent in both directions.
      const createdStoreId = data?.[0]?.id;
      if (currentUser?.id && createdStoreId) {
        const { data: existingUser, error: userFetchError } = await supabase
          .from("users")
          .select("store_id")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (!userFetchError && existingUser && !existingUser.store_id) {
          const { error: userUpdateError } = await supabase
            .from("users")
            .update({ store_id: createdStoreId, updated_at: new Date().toISOString() })
            .eq("id", currentUser.id);

          if (userUpdateError) {
            console.warn("Could not backfill users.store_id after store creation:", userUpdateError.message);
          }
        }
      }

      return jsonResponse({ success: true, store: data?.[0] });
    } catch (error: any) {
      console.error("Error creating store:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if ((path.startsWith("/stores/")) && method === "PUT") {
    try {
      const storeId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("stores")
        .update({
          name: body.name,
          email: body.email || null,
          phone: body.phone,
          address: body.address,
          city: body.city,
          postal_code: body.postal_code,
          contact_person: body.contact_person,
          updated_at: new Date().toISOString(),
        })
        .eq("id", storeId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, store: data?.[0] });
    } catch (error: any) {
      console.error("Error updating store:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if ((path.startsWith("/stores/")) && method === "DELETE") {
    try {
      const storeId = path.split("/")[2];
      const { error } = await supabase
        .from("stores")
        .delete()
        .eq("id", storeId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting store:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/stock-reference-details" && method === "GET") {
    try {
      const url = new URL(req.url);
      const stockReference = url.searchParams.get("stock_reference");

      if (!stockReference) {
        return jsonResponse({ error: "stock_reference parameter is required" }, 400);
      }

      const { data, error } = await supabase
        .from("stock_reference_details")
        .select("*, suppliers(name)")
        .eq("stock_reference", stockReference)
        .single();

      if (error && error.code === 'PGRST116') {
        // No record found, return null details
        return jsonResponse({ details: null });
      }

      if (error) throw error;

      // Transform supplier data
      const details = data ? {
        ...data,
        supplier_name: data.suppliers?.name || null,
      } : null;

      return jsonResponse({ details });
    } catch (error: any) {
      console.error("Error fetching stock reference details:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Update stock reference details (supplier + company fields)
  // PUT /stock-reference-details/:stock_reference
  if (path.startsWith("/stock-reference-details/") && method === "PUT") {
    try {
      const stockReference = decodeURIComponent(path.split("/")[2] || "");
      if (!stockReference) return jsonResponse({ error: "stock_reference is required" }, 400);

      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Non-admin users can edit only within their store scope.
      // stock_reference_details does not contain store_id in current schema, so we only enforce:
      // - must not be admin-only route => allow; (tightening would require schema change)
      // This endpoint is meant for trusted roles; UI is permission-gated.

      const updateData: any = { updated_at: new Date().toISOString() };

      if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null;
      if (body.palette_category !== undefined) updateData.palette_category = body.palette_category || null;

      // Numeric company fields: allow null, convert "" to null
      const setNumeric = (key: string, v: any) => {
        if (v === undefined) return;
        if (v === '' || v === null) {
          updateData[key] = null;
          return;
        }
        const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
        if (!Number.isFinite(n)) throw new Error(`Invalid ${key}`);
        updateData[key] = n;
      };

      setNumeric('frais_maritime', body.frais_maritime);
      setNumeric('frais_transit', body.frais_transit);
      setNumeric('onssa', body.onssa);
      setNumeric('frais_divers', body.frais_divers);
      setNumeric('frais_transport', body.frais_transport);
      setNumeric('magasinage', body.magasinage);
      setNumeric('taxe', body.taxe);

      if (body.date_dechargement !== undefined) updateData.date_dechargement = body.date_dechargement || null;
      if (body.entrepot !== undefined) updateData.entrepot = body.entrepot || null;
      if (body.matricule !== undefined) updateData.matricule = body.matricule || null;
      if (body.date_chargement !== undefined) updateData.date_chargement = body.date_chargement || null;

      // Upsert by stock_reference (so editing also creates the row if missing)
      const { data: upserted, error } = await supabase
        .from('stock_reference_details')
        .upsert([{ stock_reference: stockReference, ...updateData }], { onConflict: 'stock_reference' })
        .select('*, suppliers(name)')
        .eq('stock_reference', stockReference)
        .single();

      if (error) throw error;

      const details = upserted ? {
        ...upserted,
        supplier_name: (upserted as any).suppliers?.name || null,
      } : null;

      return jsonResponse({ success: true, details });
    } catch (error: any) {
      console.error('Error updating stock reference details:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Stock reference helpers
  const padStockRef = (n: number) => String(n).padStart(6, "0");

  // ===== BL (Bon de Livraison) number generator =====
  // IMPORTANT:
  // - If the frontend/user provides a custom sale_number (BL), we must NOT overwrite it.
  // - We only consume /bl/next when the user did NOT provide one.
  // - The provided sale_number should appear everywhere (Sales page, PDF, etc.).
  //
  // Use preview/consume so we only increment the counter when a BL is actually saved.
  // - GET /bl/preview  -> returns next BL without consuming
  // - POST /bl/next    -> consumes next BL (increments)

  // Preview-only: returns what the next stock reference WOULD be, without reserving/consuming it.
  if (path === "/stock-reference-details/next" && method === "GET") {
    try {
      // Find current max numeric reference.
      const { data: maxRow, error: maxError } = await supabase
        .from("stock_reference_details")
        .select("stock_reference")
        .order("created_at", { ascending: false })
        .order("stock_reference", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxError) throw maxError;

      const maxRef = maxRow?.stock_reference || "000000";
      const maxNum = parseInt(String(maxRef).replace(/\D/g, "") || "0", 10);
      const nextNum = (isNaN(maxNum) ? 0 : maxNum) + 1;
      const nextRef = padStockRef(nextNum);

      return jsonResponse({ stock_reference: nextRef, preview: true });
    } catch (error: any) {
      console.error("Error previewing next stock reference:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // BL counter endpoints
  // - GET /bl/preview  -> returns next BL without consuming
  // - POST /bl/next    -> consumes next BL (increments)
  //
  // Invoice (Facture) counter endpoints
  // - GET /invoices/preview-number  -> returns next invoice number without consuming
  // - POST /invoices/next-number    -> consumes next invoice number (increments)
  if (path === "/bl/preview" && method === "GET") {
    try {
      const url = new URL(req.url);
      const counterId = url.searchParams.get("counter_id") || "global";

      const { data, error } = await supabase.rpc("preview_next_bl_number", {
        counter_id: counterId,
      });

      if (error) throw error;
      return jsonResponse({ bl_number: data, counter_id: counterId, preview: true });
    } catch (error: any) {
      console.error("Error previewing next BL:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/bl/next" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const counterId = body.counter_id || "global";

      const { data, error } = await supabase.rpc("consume_next_bl_number", {
        counter_id: counterId,
      });

      if (error) throw error;
      return jsonResponse({ bl_number: data, counter_id: counterId, preview: false });
    } catch (error: any) {
      console.error("Error consuming next BL:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Invoice number endpoints (Facture)
  if (path === "/invoices/preview-number" && method === "GET") {
    try {
      const url = new URL(req.url);
      const counterId = url.searchParams.get("counter_id") || "global";

      const { data, error } = await supabase.rpc("preview_next_invoice_number", {
        counter_id: counterId,
      });

      if (error) throw error;
      return jsonResponse({ invoice_number: data, counter_id: counterId, preview: true });
    } catch (error: any) {
      console.error("Error previewing next invoice number:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/invoices/next-number" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const counterId = body.counter_id || "global";

      const { data, error } = await supabase.rpc("consume_next_invoice_number", {
        counter_id: counterId,
      });

      if (error) throw error;
      return jsonResponse({ invoice_number: data, counter_id: counterId, preview: false });
    } catch (error: any) {
      console.error("Error consuming next invoice number:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Atomic generator for next stock reference (concurrency-safe) - this RESERVES/CONSUMES the number.
  if (path === "/stock-reference-details/next" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));

      // We rely on stock_reference_details.stock_reference UNIQUE constraint.
      // Insert a new row with the next numeric reference. If there is a conflict,
      // retry a few times.
      for (let attempt = 0; attempt < 10; attempt++) {
        // Find current max numeric reference.
        // IMPORTANT: order by created_at (and stock_reference as tie-breaker) to avoid
        // lexicographic issues and ensure we always move forward.
        const { data: maxRow, error: maxError } = await supabase
          .from("stock_reference_details")
          .select("stock_reference")
          .order("created_at", { ascending: false })
          .order("stock_reference", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxError) throw maxError;

        const maxRef = maxRow?.stock_reference || "000000";
        const maxNum = parseInt(String(maxRef).replace(/\D/g, "") || "0", 10);
        const nextNum = (isNaN(maxNum) ? 0 : maxNum) + 1;
        const nextRef = padStockRef(nextNum);

        const { data: inserted, error: insertError } = await supabase
          .from("stock_reference_details")
          .insert([
            {
              stock_reference: nextRef,
              supplier_id: body.supplier_id || null,
              frais_maritime: body.frais_maritime ?? null,
              frais_transit: body.frais_transit ?? null,
              onssa: body.onssa ?? null,
              frais_divers: body.frais_divers ?? null,
              frais_transport: body.frais_transport ?? null,
              date_dechargement: body.date_dechargement ?? null,
              entrepot: body.entrepot ?? null,
              matricule: body.matricule ?? null,
              date_chargement: body.date_chargement ?? null,
              magasinage: body.magasinage ?? null,
              taxe: body.taxe ?? null,
            },
          ])
          .select("stock_reference")
          .single();

        if (!insertError && inserted?.stock_reference) {
          return jsonResponse({ stock_reference: inserted.stock_reference, preview: false });
        }

        // If unique violation (another user inserted same ref), retry
        if (insertError) {
          const msg = String(insertError.message || "");
          if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
            continue;
          }
          throw insertError;
        }
      }

      return jsonResponse({ error: "Could not generate next stock_reference (too many concurrent attempts)" }, 409);
    } catch (error: any) {
      console.error("Error generating next stock reference:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/users" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || "").toLowerCase();

      // Admin can fetch everything (including permissions)
      if (role === "admin") {
        const { data: users, error } = await supabase
          .from("users")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return jsonResponse({ users: users || [] });
      }

      // Non-admin: return a minimal list containing:
      // - the current user (so the frontend can read role/permissions reliably)
      // - all admin users (so manager pages can list "Fournisseur Admin")
      // IMPORTANT: must include permissions, otherwise the UI will hide most tabs.
      // IMPORTANT: keep the response shape compatible with older frontend code that expects:
      //    data.users.find(u => u.email === session.user.email)
      // and reads u.permissions.
      //
      // We also make sure the CURRENT USER row is included even if their role is not exactly "manager".
      const { data: users, error } = await supabase
        .from("users")
        .select("id, email, role, store_id, permissions")
        .or(`id.eq.${currentUser.id},role.eq.admin,role.ilike.admin`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ users: users || [] });
    } catch (error: any) {
      console.error("Error fetching users:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Caisse data hard-scoping (per-magasin) =====
  // Goal: non-admin users must ONLY ever receive rows for their own store.
  // Admin can optionally filter by ?store_id=...; otherwise remains "global".
  const getEffectiveStoreIdFromQuery = (req: Request) => {
    const url = new URL(req.url);
    const storeId = url.searchParams.get('store_id');
    return storeId ? String(storeId) : null;
  };

  // Helper used by caisse-related endpoints.
  // IMPORTANT: even admin is store-scoped by default.
  // Admin can override by passing ?store_id=... explicitly.
  const resolveStoreScope = (currentUser: any, req: Request) => {
    const role = String(currentUser?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const requestedStoreId = getEffectiveStoreIdFromQuery(req);

    if (isAdmin) {
      // Default admin caisse to their own store to avoid a global caisse.
      const fallbackStoreId = currentUser?.store_id ? String(currentUser.store_id) : null;
      return { role, isAdmin: true, storeId: requestedStoreId || fallbackStoreId };
    }

    const storeId = currentUser?.store_id ? String(currentUser.store_id) : null;
    return { role, isAdmin: false, storeId };
  };

  // Caisse endpoints used by the UI MUST be store-scoped for non-admin.
  // This prevents "global caisse" leaks when the frontend forgets to filter.
  const applyStoreScope = (query: any, storeColumn: string, scope: { isAdmin: boolean; storeId: string | null }) => {
    if (!scope.isAdmin) {
      if (!scope.storeId) {
        // Non-admin without magasin: return empty by filtering to a non-existing id.
        return query.eq(storeColumn, '__NO_STORE__');
      }
      return query.eq(storeColumn, scope.storeId);
    }

    // Admin: optional store_id filter.
    if (scope.storeId) {
      return query.eq(storeColumn, scope.storeId);
    }

    return query;
  };

  if (path === "/suppliers" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      console.log("[/suppliers GET] currentUser:", currentUser);

      let query = supabase
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });

      // Security:
      // - Admin: can see all suppliers
      // - Non-admin: can see:
      //    (A) suppliers belonging to their own magasin (store_id == currentUser.store_id)
      //    (B) admin-linked "Fournisseur Admin" suppliers (admin_user_id is not null)
      //
      // This fixes a bug where managers created a supplier successfully, but it never
      // appeared in their list because GET /suppliers was filtering ONLY admin-linked rows.
      if (currentUser.role !== "admin") {
      if (!currentUser.store_id) return jsonResponse({ suppliers: [] });
      
      // Return BOTH:
      // - suppliers of my store
      // - suppliers linked to an admin user (Fournisseur Admin)
      query = query.or(`store_id.eq.${currentUser.store_id},admin_user_id.not.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const suppliers = data || [];

      // Enrich with creator email so UI can display it reliably
      const createdByIds = Array.from(
        new Set(
          suppliers
            .map((s: any) => s?.created_by)
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      const emailByUserId = new Map<string, string>();
      if (createdByIds.length > 0) {
        const { data: usersRows, error: usersErr } = await supabase
          .from("users")
          .select("id, email")
          .in("id", createdByIds);

        if (usersErr) {
          console.warn("[/suppliers GET] could not fetch users for enrichment:", usersErr.message);
        } else {
          (usersRows || []).forEach((u: any) => {
            if (u?.id) emailByUserId.set(String(u.id), u?.email || "");
          });
        }
      }

      // If supplier is an "admin supplier" (admin_user_id set), we want it to be searchable
      // and displayable even if suppliers.name is empty. So we enrich with the admin user's email.
      const adminUserIds = Array.from(
        new Set(
          suppliers
            .map((s: any) => s?.admin_user_id)
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      const emailByAdminUserId = new Map<string, string>();
      if (adminUserIds.length > 0) {
        const { data: adminRows, error: adminErr } = await supabase
          .from("users")
          .select("id, email")
          .in("id", adminUserIds);

        if (adminErr) {
          console.warn("[/suppliers GET] could not fetch admin users for enrichment:", adminErr.message);
        } else {
          (adminRows || []).forEach((u: any) => {
            if (u?.id) emailByAdminUserId.set(String(u.id), u?.email || "");
          });
        }
      }

      const enrichedSuppliers = suppliers.map((s: any) => {
        const createdBy = s?.created_by ? String(s.created_by) : null;
        const adminUserId = s?.admin_user_id ? String(s.admin_user_id) : null;

        const created_by_email = createdBy ? (emailByUserId.get(createdBy) || null) : null;
        const admin_email = adminUserId ? (emailByAdminUserId.get(adminUserId) || null) : null;

        const safeName = String(s?.name || "").trim();
        const displayName =
          safeName ||
          admin_email ||
          created_by_email ||
          (adminUserId ? `Fournisseur Admin (${adminUserId})` : (s?.id ? String(s.id) : ""));

        return {
          ...s,
          name: safeName || displayName,
          created_by_email,
          admin_email,
          __displayName: displayName,
        };
      });

      return jsonResponse({ suppliers: enrichedSuppliers });
    } catch (error: any) {
      console.error("Error fetching suppliers:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/suppliers" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Validate input
      const name = String(body.name || "").trim();
      if (!name) {
        return jsonResponse({ error: "Supplier name is required" }, 400);
      }

      // Determine store_id
      // - Admin: can create supplier for a given store (body.store_id) or global (null)
      // - Non-admin: must be assigned to a store and can only create for their own store
      if (currentUser.role !== "admin" && !currentUser.store_id) {
        return jsonResponse({ error: "User must have a store assigned" }, 400);
      }

      // Admin must explicitly choose a magasin for supplier creation.
      // This prevents "unassigned" suppliers (store_id null) leaking across stores.
      if (currentUser.role === "admin") {
        if (!body.store_id) {
          return jsonResponse({ error: "store_id is required for admin supplier creation" }, 400);
        }
      }

      const resolvedStoreId = currentUser.role === "admin"
        ? String(body.store_id)
        : String(currentUser.store_id);

      // Optional: link this supplier to an admin user.
      // This allows "Fournisseur Admin" to behave like a real supplier.
      const adminUserId = body.admin_user_id ? String(body.admin_user_id) : null;

      if (adminUserId) {
        // Ensure target user exists and is admin
        const { data: u, error: uErr } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', adminUserId)
          .maybeSingle();

        if (uErr) throw uErr;
        if (!u) return jsonResponse({ error: 'admin_user_id not found' }, 400);
        if (String(u.role || '').toLowerCase() !== 'admin') {
          return jsonResponse({ error: 'admin_user_id must be a user with role=admin' }, 400);
        }

        // Enforce 1:1 (unique index should also protect)
        const { data: existing, error: exErr } = await supabase
          .from('suppliers')
          .select('id')
          .eq('admin_user_id', adminUserId)
          .maybeSingle();

        if (exErr) throw exErr;
        if (existing?.id) {
          return jsonResponse({ error: 'A supplier already exists for this admin_user_id' }, 409);
        }
      }

      const { data, error } = await supabase
        .from("suppliers")
        .insert([
          {
            store_id: resolvedStoreId,
            name,
            email: body.email || null,
            phone: body.phone || null,
            address: body.address || null,
            city: body.city || null,
            postal_code: body.postal_code || null,
            contact_person: body.contact_person || null,
            payment_terms: body.payment_terms || null,
            is_passage: !!body.is_passage,
            balance: 0,
            status: "active",
            created_by: currentUser.id,
            admin_user_id: adminUserId,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, supplier: data?.[0] });
    } catch (error: any) {
      console.error("Error creating supplier:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/suppliers/") && method === "PUT") {
    try {
      const supplierId = path.split("/")[2];
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Load supplier for authorization checks
      const { data: supplier, error: supplierErr } = await supabase
        .from("suppliers")
        .select("id, store_id")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplierErr) throw supplierErr;
      if (!supplier) return jsonResponse({ error: "Supplier not found" }, 404);

      // Authorization: non-admin can only update suppliers belonging to their store.
      // Global suppliers (store_id null) are admin-only for updates.
      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        if (!supplier.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        if (String(supplier.store_id) !== String(currentUser.store_id)) {
          return jsonResponse({ error: "Unauthorized" }, 403);
        }
      }

      // Build update data safely (only include fields that are provided)
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) updateData.name = String(body.name || "").trim();
      if (body.email !== undefined) updateData.email = body.email || null;
      if (body.phone !== undefined) updateData.phone = body.phone || null;
      if (body.address !== undefined) updateData.address = body.address || null;
      if (body.city !== undefined) updateData.city = body.city || null;
      if (body.postal_code !== undefined) updateData.postal_code = body.postal_code || null;
      if (body.contact_person !== undefined) updateData.contact_person = body.contact_person || null;
      if (body.payment_terms !== undefined) updateData.payment_terms = body.payment_terms || null;
      if (body.is_passage !== undefined) updateData.is_passage = !!body.is_passage;

      // Balance is sensitive: allow admin always; allow non-admin only if explicitly provided
      // (still guarded by store authorization above).
      if (body.balance !== undefined) updateData.balance = body.balance;

      // Prevent empty name
      if (updateData.name !== undefined && !String(updateData.name).trim()) {
        return jsonResponse({ error: "Supplier name is required" }, 400);
      }

      const { data, error } = await supabase
        .from("suppliers")
        .update(updateData)
        .eq("id", supplierId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, supplier: data?.[0] });
    } catch (error: any) {
      console.error("Error updating supplier:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/suppliers/") && method === "DELETE") {
    try {
      const supplierId = path.split("/")[2];
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Load supplier for authorization checks
      const { data: supplier, error: supplierErr } = await supabase
        .from("suppliers")
        .select("id, store_id")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplierErr) throw supplierErr;
      if (!supplier) return jsonResponse({ error: "Supplier not found" }, 404);

      // Authorization: non-admin can only delete suppliers belonging to their store.
      // Global suppliers (store_id null) are admin-only.
      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        if (!supplier.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        if (String(supplier.store_id) !== String(currentUser.store_id)) {
          return jsonResponse({ error: "Unauthorized" }, 403);
        }
      }

      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", supplierId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting supplier:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/product-templates" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;

      let q = supabase
        .from("product_templates")
        .select("*")
        .order("created_at", { ascending: false });

      // Visibility rule changed:
      // Everyone can see ALL product templates (no store/creator scoping).
      // No filtering by store_id/created_by.

      const { data, error } = await q;
      if (error) throw error;

      return jsonResponse({ templates: data || [] });
    } catch (error: any) {
      console.error("Error fetching product templates:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Coffer Movements (NEW) =====
  // Supports two operations:
  // 1) "deposit"  : Caisse -> Coffre (adds to coffre AND mirrors as caisse outflow)
  // 2) "versement": Direct to Coffre (adds to coffre ONLY; does NOT subtract from caisse)
  //
  // We store these movements in `expenses` to reuse existing history tooling.
  //
  // expense_type values (coffer side):
  // - coffer_deposit_cash
  // - coffer_deposit_check
  // - coffer_deposit_bank_transfer
  //
  // expense_type values (caisse outflow mirror):
  // - caisse_out_cash
  // - caisse_out_check
  // - caisse_out_bank_transfer
  if (path === "/coffers" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  // Return active coffers, always including 'main' if present.
  const { data, error } = await supabase
  .from('coffers')
  .select('id, name, is_active, created_at')
  .eq('is_active', true)
  .order('created_at', { ascending: true });
  
  if (error) throw error;
  return jsonResponse({ coffers: data || [] });
  } catch (error: any) {
  console.error('Error fetching coffers:', error);
  return jsonResponse({ error: error.message }, 500);
  }
  }
  
  if (path === "/coffers" && method === "POST") {
  try {
  const body = await req.json().catch(() => ({}));
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  // Admin-only: coffer list is global.
  const role = String((currentUser as any)?.role || '').toLowerCase();
  if (role !== 'admin') return jsonResponse({ error: 'Unauthorized' }, 403);
  
  const id = body.id ? String(body.id).trim() : '';
  const name = String(body.name || '').trim();
  
  if (!id) return jsonResponse({ error: 'id is required' }, 400);
  if (!name) return jsonResponse({ error: 'name is required' }, 400);
  
  // Keep ids safe for URLs/keys.
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
  return jsonResponse({ error: 'invalid id' }, 400);
  }
  
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
  .from('coffers')
  .upsert([
  {
  id,
  name,
  is_active: true,
  updated_at: now,
  },
  ], { onConflict: 'id' })
  .select('id, name, is_active, created_at')
  .maybeSingle();
  
  if (error) throw error;
  return jsonResponse({ success: true, coffer: data });
  } catch (error: any) {
  console.error('Error creating coffer:', error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path === "/pending-coffer-transfers" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      const url = new URL(req.url);

      // Filters
      // Admin "Tous les magasins" may omit store_id.
      // Non-admin is always forced to their own store_id.
      const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
      const requestedStatus = String(url.searchParams.get('status') || '').trim().toLowerCase() || null;

      const effectiveStoreId = role === 'admin'
        ? requestedStoreId // null => all stores
        : (currentUser.store_id ? String(currentUser.store_id).trim() : null);

      if (role !== 'admin' && !effectiveStoreId) return jsonResponse({ transfers: [] });

      let q = supabase
        .from('pending_coffer_transfers')
        .select('*')
        .order('created_at', { ascending: false });

      if (effectiveStoreId) q = q.eq('store_id', effectiveStoreId);

      if (requestedStatus && (requestedStatus === 'pending' || requestedStatus === 'confirmed' || requestedStatus === 'rejected')) {
        q = q.eq('status', requestedStatus);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []) as any[];

      // Enrich with store names for admin table
      const storeIds = Array.from(new Set(rows.map((r) => r?.store_id).filter(Boolean).map((v) => String(v))));
      const storeNameById = new Map<string, string>();
      if (storeIds.length > 0) {
        const { data: storesRows, error: sErr } = await supabase
          .from('stores')
          .select('id, name')
          .in('id', storeIds);

        if (sErr) {
          console.warn('[pending-coffer-transfers GET] could not fetch stores:', sErr.message);
        } else {
          (storesRows || []).forEach((st: any) => {
            if (st?.id) storeNameById.set(String(st.id), String(st.name || ''));
          });
        }
      }

      // For compatibility with existing UI naming
      const enriched = rows.map((r: any) => ({
        ...r,
        store_name: r?.store_id ? (storeNameById.get(String(r.store_id)) || null) : null,
      }));

      return jsonResponse({ transfers: enriched });
    } catch (error: any) {
      console.error('Error fetching pending coffer transfers:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/pending-coffer-transfers" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'manager' && role !== 'user' && role !== 'magasin_manager') {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }

      const storeId = currentUser.store_id ? String(currentUser.store_id).trim() : '';
      if (!storeId) return jsonResponse({ error: 'User must have a store assigned' }, 400);

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: 'amount must be > 0' }, 400);

      const targetCofferId = String(body.target_coffer_id || body.coffer_id || '').trim();
      // target_coffer_id is OPTIONAL now (migration 128 makes it nullable)

      const referenceNumber = body.reference_number ? String(body.reference_number).trim() : null;

      // Ensure notes always contains a deterministic marker so list endpoints can compute confirmed/pending.
      // We support both linkage styles:
      // - supplier_admin_global_payment_id=<uuid>
      // - store_global_payment_id=<uuid>
      const baseNotes = body.notes ? String(body.notes) : '';

      const supplierAdminMarker = body.supplier_admin_global_payment_id
        ? `supplier_admin_global_payment_id=${String(body.supplier_admin_global_payment_id).trim()}`
        : '';

      const storeGpMarker = body.store_global_payment_id
        ? `store_global_payment_id=${String(body.store_global_payment_id).trim()}`
        : '';

      const markersToAppend: string[] = [];
      if (supplierAdminMarker && !baseNotes.includes('supplier_admin_global_payment_id=')) markersToAppend.push(supplierAdminMarker);
      if (storeGpMarker && !baseNotes.includes('store_global_payment_id=')) markersToAppend.push(storeGpMarker);

      const notes = (markersToAppend.length > 0)
        ? `${baseNotes}${baseNotes ? ' | ' : ''}${markersToAppend.join(' | ')}`
        : (baseNotes || null);

      // Validate target coffer exists and is active
      const { data: cRow, error: cErr } = await supabase
        .from('coffers')
        .select('id, is_active')
        .eq('id', targetCofferId)
        .maybeSingle();

      if (cErr) throw cErr;
      if (!cRow?.id) return jsonResponse({ error: 'target_coffer_id not found' }, 400);
      if (cRow.is_active === false) return jsonResponse({ error: 'target_coffer_id is inactive' }, 400);

      const { data, error } = await supabase
        .from('pending_coffer_transfers')
        .insert([
          {
            store_id: storeId,
            target_coffer_id: (targetCofferId || null),
            amount,
            reference_number: referenceNumber,
            notes,
            status: 'pending',
            created_by: currentUser.id,
          },
        ])
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return jsonResponse({ success: true, transfer: data });
    } catch (error: any) {
      console.error('Error creating pending coffer transfer:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith('/pending-coffer-transfers/') && method === 'POST') {
    // POST /pending-coffer-transfers/:id/confirm
    // POST /pending-coffer-transfers/:id/reject
    try {
      const parts = path.split('/').filter(Boolean);
      const id = parts[1] || '';
      const action = parts[2] || '';

      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'admin') return jsonResponse({ error: 'Unauthorized' }, 403);

      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      if (action !== 'confirm' && action !== 'reject') return jsonResponse({ error: 'Invalid action' }, 400);

      // Load transfer
      const { data: t, error: tErr } = await supabase
        .from('pending_coffer_transfers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!t) return jsonResponse({ error: 'Transfer not found' }, 404);
      if (String(t.status || '').toLowerCase() !== 'pending') {
        return jsonResponse({ error: 'Transfer is not pending' }, 409);
      }

      if (action === 'reject') {
        const { data: upd, error: updErr } = await supabase
          .from('pending_coffer_transfers')
          .update({
            status: 'rejected',
            confirmed_by: currentUser.id,
            confirmed_at: new Date().toISOString(),
            notes: body?.notes ? String(body.notes) : t.notes,
          })
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (updErr) throw updErr;
        return jsonResponse({ success: true, transfer: upd });
      }

      // confirm
      const storeId = t.store_id ? String(t.store_id) : null;
      const amount = Number(t.amount || 0) || 0;

      if (!storeId) return jsonResponse({ error: 'store_id is required on transfer' }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: 'amount must be > 0' }, 400);

      // Admin can choose the destination coffer at confirmation time.
      // Priority:
      //  1) body.coffer_id / body.target_coffer_id (explicit selection at confirm)
      //  2) transfer.target_coffer_id (if it was selected earlier)
      //
      // With migration 128, target_coffer_id can be NULL to represent "not selected yet".
      const overrideCofferId = String(body.coffer_id || body.target_coffer_id || '').trim() || null;
      const existingTargetCofferId = t.target_coffer_id ? String(t.target_coffer_id).trim() : null;
      const finalCofferId = overrideCofferId || existingTargetCofferId;

      if (!finalCofferId) {
        return jsonResponse({
          error: 'coffer_id is required to confirm this transfer',
          hint: 'Admin must select a destination coffer when confirming pending transfers.',
        }, 400);
      }

      // Validate destination coffer exists and is active
      const { data: cRow, error: cErr } = await supabase
        .from('coffers')
        .select('id, is_active')
        .eq('id', finalCofferId)
        .maybeSingle();

      if (cErr) throw cErr;
      if (!cRow?.id) return jsonResponse({ error: 'coffer_id not found' }, 400);
      if (cRow.is_active === false) return jsonResponse({ error: 'coffer_id is inactive' }, 400);

      // Create a coffer movement in expenses (store-scoped).
      // This represents money entering the selected coffer.
      const reason = `Transfert vers coffre (${finalCofferId})`;

      const ins = await supabase
        .from('expenses')
        .insert([
          {
            store_id: storeId,
            coffer_id: finalCofferId,
            amount: Math.abs(amount),
            expense_type: 'coffer_deposit_cash',
            reason,
            created_by: currentUser.id,
            notes: `pending_coffer_transfer_id=${id}`,
          },
        ])
        .select('*')
        .maybeSingle();

      if (ins.error) throw ins.error;

      // Persist the chosen coffer on the transfer (so future reads show where it went)
      const { data: upd, error: updErr } = await supabase
        .from('pending_coffer_transfers')
        .update({
          status: 'confirmed',
          confirmed_by: currentUser.id,
          confirmed_at: new Date().toISOString(),
          target_coffer_id: finalCofferId,
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (updErr) throw updErr;

      return jsonResponse({ success: true, transfer: upd, expense: ins.data });
    } catch (error: any) {
      console.error('Error confirming/rejecting pending coffer transfer:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/coffer-movements" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const cofferId = String(body.coffer_id || "main").trim() || "main";
      const amount = Number(body.amount);
      // Allow seeding a new Coffre with amount = 0.
      // For all other expense types we keep the strict amount > 0 rule.
      const expenseTypeRaw = String(body.expense_type || body.expenseType || '').trim().toLowerCase();
      const isCofferSeed = expenseTypeRaw === 'coffer_seed';
      
      if (!Number.isFinite(amount) || (isCofferSeed ? amount < 0 : amount <= 0)) {
      return jsonResponse({ error: isCofferSeed ? "amount must be >= 0" : "amount must be > 0" }, 400);
      }

      // Operation:
      // - deposit   => classic (Caisse -> Coffre)
      // - versement => direct to Coffre (NO caisse deduction)
      const opRaw = String(body.operation || body.action || "deposit").trim().toLowerCase();
      const operation = opRaw === "versement" ? "versement" : "deposit";

      // Method normalization
      const rawMethod = String(body.method || body.payment_method || body.movement_method || "").trim().toLowerCase();
      const method = rawMethod === "cash" || rawMethod === "espece" || rawMethod === "espèce"
        ? "cash"
        : rawMethod === "check" || rawMethod === "cheque" || rawMethod === "chèque"
          ? "check"
          : rawMethod === "bank_transfer" || rawMethod === "transfer" || rawMethod === "virement"
            ? "bank_transfer"
            : null;

      if (!method) {
        return jsonResponse({ error: "Invalid method (expected: cash | check | bank_transfer)" }, 400);
      }

      // Versement: ONLY cash + bank_transfer (no checks)
      if (operation === "versement" && method === "check") {
        return jsonResponse({ error: "Invalid method for versement (expected: cash | bank_transfer)" }, 400);
      }

      const expenseType = method === "cash"
        ? "coffer_deposit_cash"
        : method === "check"
          ? "coffer_deposit_check"
          : "coffer_deposit_bank_transfer";

      const caisseOutExpenseType = method === "cash"
        ? "caisse_out_cash"
        : method === "check"
          ? "caisse_out_check"
          : "caisse_out_bank_transfer";

      // Store scope rules:
      // - Admin: for BOTH operations we default to their own user.store_id when store_id is not provided.
      // - Non-admin: must be tied to a store and is restricted to their own store
      const storeId = currentUser.role === "admin"
        ? (body.store_id
          ? String(body.store_id)
          : (currentUser.store_id ? String(currentUser.store_id) : null)
        )
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      if (!storeId) {
        return jsonResponse({ error: "store_id is required" }, 400);
      }

      // Some databases do not have expenses.notes (schema cache mismatch).
      // We keep a best-effort approach:
      // 1) try inserting with notes
      // 2) if schema cache complains, retry without notes
      const isSchemaCacheMissingColumn = (err: any, col: string) => {
        const msg = String(err?.message || "");
        return msg.includes(`Could not find the '${col}' column`) ||
          msg.includes(`Could not find the \"${col}\" column`) ||
          (msg.toLowerCase().includes("schema cache") && msg.toLowerCase().includes(col.toLowerCase()));
      };

      const title = String(body.reason || body.title || "").trim();
      const defaultReason = operation === "versement"
        ? `Versement coffre (${method})`
        : `Versement coffre (Caisse → Coffre) (${method})`;

      const insertRowBase: any = {
        store_id: storeId,
        coffer_id: cofferId,
        amount,
        expense_type: expenseType,
        // expenses.reason is NOT NULL in schema
        reason: title || defaultReason,
        created_by: currentUser.id,
      };

      const tryRowWithNotes: any = {
        ...insertRowBase,
        notes: body.notes || null,
      };

      let inserted: any = null;

      // First try including notes
      const firstTry = await supabase
        .from("expenses")
        .insert([tryRowWithNotes])
        .select()
        .maybeSingle();

      if (firstTry.error) {
        if (isSchemaCacheMissingColumn(firstTry.error, "notes")) {
          const retry = await supabase
            .from("expenses")
            .insert([insertRowBase])
            .select()
            .maybeSingle();

          if (retry.error) throw retry.error;
          inserted = retry.data;
        } else {
          throw firstTry.error;
        }
      } else {
        inserted = firstTry.data;
      }

      // Mirror ONLY for classic deposit (Caisse -> Coffre)
      if (operation === "deposit") {
        try {
          const caisseRowBase: any = {
            store_id: storeId,
            amount: -Math.abs(amount),
            expense_type: caisseOutExpenseType,
            reason: `Versement au coffre (${method}) → ${cofferId}`,
            created_by: currentUser.id,
          };

          const caisseRowWithNotes: any = {
            ...caisseRowBase,
            notes: body.notes || null,
          };

          const caisseFirstTry = await supabase
            .from("expenses")
            .insert([caisseRowWithNotes])
            .select()
            .maybeSingle();

          if (caisseFirstTry.error) {
            if (isSchemaCacheMissingColumn(caisseFirstTry.error, "notes")) {
              const caisseRetry = await supabase
                .from("expenses")
                .insert([caisseRowBase])
                .select()
                .maybeSingle();

              if (caisseRetry.error) throw caisseRetry.error;
            } else {
              throw caisseFirstTry.error;
            }
          }
        } catch (mirrorErr: any) {
          console.error("Failed to mirror coffer deposit into caisse outflow:", mirrorErr);
          // Do not fail the main coffer deposit if mirroring fails.
        }
      }

      return jsonResponse({ success: true, movement: inserted });
    } catch (error: any) {
      console.error("Error creating coffer movement:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/product-templates" && method === "POST") {
  try {
  const body = await req.json().catch(() => ({}));
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  const role = String((currentUser as any)?.role || '').toLowerCase();
  
  // Resolve store_id for correct visibility in GET /product-templates (store-scoped for non-admin)
  const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
  const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
  const storeId = (role === 'admin')
  ? (body.store_id ? String(body.store_id).trim() : myStoreId)
  : myStoreId;
  
  if (role !== 'admin' && !storeId) {
  return jsonResponse({ error: 'User must have a store assigned' }, 400);
  }
  
  const { data, error } = await supabase
  .from("product_templates")
  .insert([
  {
  store_id: storeId || null,
  name: body.name,
  category: body.category,
  photo_url: body.photo_url || null,
  description: body.description || null,
  reference: body.reference || null,
  reference_number: body.reference_number || null,
  date_fin: body.date_fin || null,
  fourchette_min: body.fourchette_min ? parseFloat(body.fourchette_min) : null,
  fourchette_max: body.fourchette_max ? parseFloat(body.fourchette_max) : null,
  created_by: currentUser?.id || null,
  },
  ])
  .select();
  
  if (error) throw error;
  return jsonResponse({ success: true, template: data?.[0] });
  } catch (error: any) {
  console.error("Error creating product template:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path.startsWith("/product-templates/") && method === "PUT") {
    try {
      const templateId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("product_templates")
        .update({
          name: body.name,
          category: body.category,
          photo_url: body.photo_url || null,
          description: body.description || null,
          reference: body.reference || null,
          reference_number: body.reference_number || null,
          date_fin: body.date_fin || null,
          fourchette_min: body.fourchette_min ? parseFloat(body.fourchette_min) : null,
          fourchette_max: body.fourchette_max ? parseFloat(body.fourchette_max) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, template: data?.[0] });
    } catch (error: any) {
      console.error("Error updating product template:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/product-templates/") && method === "DELETE") {
    try {
      const templateId = path.split("/")[2];
      const { error } = await supabase
        .from("product_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting product template:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Coffer Totals (computed, source-of-truth) =====
  // GET /coffer-totals?coffer_id=main&store_id=...
  // IMPORTANT BUSINESS RULE:
  // - Coffre is GLOBAL across all magasins.
  // - Therefore we NEVER scope totals by store_id.
  // - UI may still send store_id (admin acting-as-magasin), but it must NOT affect the displayed Coffre balance.
  if (path === "/coffer-totals" && method === "GET") {
    try {
      const url = new URL(req.url);
      const cofferId = String(url.searchParams.get("coffer_id") || "main").trim() || "main";

      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Always return GLOBAL totals (ALL magasins aggregate)
      // Include movements saved with store_id NULL (admin/global rows).
      const { data, error } = await supabase.rpc("get_coffer_totals_admin_all", {
        p_coffer_id: cofferId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;

      const totals = row ? {
        ...row,
        store_id: null,
        coffer_id: cofferId,
        montant_non_transferes: Number((row as any).montant_non_transferes ?? 0) || 0,
        montant_transferes: Number((row as any).montant_transferes ?? 0) || 0,
        montant_espece: Number((row as any).montant_espece ?? 0) || 0,
        montant_cheque: Number((row as any).montant_cheque ?? 0) || 0,
        montant_cheques_transferred: Number((row as any).montant_cheques_transferred ?? 0) || 0,
        montant_mouvements_total: Number((row as any).montant_mouvements_total ?? 0) || 0,
        montant_virement: Number((row as any).montant_virement ?? 0) || 0,
        montant_cheques_utilises: Number((row as any).montant_cheques_utilises ?? 0) || 0,
      } : {
        store_id: null,
        coffer_id: cofferId,
        montant_non_transferes: 0,
        montant_transferes: 0,
        montant_espece: 0,
        montant_cheque: 0,
        montant_cheques_transferred: 0,
        montant_mouvements_total: 0,
        montant_virement: 0,
        montant_cheques_utilises: 0,
      };

      return jsonResponse({ totals });
    } catch (error: any) {
      console.error("Error fetching coffer totals:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Check Safe Usages (per-check stats) =====
  // GET /check-safe-usages?coffer_id=...&store_id=...
  // Returns per check_safe row:
  // - total_used
  // - remaining
  // - usage_percentage
  // Used by Coffre-fort UI to display: Disponible / Partiellement / Utilisé.
  if (path === "/check-safe-usages" && method === "GET") {
  try {
  const url = new URL(req.url);
  const requestedStoreId = url.searchParams.get("store_id");
  const cofferId = String(url.searchParams.get("coffer_id") || "main").trim() || "main";
  
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  // Determine store scope
  // - admin: requestedStoreId or NULL (all stores)
  // - non-admin: forced to their own store_id
  const storeScopeId: string | null = currentUser.role === "admin"
  ? (requestedStoreId ? String(requestedStoreId) : null)
  : (currentUser.store_id ? String(currentUser.store_id) : null);
  
  if (currentUser.role !== "admin" && !storeScopeId) {
  return jsonResponse({ check_safe_usages: [] });
  }
  
  // Load check_safe rows in this coffer (+ optional store scope)
  let checksQ = supabase
  .from("check_safe")
  .select("id, amount, status, store_id, coffer_id, check_number, created_at")
  .eq("coffer_id", cofferId)
  .order("created_at", { ascending: false });
  
  if (storeScopeId) {
  checksQ = checksQ.eq("store_id", storeScopeId);
  }
  
  const { data: checksRows, error: checksErr } = await checksQ;
  if (checksErr) throw checksErr;
  
  const ids = (checksRows || []).map((r: any) => String(r.id));
  if (ids.length === 0) {
  return jsonResponse({ check_safe_usages: [] });
  }
  
  // Load usages for these checks
  let usageQ = supabase
  .from("check_safe_usages")
  .select("check_safe_id, amount_used")
  .in("check_safe_id", ids);
  
  // coffer_id/store_id exist on usage rows; but we keep it resilient.
  const { data: usageRows, error: usageErr } = await usageQ;
  if (usageErr) throw usageErr;
  
  const usedById = new Map<string, number>();
  (usageRows || []).forEach((u: any) => {
  const id = String(u.check_safe_id);
  const a = Number(u.amount_used || 0) || 0;
  usedById.set(id, (usedById.get(id) || 0) + a);
  });
  
  const out = (checksRows || []).map((c: any) => {
  const amount = Number(c.amount || 0) || 0;
  const total_used = usedById.get(String(c.id)) || 0;
  const remaining = Math.max(0, amount - total_used);
  const usage_percentage = amount > 0 ? Math.min(100, (total_used / amount) * 100) : 0;
  return {
  check_safe_id: c.id,
  check_number: c.check_number,
  coffer_id: c.coffer_id,
  store_id: c.store_id,
  check_amount: amount,
  total_used,
  remaining,
  usage_percentage,
  status: c.status,
  };
  });
  
  return jsonResponse({ check_safe_usages: out });
  } catch (error: any) {
  console.error("Error fetching check safe usages:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }
  
  // POST /check-safe-usages
  // Used by bulk "Transférer le paiement" to mark cheque(s) as used so UI Type changes to "Utilisé".
  // Body: { check_safe_id, amount_used, usage_type?, notes?, ref_table?, ref_id? }
  if (path === "/check-safe-usages" && method === "POST") {
  try {
  const body = await req.json().catch(() => ({}));
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  const role = String(currentUser.role || "").toLowerCase();
  if (role !== "admin" && role !== "manager" && role !== "magasin_manager") {
  return jsonResponse({ error: "Unauthorized" }, 403);
  }
  
  const checkSafeId = String(body.check_safe_id || "").trim();
  const amountUsed = Number(body.amount_used);
  const usageType = String(body.usage_type || "payment_transfer").trim() || "payment_transfer";
  const notes = body.notes !== undefined && body.notes !== null ? String(body.notes) : null;
  const refTable = body.ref_table ? String(body.ref_table) : null;
  const refId = body.ref_id ? String(body.ref_id) : null;
  
  if (!checkSafeId) return jsonResponse({ error: "check_safe_id is required" }, 400);
  if (!Number.isFinite(amountUsed) || amountUsed <= 0) {
  return jsonResponse({ error: "amount_used must be > 0" }, 400);
  }
  
  // Load check_safe row to enforce store scope and get store/coffer ids
  const { data: checkRow, error: chkErr } = await supabase
  .from("check_safe")
  .select("id, amount, status, store_id, coffer_id")
  .eq("id", checkSafeId)
  .maybeSingle();
  
  if (chkErr) throw chkErr;
  if (!checkRow) return jsonResponse({ error: "check_safe not found" }, 404);
  
  // Non-admin: can only create usages for their own store
  if (role !== "admin") {
  const myStoreId = currentUser.store_id ? String(currentUser.store_id) : null;
  if (!myStoreId) return jsonResponse({ error: "User must have a store assigned" }, 400);
  if (String(checkRow.store_id || "") !== myStoreId) {
  return jsonResponse({ error: "Unauthorized" }, 403);
  }
  }
  
  const safeTotal = Number((checkRow as any).amount || 0) || 0;
  if (amountUsed > safeTotal + 0.000001) {
  return jsonResponse({ error: `amount_used cannot exceed check amount (${formatMoney(safeTotal)} MAD)` }, 400);
  }
  
  const insertRow: any = {
  check_safe_id: checkSafeId,
  store_id: (checkRow as any).store_id || null,
  coffer_id: String((checkRow as any).coffer_id || body.coffer_id || "main"),
  amount_used: amountUsed,
  usage_type: usageType,
  ref_table: refTable,
  ref_id: refId,
  created_by: currentUser.id,
  notes,
  };
  
  const { data: inserted, error: insErr } = await supabase
  .from("check_safe_usages")
  .insert([insertRow])
  .select()
  .maybeSingle();
  
  if (insErr) throw insErr;
  
  return jsonResponse({ success: true, usage: inserted });
  } catch (error: any) {
  console.error("Error creating check safe usage:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  // ===== Supplier Advances =====
  // Created from Coffer page. Stored separately from supplier payments (which are actual settlements).
  // This is for pre-orders / advance payments.
  if (path === "/supplier-advances" && method === "GET") {
    try {
      const url = new URL(req.url);
      const supplierId = url.searchParams.get("supplier_id");
      const requestedStoreId = url.searchParams.get("store_id");

      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Determine effective store scope.
      // IMPORTANT FIX:
      // - Admin should be able to see advances for the selected magasin.
      // - If admin didn't pass store_id, fall back to their own users.store_id (matches UI default selection).
      const effectiveStoreId = currentUser.role === "admin"
        ? (requestedStoreId || (currentUser.store_id ? String(currentUser.store_id) : null))
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      // If admin has no store_id and didn't select one, return empty (avoid cross-store leakage)
      if (currentUser.role === "admin" && !effectiveStoreId) {
        return jsonResponse({ advances: [] });
      }

      // Base query
      let q = supabase
        .from("supplier_advances")
        .select("*")
        .order("created_at", { ascending: false });

      if (supplierId) q = q.eq("supplier_id", supplierId);
      if (effectiveStoreId) q = q.eq("store_id", effectiveStoreId);

      const { data, error } = await q;
      if (error) throw error;

      return jsonResponse({ advances: data || [] });
    } catch (error: any) {
      console.error("Error fetching supplier advances:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/supplier-advances" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const supplierId = String(body.supplier_id || "").trim();
      if (!supplierId) return jsonResponse({ error: "supplier_id is required" }, 400);

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: "amount must be > 0" }, 400);
      }

      const paymentMethod = String(body.payment_method || "").trim();
      if (!["cash", "check", "bank_transfer"].includes(paymentMethod)) {
        return jsonResponse({ error: "Invalid payment_method" }, 400);
      }

      const cofferId = String(body.coffer_id || "").trim();
      if (!cofferId) return jsonResponse({ error: "coffer_id is required" }, 400);

      // Load supplier for authorization / store resolution
      const { data: supplier, error: supplierErr } = await supabase
        .from("suppliers")
        .select("id, store_id")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplierErr) throw supplierErr;
      if (!supplier) return jsonResponse({ error: "Supplier not found" }, 404);

      const supplierStoreId = supplier.store_id ? String(supplier.store_id) : null;

      // Enforce role rules:
      // - Admin: must select magasin (store_id) and can only create advances for suppliers of that magasin
      // - Non-admin: can only create advances for suppliers in their store
      let effectiveStoreId: string | null = null;
      if (currentUser.role === "admin") {
        const reqStoreId = body.store_id ? String(body.store_id) : null;
        if (!reqStoreId) {
          return jsonResponse({ error: "store_id is required for admin" }, 400);
        }
        effectiveStoreId = reqStoreId;
      } else {
        if (!currentUser.store_id) return jsonResponse({ error: "User must have a store assigned" }, 400);
        effectiveStoreId = String(currentUser.store_id);
      }

      if (supplierStoreId && effectiveStoreId && supplierStoreId !== effectiveStoreId) {
        return jsonResponse({ error: "Supplier does not belong to selected store" }, 403);
      }

      // ---- Enforce coffer balance (prevent giving more than available) ----
      // IMPORTANT: In this app, coffer money can come from:
      // 1) explicit deposits recorded in `expenses` with coffer_id + expense_type coffer_deposit_*
      // 2) checks transferred into the safe (`check_safe`) which are shown as "Montant (Transférés)" in the UI
      //
      // We therefore compute available as:
      //   (deposits into coffer) + (checks in safe) - (supplier advances)
      //
      // NOTE: This is a best-effort guard (logical coffer concept). For strict concurrency guarantees,
      // move to a SQL function + transaction locks.
      const normalizeExpenseType = (t: any) => String(t || "").trim().toLowerCase();
      const isCofferDeposit = (t: string) =>
        t.includes("coffer_deposit_cash") ||
        t.includes("coffer_deposit_check") ||
        t.includes("coffer_deposit_bank_transfer") ||
        t.includes("coffre_depot") ||
        t.includes("coffre_deposit");

      // Sum deposits into this coffer for this store
      const { data: cofferExpenses, error: cofferExpensesErr } = await supabase
        .from("expenses")
        .select("amount, expense_type")
        .eq("coffer_id", cofferId)
        // Some old rows may have store_id NULL; include them to match what the UI shows.
        .or(`store_id.eq.${effectiveStoreId},store_id.is.null`);

      if (cofferExpensesErr) throw cofferExpensesErr;

      const cofferDepositsTotal = (cofferExpenses || [])
        .filter((e: any) => isCofferDeposit(normalizeExpenseType(e.expense_type)))
        .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);

      // Sum checks already in the safe.
      // IMPORTANT: your DB exposes the accurate totals through the `check_safe_stats` view/table,
      // so we use it instead of summing `check_safe` rows (which may have store_id/coffer_id inconsistencies).
      //
      // check_safe_stats appears to have a single aggregated row with `total_amount`.
      // We treat that as the total money currently in the safe.
      const { data: safeStats, error: safeStatsErr } = await supabase
        .from("check_safe_stats")
        .select("total_amount")
        .limit(1);

      if (safeStatsErr) throw safeStatsErr;

      const safeChecksTotal = Number((safeStats || [])?.[0]?.total_amount ?? 0) || 0;

      // Sum advances already paid out from this coffer for this store
      const { data: existingAdvances, error: advancesErr } = await supabase
        .from("supplier_advances")
        .select("amount")
        .eq("coffer_id", cofferId)
        .eq("store_id", effectiveStoreId);

      if (advancesErr) throw advancesErr;

      const advancesTotal = (existingAdvances || [])
        .reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);

      // ---- Method-specific balance check (cash/check/bank_transfer) ----
      // The user requirement:
      // - If advance is paid by CHECK: ensure the selected check has enough remaining balance.
      // - If advance is paid by CASH: ensure the coffer has enough CASH balance.
      // - If advance is paid by BANK TRANSFER: ensure the coffer has enough BANK TRANSFER balance.
      //
      // Notes:
      // - For check advances, frontend should provide `check_safe_id` OR a check identifier.
      //   We support `check_safe_id` or `check_reference`.
      // - For cash/bank_transfer, we compute available from coffer deposits (expenses) minus
      //   previous supplier advances for the same method.

      // Use the SAME computed totals as the Coffre header (DB source-of-truth)
      // to validate method balances.
      // IMPORTANT BUSINESS RULE:
      // - Coffre is GLOBAL across all magasins, so balances must NOT be store-scoped.
      // - We therefore use the ALL-stores RPC (same source used by GET /coffer-totals).
      const { data: totalsAll, error: totalsErr } = await supabase
        .rpc("get_coffer_totals_admin_all", {
          p_coffer_id: cofferId,
        });

      if (totalsErr) throw totalsErr;

      const tRow: any = Array.isArray(totalsAll) ? totalsAll[0] : totalsAll;

      const availableCash = Number(tRow?.montant_espece ?? 0) || 0;
      const availableCheck = Number(tRow?.montant_cheque ?? 0) || 0;
      const availableTransfer = Number(tRow?.montant_virement ?? 0) || 0;

      // If the advance is paid by check, validate against the selected check's remaining balance.
      // Also guard against the coffer check bucket (Montant (Chèque)).
      if (paymentMethod === "check") {
        // Be tolerant with payload naming (frontend variants)
        const checkSafeId = String(body.check_safe_id || body.selected_check_safe_id || body.check_id || "").trim() || null;
        const checkRef = String(body.check_reference || body.check_number || body.reference || "").trim() || null;

        let checkRow: any = null;

        // 1) Prefer explicit check_safe_id
        if (checkSafeId) {
          const { data: row, error: chkErr } = await supabase
            .from("check_safe")
            .select("id, amount, status, store_id, coffer_id")
            .eq("id", checkSafeId)
            .maybeSingle();
          if (chkErr) throw chkErr;
          checkRow = row;
        }

        // 2) Fallback: try find by check_number
        if (!checkRow && checkRef) {
          const { data: row, error: chkErr } = await supabase
            .from("check_safe")
            .select("id, amount, status, store_id, coffer_id")
            .eq("check_number", checkRef)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (chkErr) throw chkErr;
          checkRow = row;
        }

        // 3) Last fallback: if nothing provided, pick the latest available check in this coffer.
        // This avoids blocking the flow when frontend doesn't send check identifiers.
        if (!checkRow) {
          const { data: row, error: chkErr } = await supabase
            .from("check_safe")
            .select("id, amount, status, store_id, coffer_id")
            .eq("coffer_id", cofferId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (chkErr) throw chkErr;
          checkRow = row;
        }

        if (!checkRow) {
          return jsonResponse({ error: "No check available in safe for this coffer" }, 400);
        }

        const status = String(checkRow.status || "").toLowerCase();
        if (status === "used" || status === "archived") {
          return jsonResponse({ error: "Selected check is not available" }, 400);
        }

        // Compute remaining in safe using DB ledger (check_safe_usages)
        const safeTotal = Number(checkRow.amount || 0) || 0;
        const { data: usageRows, error: usageErr } = await supabase
          .from("check_safe_usages")
          .select("amount_used")
          .eq("check_safe_id", checkRow.id);

        if (usageErr) throw usageErr;

        const usedTotal = (usageRows || []).reduce((sum: number, r: any) => sum + (Number(r.amount_used) || 0), 0);
        const remainingInSafe = Math.max(0, safeTotal - usedTotal);

        if (amount > remainingInSafe + 0.000001) {
          return jsonResponse({
            error: `Insufficient check remaining in safe. Available: ${formatMoney(remainingInSafe)} MAD`,
            available: remainingInSafe,
          }, 400);
        }

        // Attach resolved check for usage recording after inserting the advance
        (body as any).__resolved_check_safe = {
          id: checkRow.id,
          store_id: checkRow.store_id || effectiveStoreId,
          coffer_id: checkRow.coffer_id || cofferId,
        };
      } else {
        // Cash / bank_transfer balance in coffer (from computed totals)
        const availableForMethod = paymentMethod === "cash"
          ? availableCash
          : paymentMethod === "bank_transfer"
            ? availableTransfer
            : 0;

        if (amount > availableForMethod + 0.000001) {
          return jsonResponse({
            error: `Insufficient coffer balance for ${paymentMethod}. Available: ${formatMoney(Math.max(0, availableForMethod))} MAD`,
            available: Math.max(0, availableForMethod),
            debug: {
              method: paymentMethod,
              available_cash: availableCash,
              available_check: availableCheck,
              available_bank_transfer: availableTransfer,
              coffer_id: cofferId,
              store_id: effectiveStoreId,
            },
          }, 400);
        }
      }

      if (paymentMethod === "check") {
        if (amount > availableCheck + 0.000001) {
          return jsonResponse({
            error: `Insufficient coffer balance for check. Available: ${formatMoney(Math.max(0, availableCheck))} MAD`,
            available: Math.max(0, availableCheck),
            debug: {
              method: paymentMethod,
              available_check: availableCheck,
              coffer_id: cofferId,
              store_id: effectiveStoreId,
            },
          }, 400);
        }
      }

      // Keep old totals for debugging/visibility (not used for validation anymore)
      const available = cofferDepositsTotal + safeChecksTotal - advancesTotal;

      // Insert advance
      const insertRow: any = {
        supplier_id: supplierId,
        store_id: effectiveStoreId,
        coffer_id: cofferId,
        coffer_name: body.coffer_name || null,
        amount,
        currency: body.currency || 'MAD',
        payment_method: paymentMethod,
        check_reference: body.check_reference || null,
        bank_transfer_reference: body.bank_transfer_reference || null,
        bank_transfer_date: body.bank_transfer_date || null,
        notes: body.notes || null,
        created_by: currentUser.id,
        created_by_email: currentUser.email,
        created_by_role: currentUser.role,
      };

      const { data, error } = await supabase
        .from("supplier_advances")
        .insert([insertRow])
        .select()
        .single();

      if (error) throw error;

      // ===== Update supplier balance (solde restant) =====
      // IMPORTANT FIX (root cause):
      // `suppliers.balance` is treated by the UI as "Total Facturé".
      // A supplier advance is a PAYMENT movement and must NOT modify "Total Facturé".
      // The supplier remaining must be computed from:
      //   Total Facturé (suppliers.balance) - Total Payé (payments + supplier_advances) - Remise.
      // So we intentionally do NOT update suppliers.balance here.

      // If this advance is paid by check, record usage in the safe ledger
      if (paymentMethod === "check") {
        const resolved = (body as any).__resolved_check_safe;
        if (resolved?.id) {
          const usageRow: any = {
            check_safe_id: resolved.id,
            store_id: resolved.store_id || effectiveStoreId,
            coffer_id: String(resolved.coffer_id || cofferId || 'main'),
            amount_used: amount,
            usage_type: 'supplier_advance',
            ref_table: 'supplier_advances',
            ref_id: data?.id || null,
            created_by: currentUser.id,
            notes: `Avance fournisseur (${supplierId})`,
          };

          const { error: usageInsertErr } = await supabase
            .from('check_safe_usages')
            .insert([usageRow]);

          if (usageInsertErr) {
            console.error('Failed to record check_safe usage for supplier advance:', usageInsertErr);
            // Do not fail the whole operation if logging fails, but totals will be off until fixed.
          }
        }
      }

      // Create a Coffre movement in `expenses` for cash / bank_transfer.
      // IMPORTANT: your `expenses` table DOES NOT have `created_by_email` in some DBs,
      // so NEVER send it here (prevents: "Could not find the 'created_by_email' column...").
      // We also tolerate missing `notes` column by retrying without it.
      if (paymentMethod === "cash" || paymentMethod === "bank_transfer") {
      const supplierName = String((supplier as any)?.name || '').trim() || supplierId;
      const movementMarker = `supplier_advance_id=${String(data?.id || '')}`;
      
      const expenseBase: any = {
      // Keep store_id to match existing Coffre totals views (they filter by store_id)
      store_id: effectiveStoreId,
      coffer_id: cofferId,
      amount: -Math.abs(amount),
      expense_type: paymentMethod === 'cash' ? 'coffer_out_cash' : 'coffer_out_bank_transfer',
      reason: `Avance Fournisseur • ${supplierName}`,
      created_by: currentUser.id,
      };
      
      const expenseWithNotes: any = { ...expenseBase, notes: movementMarker };
      
      const ins1 = await supabase.from('expenses').insert([expenseWithNotes]);
      if (ins1.error) {
      // Retry without notes (older schema)
      const msg = String(ins1.error?.message || '');
      const missingNotes = msg.toLowerCase().includes('column notes') && msg.toLowerCase().includes('does not exist');
      const schemaCacheNotes = msg.toLowerCase().includes("could not find the 'notes' column");
      if (missingNotes || schemaCacheNotes) {
      const ins2 = await supabase.from('expenses').insert([expenseBase]);
      if (ins2.error) throw ins2.error;
      } else {
      throw ins1.error;
      }
      }
      }
      
      return jsonResponse({ success: true, advance: data });
      } catch (error: any) {
      console.error("Error creating supplier advance:", error);
      return jsonResponse({ error: error.message }, 500);
      }
      }

  // ===== Discounts =====
  // GET  /discounts
  // POST /discounts
  // NOTE: handled later under "// DISCOUNTS ENDPOINTS".
  // Do not add another /discounts POST handler here.

  // ===== Store Global Payments (Paiement Global Magasin) =====
  // Similar to client_global_payments, but for stores.
  //
  // GET  /store-global-payments?store_id=...
  // POST /store-global-payments
  // PUT  /store-global-payments/:id
  if (path === "/store-global-payments" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  // Per-store caisse: EVERYONE (admin included) is store scoped.
  // Admin can override by passing ?store_id=... explicitly.
  const url = new URL(req.url);
  const requestedStoreId = url.searchParams.get("store_id");
  
  const role = String(currentUser.role || "").toLowerCase();
  const effectiveStoreId = (role === "admin")
  ? (requestedStoreId || (currentUser.store_id ? String(currentUser.store_id) : null))
  : (currentUser.store_id ? String(currentUser.store_id) : null);
  
  if (!effectiveStoreId) {
  return jsonResponse({ store_global_payments: [] });
  }
  
  let query = supabase
  .from("store_global_payments")
  .select("*")
  .order("payment_date", { ascending: false })
  .order("created_at", { ascending: false });
  
  // IMPORTANT: store_global_payments is caisse OUT for the paying store.
  // Always filter by paid_by_store_id to prevent any cross-store visibility.
  query = query.eq("paid_by_store_id", effectiveStoreId);

      const { data, error } = await query;
      if (error) throw error;

      const payments = data || [];

      // Enrich with store names + actor emails
      const storeIds = Array.from(
        new Set(
          payments
            .flatMap((p: any) => [p?.store_id, p?.paid_by_store_id, p?.acted_as_store_id])
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      const userIds = Array.from(
        new Set(
          payments
            .map((p: any) => p?.created_by)
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      const storeNameById = new Map<string, string>();
      if (storeIds.length > 0) {
        const { data: storesRows, error: sErr } = await supabase
          .from("stores")
          .select("id, name")
          .in("id", storeIds);

        if (sErr) {
          console.warn("/store-global-payments GET could not fetch stores:", sErr.message);
        } else {
          (storesRows || []).forEach((s: any) => {
            if (s?.id) storeNameById.set(String(s.id), String(s.name || ""));
          });
        }
      }

      const emailByUserId = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: usersRows, error: uErr } = await supabase
          .from("users")
          .select("id, email")
          .in("id", userIds);

        if (uErr) {
          console.warn("/store-global-payments GET could not fetch users:", uErr.message);
        } else {
          (usersRows || []).forEach((u: any) => {
            if (u?.id) emailByUserId.set(String(u.id), String(u.email || ""));
          });
        }
      }

      const enriched = payments.map((p: any) => {
        const paidByName = p.paid_by_store_name || (p.paid_by_store_id ? storeNameById.get(String(p.paid_by_store_id)) : null);
        return {
          ...p,
          store_name: p.store_id ? (storeNameById.get(String(p.store_id)) || null) : null,
          paid_by_store_name: paidByName || null,
          acted_as_store_name: p.acted_as_store_id ? (storeNameById.get(String(p.acted_as_store_id)) || null) : null,
          created_by_email: p.created_by_email || (p.created_by ? (emailByUserId.get(String(p.created_by)) || null) : null),
        };
      });

      return jsonResponse({ store_global_payments: enriched });
    } catch (error: any) {
      console.error("Error fetching store global payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/store-global-payments" && method === "POST") {
    try {
      // Paiement Global Magasin (ESPÈCE):
      // - MUST deduct from selected magasin caisse
      // - MUST be visible in magasin caisse movements
      // - MUST credit the selected coffer (admin side)
      // - MUST reduce debt totals immediately (handled by /magasin-debts logic)
      // - If overpaid, debt becomes negative (credit)
      //
      // Paiement Global Magasin (CHÈQUE): handled by the confirmation PUT flow.
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const storeId = String(body.store_id || "").trim();
      if (!storeId) return jsonResponse({ error: "store_id is required" }, 400);

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return jsonResponse({ error: "amount must be >= 0" }, 400);
      }

      const paymentMethod = String(body.payment_method || "").trim();
      if (!["cash", "check", "bank_transfer", "other"].includes(paymentMethod)) {
        return jsonResponse({ error: "Invalid payment_method" }, 400);
      }
      
      // For ESPÈCE (cash) payments:
      // - Clients Magasins flow: require coffer_id (admin chooses destination coffer)
      // - Fournisseur Admin flow: coffer selection must be ADMIN-only, so managers/users may omit coffer_id.
      //   In that case, we create a pending transfer with a default target (main) and admin can confirm.
      //
      // Detect Fournisseur Admin via notes marker OR stable UI label.
      const cofferId = String(body.coffer_id || '').trim();
      const notesRawForFlow = String(body.notes || '').trim();
      const isFournisseurAdminFlow =
        notesRawForFlow.includes('fournisseur_admin_id=') ||
        notesRawForFlow.toLowerCase().includes('paiement global (fournisseur admin)');

      if (paymentMethod === 'cash' && !isFournisseurAdminFlow && !cofferId) {
        return jsonResponse({
          error: "coffer_id is required for cash payment",
          hint: "Send coffer_id in POST body when payment_method=cash",
          received: {
            store_id: storeId,
            payment_method: paymentMethod,
            coffer_id: cofferId || null,
            amount,
          },
        }, 400);
      }
      
      // Helper: schema cache can be stale; some projects deploy with/without "notes" column.
      // When insert fails with "column notes does not exist", retry without notes.
      const isSchemaCacheMissingColumn = (err: any, col: string) => {
      const msg = String(err?.message || err || "");
      return msg.toLowerCase().includes(`column ${col}`.toLowerCase()) && msg.toLowerCase().includes('does not exist');
      };
      
      let paidByStoreId: string | null = null;
      let actedAsStoreId: string | null = null;

      if (currentUser.role === "admin") {
      // Admin should be able to record a payment on behalf of ANY magasin.
      // The caisse to deduct MUST be the magasin selected in the UI.
      // Support both payload shapes:
      // - old: store_id (single selector)
      // - new: paid_by_store_id
      actedAsStoreId = body.store_id ? String(body.store_id) : null;
      paidByStoreId = (body.paid_by_store_id ? String(body.paid_by_store_id) : null) || actedAsStoreId;
      
      if (!paidByStoreId) {
      return jsonResponse({ error: "paid_by_store_id is required" }, 400);
      }
      } else {
        if (!currentUser.store_id) return jsonResponse({ error: "User must have a store assigned" }, 400);
        paidByStoreId = String(currentUser.store_id);
        actedAsStoreId = null;
      }

      // If payment is by cheque, persist the link to the actual cheque row (check_inventory.id).
      // This prevents duplicates and allows the PUT confirmation flow to update/move the cheque correctly.
      const checkInventoryIdsRaw =
      (body as any).check_inventory_ids || (body as any).check_ids || (body as any).selected_check_inventory_ids || null;
      
      const parsedCheckInventoryIds = Array.isArray(checkInventoryIdsRaw)
      ? (checkInventoryIdsRaw as any[]).map((v) => String(v || '').trim()).filter(Boolean)
      : (typeof checkInventoryIdsRaw === 'string'
      ? String(checkInventoryIdsRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      : []);
      
      const checkInventoryId = String(
      body.check_inventory_id || body.check_id || body.selected_check_inventory_id || ''
      ).trim() || (parsedCheckInventoryIds.length > 0 ? parsedCheckInventoryIds[0] : null);
      
      // Backward compatibility: also store a marker in notes so confirmation can recover it
      // even if some environments miss the column.
      const baseNotes = String(body.notes || '').trim();
      const marker = parsedCheckInventoryIds.length > 0
      ? `check_inventory_ids=${parsedCheckInventoryIds.join(',')}`
      : (checkInventoryId ? `check_inventory_id=${checkInventoryId}` : '');
      const notesWithCheckMarker = marker
      ? (baseNotes.includes('check_inventory_id=') || baseNotes.includes('check_inventory_ids=')
      ? baseNotes
      : `${baseNotes}${baseNotes ? ' | ' : ''}${marker}`)
      : (baseNotes || null);
      
      const insertRow: any = {
      store_id: storeId,
      amount,
      payment_method: paymentMethod,
      payment_date: body.payment_date || new Date().toISOString(),
      reference_number: body.reference_number || null,
      notes: notesWithCheckMarker,
      
      paid_by_store_id: paidByStoreId,
      paid_by_store_name: body.paid_by_store_name || null,
      
      created_by: currentUser.id,
      created_by_email: currentUser.email,
      
      is_admin_payment: currentUser.role === "admin",
      acted_as_store_id: currentUser.role === "admin" ? actedAsStoreId : null,
      
      // Added by migration 123_add_check_inventory_id_to_store_global_payments.sql
      check_inventory_id: checkInventoryId,
      };

      const { data, error } = await supabase
        .from("store_global_payments")
        .insert([insertRow])
        .select()
        .single();

      if (error) throw error;

      // NOTE: Removed admin caisse IN mirror.
      // For Paiement Global Magasin we only:
      // - deduct from the selected magasin caisse (paid_by_store_id)
      // - credit the selected coffer (coffer_id)
      // Admin caisse must NOT be affected.
      
      // ===== Option A: cash/bank_transfer are PENDING until admin confirms into a selected coffer =====
      // For Clients Magasins (not Fournisseur Admin):
      // - create a pending_coffer_transfers row (status=pending)
      // - immediately deduct from the paying store caisse (caisse_out_*)
      // - DO NOT credit the coffer until admin confirms (confirm endpoint will create coffer_deposit_*)
      // This prevents the UI from showing "confirmed" before admin action.

      const createPendingTransferAndCaisseOut = async (method: 'cash' | 'bank_transfer') => {
        const ref = String(body.reference_number || '').trim();

        // Resolve human store name for audit
        const stNameRes = await supabase
          .from('stores')
          .select('id, name')
          .eq('id', paidByStoreId)
          .maybeSingle();

        const payerStoreName = (stNameRes.data as any)?.name || String(paidByStoreId || storeId);
        const marker2 = `store_global_payment_id=${String(data?.id || '')}`;

        // Notes marker is the linkage point for confirmations and for list UIs.
        const transferNotes = [
          marker2,
          `payment_method=${method}`,
          `paid_by_store_id=${String(paidByStoreId)}`,
          `payer_store_name=${payerStoreName}`,
          ref ? `reference_number=${ref}` : null,
          // help debugging/trace
          isFournisseurAdminFlow ? 'origin=fournisseur_admin' : 'origin=clients_magasins',
        ].filter(Boolean).join(' | ');

        // 1) Create pending transfer (admin will confirm into coffer later)
        // - Clients Magasins: target_coffer_id is known (selected at creation time)
        // - Fournisseur Admin: manager MUST NOT pick a coffer, so leave it NULL (admin selects at confirmation)
        const resolvedTargetCofferId = isFournisseurAdminFlow
          ? null
          : (String(cofferId || '').trim() || null);

        const { data: pending, error: pErr } = await supabase
          .from('pending_coffer_transfers')
          .insert([
            {
              store_id: String(paidByStoreId),
              target_coffer_id: resolvedTargetCofferId,
              amount: Math.abs(amount),
              reference_number: ref || null,
              notes: transferNotes,
              status: 'pending',
              created_by: currentUser.id,
            },
          ])
          .select('*')
          .maybeSingle();

        if (pErr) throw pErr;

        // 2) Magasin caisse OUT now (money leaves caisse immediately)
        const caisseOutType = method === 'cash' ? 'caisse_out_cash' : 'caisse_out_bank_transfer';
        const caisseOutBase: any = {
          store_id: paidByStoreId,
          amount: -Math.abs(amount),
          expense_type: caisseOutType,
          reason: isFournisseurAdminFlow
            ? `Paiement Global (Fournisseur Admin) (${method === 'cash' ? 'espèce' : 'virement'}) → En attente confirmation admin${ref ? ` • Ref: ${ref}` : ''}`
            : `Paiement Global Magasin (${method === 'cash' ? 'espèce' : 'virement'}) → En attente Coffre ${cofferId}${ref ? ` • Ref: ${ref}` : ''}`,
          created_by: currentUser.id,
        };

        const caisseOutWithNotes: any = { ...caisseOutBase, notes: marker2 };
        const caRes = await supabase.from('expenses').insert([caisseOutWithNotes]);
        if (caRes.error) {
          if (isSchemaCacheMissingColumn(caRes.error, 'notes')) {
            const caRetry = await supabase.from('expenses').insert([caisseOutBase]);
            if (caRetry.error) throw caRetry.error;
          } else {
            throw caRes.error;
          }
        }

        return pending;
      };

      // Clients Magasins pending flows:
      // - cash: pending transfer + caisse out
      // - bank_transfer: pending transfer + caisse out
      // - cheque remains confirmed via PUT flow
      if (amount > 0 && (paymentMethod === 'cash' || paymentMethod === 'bank_transfer')) {
        try {
          await createPendingTransferAndCaisseOut(paymentMethod as any);
        } catch (pendingErr: any) {
          console.error('[store-global-payments] Failed to create pending transfer / caisse out:', pendingErr);
          return jsonResponse({ error: `Pending transfer failed: ${pendingErr.message || pendingErr}` }, 500);
        }
      }
      
      return jsonResponse({ success: true, store_global_payment: data });
    } catch (error: any) {
      console.error("Error creating store global payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/store-global-payments/") && method === "PUT") {
    try {
      // Confirming a store global payment should:
      // - assign all involved cheques to the selected coffer (so they show in Check Safe)
      // - mark cheque status as confirmed
      // This is also what makes the payment count towards magasin debts.
      //
      // NOTE: Multi-cheque payments MUST pass `check_inventory_ids`.
      // If we only update a single cheque, the others will not appear in the coffer.
      const id = path.split("/")[2];
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: existing, error: existingErr } = await supabase
        .from("store_global_payments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (!existing) return jsonResponse({ error: "Not found" }, 404);

      // Authorization
      const isAdmin = String(currentUser.role || '').toLowerCase() === 'admin';
      if (!isAdmin) {
        if (!currentUser.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        if (String(existing.paid_by_store_id || "") !== String(currentUser.store_id)) {
          return jsonResponse({ error: "Unauthorized" }, 403);
        }
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // ===== Confirmation flow (Admin) =====
      // IMPORTANT:
      // - The Coffre page (CheckSafeModule) displays rows from `check_safe` (filtered by coffer_id).
      // - So confirmation must ultimately create/transfer a row into `check_safe`.
      // - We still keep a `check_inventory` row as source-of-truth + debt confirmation marker.
      if (String(body.status || '').trim() === 'confirmed') {
        if (!isAdmin) return jsonResponse({ error: "Unauthorized" }, 403);

        const cofferId = String(body.coffer_id || '').trim();
        if (!cofferId) return jsonResponse({ error: "coffer_id is required" }, 400);

        // Confirmation for Clients Magasins should create a row in `check_inventory`
        // because the UI "Coffre-fort des Chèques" is driven by check_inventory.
        const marker = `store_global_payment_id=${id}`;
        const requestedCofferId = String(body.coffer_id || '').trim();
        if (!requestedCofferId) {
          return jsonResponse({ error: 'coffer_id is required' }, 400);
        }

        // If this is a CHECK payment, we MUST link to an existing cheque.
        // payment reference_number is NOT the cheque id.
        const confirmedMethod = String(existing.payment_method || '').trim().toLowerCase();

        // Resolve linked cheque (inventory) id for check payments.
        // Prefer PUT body, then stored on payment row, then notes marker.
        let checkInventoryId: string | null = null;
        const bodyCheckInventoryId = String((body as any)?.check_inventory_id || (body as any)?.check_id || (body as any)?.selected_check_inventory_id || '').trim();
        if (bodyCheckInventoryId) checkInventoryId = bodyCheckInventoryId;

        if (!checkInventoryId) {
          const fromRow = String((existing as any)?.check_inventory_id || '').trim();
          if (fromRow) checkInventoryId = fromRow;
        }

        if (!checkInventoryId) {
          const notes = String((existing as any)?.notes || '').trim();
          const m = notes.match(/\bcheck_inventory_id=([0-9a-f\-]{36})\b/i);
          if (m && m[1]) checkInventoryId = String(m[1]);
        }

        console.log('[store-global-payments PUT] confirmation: method=', confirmedMethod, 'coffer_id=', requestedCofferId);
        
        if (confirmedMethod === 'check') {
        // Accept multiple frontend payload variants (single or multi)
        const bodyCheckInventoryIdsRaw = (body as any).check_inventory_ids || (body as any).check_ids || (body as any).selected_check_inventory_ids || null;
        let checkInventoryIds: string[] = Array.isArray(bodyCheckInventoryIdsRaw)
          ? (bodyCheckInventoryIdsRaw as any[]).map((v) => String(v || '').trim()).filter(Boolean)
          : (typeof bodyCheckInventoryIdsRaw === 'string'
            ? String(bodyCheckInventoryIdsRaw).split(',').map((s) => s.trim()).filter(Boolean)
            : []);

        let checkInventoryId = String(body.check_inventory_id || body.check_id || body.selected_check_inventory_id || '').trim() || null;
        if (!checkInventoryId && checkInventoryIds.length > 0) checkInventoryId = checkInventoryIds[0];

        // Best solution: confirmation should NOT depend on the UI resending the check id.
        // We try, in order:
        //  1) check id from confirmation payload
        //  2) check id stored on the payment row (created at POST time)
        //  3) last fallback: parse from notes marker `check_inventory_id=<uuid>`
        if (!checkInventoryId || checkInventoryIds.length === 0) {
          const paymentRow: any = existing || null;
          const fromPayment = String((paymentRow as any)?.check_inventory_id || '').trim();
          if (fromPayment) {
            checkInventoryId = checkInventoryId || fromPayment;
            if (checkInventoryIds.length === 0) checkInventoryIds = [fromPayment];
          }
        }

        if (!checkInventoryId || checkInventoryIds.length === 0) {
          const notes = String((existing as any)?.notes || '');
          const mMulti = notes.match(/check_inventory_ids=([^|\n\r]+)/i);
          if (mMulti && mMulti[1]) {
            const ids = String(mMulti[1])
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            if (ids.length > 0) {
              checkInventoryIds = ids;
              checkInventoryId = checkInventoryId || ids[0];
            }
          }

          if (!checkInventoryId) {
            const m = notes.match(/check_inventory_id=([a-f0-9\-]{36})/i);
            if (m && m[1]) {
              checkInventoryId = String(m[1]);
              if (checkInventoryIds.length === 0) checkInventoryIds = [checkInventoryId];
            }
          }
        }

        if (!checkInventoryId) {
        const paymentDebug = {
        payment_id: id,
        payment_method: (existing as any)?.payment_method,
        payment_reference_number: (existing as any)?.reference_number,
        payment_has_check_inventory_id_column: (existing as any)?.check_inventory_id !== undefined,
        payment_check_inventory_id_value: (existing as any)?.check_inventory_id || null,
        payment_notes_preview: String((existing as any)?.notes || '').slice(0, 200),
        };
        
        console.error(
        '[store-global-payments PUT] missing check_inventory_id in payload and not found on payment row. body keys=',
        Object.keys(body || {}),
        'paymentDebug=',
        paymentDebug,
        );
        
        return jsonResponse(
        {
        error: 'Cannot confirm check payment: missing check_inventory_id. Payment reference is NOT cheque id.',
        received_keys: Object.keys(body || {}),
        expected: [
        'check_inventory_id in PUT body (preferred)',
        'or store_global_payments.check_inventory_id populated at creation time',
        'or store_global_payments.notes contains check_inventory_id=<uuid>',
        ],
        payment_debug: paymentDebug,
        },
        400,
        );
        }
        
        // IMPORTANT: multi-cheque confirmation
        // We must update ALL cheque rows with the selected coffer_id.
        // Otherwise, only the first cheque will appear in the coffre UI.
        if (!Array.isArray(checkInventoryIds) || checkInventoryIds.length === 0) {
        checkInventoryIds = [String(checkInventoryId)];
        }
        
        // Update all cheques in check_inventory
        const nowIso = new Date().toISOString();
        const updInvAll = await supabase
        .from('check_inventory')
        .update({
        coffer_id: requestedCofferId,
        // keep status consistent with existing UI labels
        status: 'confirmed',
        } as any)
        .in('id', checkInventoryIds);
        
        if (updInvAll.error) {
        console.error('[store-global-payments PUT] failed to update check_inventory (multi):', updInvAll.error);
        return jsonResponse({ error: updInvAll.error.message }, 500);
        }
        
        // Append marker to notes per cheque without overwriting existing notes
        try {
        const { data: invRows, error: invRowsErr } = await supabase
        .from('check_inventory')
        .select('id, notes')
        .in('id', checkInventoryIds);
        
        if (!invRowsErr) {
        for (const r of invRows || []) {
        const cid = String(r?.id || '').trim();
        if (!cid) continue;
        const prevNotes = String((r as any)?.notes || '').trim();
        const markerTxt = `store_global_payment_id=${id}`;
        const nextNotes = prevNotes.includes(markerTxt)
        ? prevNotes
        : (prevNotes ? `${prevNotes} | ${markerTxt}` : markerTxt);
        
        const u = await supabase
        .from('check_inventory')
        .update({ notes: nextNotes } as any)
        .eq('id', cid);
        if (u.error) {
        console.warn('[store-global-payments PUT] failed to update notes for cheque', cid, u.error);
        }
        }
        }
        } catch (e) {
        console.warn('[store-global-payments PUT] notes marker update failed:', e);
        }
        
        // Ensure every cheque exists in check_safe for coffre display
        // The Check Safe page is driven by check_safe rows (coffer_id).
        for (const cid of checkInventoryIds) {
        const chequeId = String(cid || '').trim();
        if (!chequeId) continue;
        
        // Load cheque info
        const { data: invRow, error: invRowErr } = await supabase
        .from('check_inventory')
        .select('id, check_id_number, amount_value, amount, giver_name, given_by, given_to, store_id, coffer_id')
        .eq('id', chequeId)
        .maybeSingle();
        
        if (invRowErr || !invRow) {
        console.warn('[store-global-payments PUT] cannot load check_inventory row for check_safe sync:', chequeId, invRowErr);
        continue;
        }
        
        const checkNumber = String((invRow as any)?.check_id_number || '').trim();
        if (!checkNumber) {
        console.warn('[store-global-payments PUT] cheque has no check_id_number, skipping check_safe sync:', chequeId);
        continue;
        }
        
        const amountVal = Number((invRow as any)?.amount_value ?? (invRow as any)?.amount ?? 0) || 0;
        
        // Upsert into check_safe by check_inventory_id if possible
        const { data: existingSafe, error: existSafeErr } = await supabase
        .from('check_safe')
        .select('id')
        .eq('check_inventory_id', chequeId)
        .maybeSingle();
        
        if (existSafeErr) {
        console.warn('[store-global-payments PUT] check_safe lookup failed:', existSafeErr);
        }
        
        if (existingSafe?.id) {
        const updSafe = await supabase
        .from('check_safe')
        .update({
        coffer_id: requestedCofferId,
        status: 'confirmed',
        } as any)
        .eq('id', existingSafe.id);
        if (updSafe.error) {
        console.warn('[store-global-payments PUT] check_safe update failed:', updSafe.error);
        }
        } else {
        const insSafe = await supabase
        .from('check_safe')
        .insert([
        {
        coffer_id: requestedCofferId,
        check_id_number: checkNumber,
        amount_value: amountVal,
        status: 'confirmed',
        check_inventory_id: chequeId,
        giver_name: (invRow as any)?.giver_name ?? null,
        given_by: (invRow as any)?.given_by ?? null,
        given_to: (invRow as any)?.given_to ?? null,
        // IMPORTANT: never write check_safe with store_id NULL.
        // Prefer a store identifier coming from inventory (given_to_id) and fall back to payment context.
        store_id: String((invRow as any)?.given_to_id || (invRow as any)?.store_id || existing?.acted_as_store_id || existing?.paid_by_store_id || '').trim() || null,
        } as any,
        ]);
        
        if (insSafe.error) {
        console.warn('[store-global-payments PUT] check_safe insert failed:', insSafe.error);
        }
        }
        }
        
        // 1) Update selected cheque(s) in inventory and mirror to Coffre
        const marker2 = `store_global_payment_id=${id}`;
        const idsToProcess = (checkInventoryIds && checkInventoryIds.length > 0)
        ? checkInventoryIds
        : (checkInventoryId ? [checkInventoryId] : []);
        
        for (const invId of idsToProcess) {
        const updInv = await supabase
        .from('check_inventory')
        .update({
        status: 'received',
        coffer_id: requestedCofferId,
        notes: `${marker2} | coffer_id=${requestedCofferId}`,
        updated_at: new Date().toISOString(),
        })
        .eq('id', invId);
        
        if (updInv.error) {
        console.error('[store-global-payments PUT] failed to update check_inventory:', updInv.error);
        return jsonResponse({ error: updInv.error.message }, 500);
        }
        
        // Load check details (cheque number + amount)
        const { data: invRow, error: invRowErr } = await supabase
        .from('check_inventory')
        .select('check_id_number, amount_value, given_to_id')
        .eq('id', invId)
        .maybeSingle();
        
        if (invRowErr || !invRow) {
        console.error('[store-global-payments PUT] failed to load check_inventory row:', invRowErr);
        return jsonResponse({ error: 'Could not load check_inventory row' }, 500);
        }
        
        const checkNumber = String((invRow as any).check_id_number || '').trim() || null;
        const amountValue = Number((invRow as any).amount_value || 0) || 0;
        if (!checkNumber) {
        console.error('[store-global-payments PUT] check_inventory.check_id_number is empty; cannot create check_safe row');
        return jsonResponse({ error: 'Selected cheque has no check_id_number' }, 500);
        }
        
        const storeIdForSafe = (invRow as any).given_to_id
              ? String((invRow as any).given_to_id)
              : (existing?.acted_as_store_id
                ? String(existing.acted_as_store_id)
                : (existing?.paid_by_store_id ? String(existing.paid_by_store_id) : null));

            if (!storeIdForSafe) {
              console.error('[store-global-payments PUT] could not resolve store_id for check_safe; refusing to write NULL store_id');
              return jsonResponse({ error: 'store_id is required for check safe' }, 400);
            }
        
        // Idempotent Coffre write: key by check_inventory_id to avoid duplicates
        const safePayload: any = {
        check_inventory_id: invId,
        coffer_id: requestedCofferId,
        store_id: storeIdForSafe,
        amount: amountValue,
        check_number: checkNumber,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: currentUser.id,
        payment_transferred: true,
        payment_transferred_at: new Date().toISOString(),
        payment_transferred_by: currentUser.id,
        admin_id: currentUser.id,
        notes: `${marker2} | coffer_id=${requestedCofferId}`,
        updated_at: new Date().toISOString(),
        };
        
        const updByInv = await supabase
        .from('check_safe')
        .update(safePayload)
        .eq('check_inventory_id', invId);
        
        if (updByInv.error) {
        console.error('[store-global-payments PUT] check_safe update-by-check_inventory_id failed:', updByInv.error);
        return jsonResponse({ error: updByInv.error.message }, 500);
        }
        
        const updatedCount = Array.isArray((updByInv as any).data) ? (updByInv as any).data.length : ((updByInv as any).count || 0);
        if (!updatedCount) {
        const insSafe = await supabase
        .from('check_safe')
        .insert([safePayload]);
        
        if (insSafe.error) {
        const code = String((insSafe.error as any)?.code || '');
        if (code === '23505') {
        const updAfterConflict = await supabase
        .from('check_safe')
        .update(safePayload)
        .eq('check_inventory_id', invId);
        
        if (updAfterConflict.error) {
        console.error('[store-global-payments PUT] check_safe update after conflict failed:', updAfterConflict.error);
        return jsonResponse({ error: updAfterConflict.error.message }, 500);
        }
        } else {
        console.error('[store-global-payments PUT] check_safe insert failed:', insSafe.error);
        return jsonResponse({ error: insSafe.error.message }, 500);
        }
        }
        }
        }
        
        // Continue with marker-based check_inventory section (it will no-op because row now exists)
        }
        const { data: existingSafe, error: existSafeErr } = await supabase
        .from('check_safe')
        .select('id, coffer_id, amount, check_number, notes, check_inventory_id')
        .eq('check_inventory_id', checkInventoryId)
        .maybeSingle();
        
        console.log('[store-global-payments PUT] existingSafe=', existingSafe);
        
        if (existSafeErr) {
        console.error('[store-global-payments PUT] check_safe lookup failed:', existSafeErr);
        } else {
        const amountValue = Number(existing.amount || 0) || 0;
        const storeIdForSafe = existing.acted_as_store_id
        ? String(existing.acted_as_store_id)
        : (existing.paid_by_store_id ? String(existing.paid_by_store_id) : null);
        
        const checkNumber = String(
        body.check_number ||
        body.check_reference ||
        body.reference_number ||
        existing.reference_number ||
        ''
        ).trim() || `PAY-${id}`;
        
        // Idempotent Coffre write: always key by check_inventory_id to avoid duplicates
        const safePayload: any = {
        check_inventory_id: checkInventoryId,
        coffer_id: requestedCofferId,
        store_id: storeIdForSafe,
        amount: amountValue,
        check_number: checkNumber,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: currentUser.id,
        payment_transferred: true,
        payment_transferred_at: new Date().toISOString(),
        payment_transferred_by: currentUser.id,
        admin_id: currentUser.id,
        notes: `${marker} | coffer_id=${requestedCofferId} | check_number=${checkNumber}`,
        updated_at: new Date().toISOString(),
        };
        
        // NOTE: Do not use upsert(onConflict) here because some environments expose a partial/absent
        // unique constraint in the schema cache and it triggers 42P10.
        // Idempotency is handled by update-by-check_inventory_id + insert fallback below.
        
        }
        
        // Idempotency: avoid double insert in check_inventory by using notes marker
        // (check_inventory has notes column).
        const { data: existingInv, error: existingInvErr } = await supabase
        .from('check_inventory')
        .select('id, coffer_id')
        .ilike('notes', `%${marker}%`)
        .maybeSingle();
        
        if (existingInvErr) {
        console.error('[store-global-payments PUT] check_inventory lookup failed:', existingInvErr);
        }

        if (existingInv?.id) {
// Already confirmed before: update coffre if admin selected a different one
const upd = await supabase
.from('check_inventory')
.update({ coffer_id: requestedCofferId })
.eq('id', existingInv.id);

if (upd.error) {
console.error('[store-global-payments PUT] check_inventory coffer update failed:', upd.error);
return jsonResponse({ error: upd.error.message }, 500);
}
}

if (!existingInv?.id) {
          const amountValue = Number(existing.amount || 0) || 0;
          const paymentMethod = String(existing.payment_method || '').trim();

          const storeId = existing.store_id ? String(existing.store_id) : (existing.acted_as_store_id ? String(existing.acted_as_store_id) : null);
          const storeName = String(existing.paid_by_store_name || '').trim() || 'Magasin';

          // check_inventory requires check_id_number (unique) even for cash.
          // IMPORTANT: for Paiement Global (Fournisseur Admin / Magasin) the `reference_number` is a PAYMENT reference,
          // not a cheque id. Never use it as cheque number.
          const checkIdNumber = `PAY-${id}`;

          // Store selected coffre in dedicated column (added by migration 121) AND keep it in notes for traceability.
          const notes = `${marker} | coffer_id=${cofferId}`;
          
          const invRow: any = {
          check_id_number: checkIdNumber,
          amount_value: amountValue,
          given_to: storeName,
          given_to_type: 'store',
          given_to_id: storeId,
          status: 'received',
          coffer_id: requestedCofferId,
          notes,
          // extra fields exist in later migrations / handler, but are optional in DB in most setups
          created_by: currentUser.id,
          uploaded_by: currentUser.id,
          };

          const { data: insertedInv, error: invInsErr } = await supabase
            .from('check_inventory')
            .insert([invRow])
            .select('id')
            .maybeSingle();

          if (invInsErr) {
            console.error('[store-global-payments PUT] check_inventory insert failed:', invInsErr);
            return jsonResponse({ error: invInsErr.message }, 500);
          }
        }
      }

      if (body.amount !== undefined) {
        const a = Number(body.amount);
        if (!Number.isFinite(a) || a < 0) return jsonResponse({ error: "amount must be >= 0" }, 400);
        updateData.amount = a;
      }

      if (body.payment_method !== undefined) {
        const m = String(body.payment_method || "").trim();
        if (!["cash", "check", "bank_transfer", "other"].includes(m)) return jsonResponse({ error: "Invalid payment_method" }, 400);
        updateData.payment_method = m;
      }

      if (body.payment_date !== undefined) updateData.payment_date = body.payment_date || null;
      if (body.reference_number !== undefined) updateData.reference_number = body.reference_number || null;
      if (body.notes !== undefined) updateData.notes = body.notes || null;

      if (currentUser.role === "admin") {
        if (body.paid_by_store_id !== undefined) updateData.paid_by_store_id = body.paid_by_store_id || null;
        if (body.paid_by_store_name !== undefined) updateData.paid_by_store_name = body.paid_by_store_name || null;
        if (body.acted_as_store_id !== undefined) updateData.acted_as_store_id = body.acted_as_store_id || null;
      }

      const { data: updated, error: updErr } = await supabase
        .from("store_global_payments")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updErr) throw updErr;

      return jsonResponse({ success: true, store_global_payment: updated });
    } catch (error: any) {
      console.error("Error updating store global payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Client Global Payments (Paiement Global Client) =====
  // GET  /client-global-payments?client_id=...
  // POST /client-global-payments
  // PUT  /client-global-payments/:id
  if (path === "/client-global-payments" && method === "GET") {
    try {
      const url = new URL(req.url);
      const clientId = url.searchParams.get("client_id");
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      let query = supabase
        .from("client_global_payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (clientId) query = query.eq("client_id", clientId);

      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ client_global_payments: [] });
        query = query.eq("paid_by_store_id", currentUser.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const storeIds = Array.from(new Set(rows.map((r: any) => r?.paid_by_store_id).filter(Boolean).map((v: any) => String(v))));
      const userIds = Array.from(new Set(rows.map((r: any) => r?.created_by).filter(Boolean).map((v: any) => String(v))));

      let storesMap = new Map<string, any>();
      if (storeIds.length > 0) {
        const { data: storesRows, error: sErr } = await supabase
          .from("stores")
          .select("id, name")
          .in("id", storeIds);
        if (sErr) {
          console.warn("/client-global-payments GET could not fetch stores:", sErr.message);
        } else {
          (storesRows || []).forEach((st: any) => storesMap.set(String(st.id), st));
        }
      }

      let usersMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: usersRows, error: uErr } = await supabase
          .from("users")
          .select("id, email")
          .in("id", userIds);
        if (uErr) {
          console.warn("/client-global-payments GET could not fetch users:", uErr.message);
        } else {
          (usersRows || []).forEach((u: any) => usersMap.set(String(u.id), u));
        }
      }

      const enriched = rows.map((p: any) => {
        const storeId = p?.paid_by_store_id ? String(p.paid_by_store_id) : null;
        const createdById = p?.created_by ? String(p.created_by) : null;
        return {
          ...p,
          paid_by_store_name: storeId ? (storesMap.get(storeId)?.name || null) : null,
          created_by_email: p?.created_by_email || (createdById ? (usersMap.get(createdById)?.email || null) : null),
          // Rendering-only field to avoid ambiguity in the frontend
          // NOTE: keep it derived from row fields here; the canonical handler attaches computed remise_amount.
          remise_display_amount: Math.abs(Number(p?.remise_amount ?? p?.discount_amount ?? 0) || 0),
          };
      });

      return jsonResponse({ client_global_payments: enriched });
    } catch (error: any) {
      console.error("Error fetching client global payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/client-global-payments" && method === "POST") {
  try {
  const body = await req.json().catch(() => ({}));
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  const clientId = String(body.client_id || "").trim();
  if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);
  
  const amount = Number(body.amount);
  // Allow creating a "remise-only" global payment record (amount 0) so we have an id to link discounts to.
  // This keeps history consistent and enables caisse to display "0 + (remise)" if needed.
  if (!Number.isFinite(amount) || amount < 0) {
  return jsonResponse({ error: "amount must be >= 0" }, 400);
  }
  
  const paymentMethod = String(body.payment_method || "").trim().toLowerCase();
  // If amount is 0 (remise-only), allow missing method and default to cash.
  const resolvedMethod = paymentMethod || "cash";
  if (!["cash", "check", "bank_transfer", "other"].includes(resolvedMethod)) {
  return jsonResponse({ error: "Invalid payment_method" }, 400);
  }
  
  // For cheque payments, we MUST consume a check from check_inventory.
  // Otherwise the same cheque stays "Disponible" and can be reused multiple times.
  const checkInventoryId = resolvedMethod === 'check'
  ? (body.check_inventory_id ? String(body.check_inventory_id).trim() : null)
  : null;
  
  if (resolvedMethod === 'check') {
  if (!checkInventoryId) return jsonResponse({ error: 'check_inventory_id is required when payment_method=check' }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: 'amount must be > 0 when payment_method=check' }, 400);
  }

      // Store scope rules:
      // - Admin can explicitly pick paid_by_store_id
      // - Non-admin is restricted to their own store
      const paidByStoreId = currentUser.role === "admin"
        ? (body.paid_by_store_id ? String(body.paid_by_store_id) : null)
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      if (!paidByStoreId) {
        return jsonResponse({ error: "paid_by_store_id is required" }, 400);
      }

      const paymentDate = body.payment_date ? new Date(String(body.payment_date)) : new Date();
      if (Number.isNaN(paymentDate.getTime())) {
        return jsonResponse({ error: "Invalid payment_date" }, 400);
      }

      const rawReferenceNumber = String(body.reference_number ?? "").trim();

      const insertRow: any = {
        client_id: clientId,
        amount,
        payment_method: resolvedMethod,
        payment_date: paymentDate.toISOString(),
        notes: body.notes || null,
        paid_by_store_id: paidByStoreId,
        reference_number: rawReferenceNumber || null,
        created_by: currentUser.id,
        created_by_email: currentUser.email,
        is_admin_payment: currentUser.role === "admin",
        acted_as_store_id: currentUser.role === "admin" ? (body.acted_as_store_id ? String(body.acted_as_store_id) : paidByStoreId) : null,
      };

      // If payment is by cheque, update check_inventory remaining_balance + status.
      // We do this BEFORE inserting the global payment so if it fails we don't create a payment that didn't consume a cheque.
      if (resolvedMethod === 'check' && checkInventoryId) {
        const { data: checkRow, error: checkErr } = await supabase
          .from('check_inventory')
          .select('id, amount_value, remaining_balance, status, notes')
          .eq('id', checkInventoryId)
          .maybeSingle();

        if (checkErr) throw checkErr;
        if (!checkRow) return jsonResponse({ error: 'check_inventory_id not found' }, 400);

        const amountTotal = Number((checkRow as any).amount_value || 0) || 0;
        const remainingBefore = (checkRow.remaining_balance !== null && checkRow.remaining_balance !== undefined)
          ? (Number(checkRow.remaining_balance) || 0)
          : amountTotal;

        const useAmount = Math.abs(Number(amount) || 0);
        if (useAmount <= 0) return jsonResponse({ error: 'amount must be > 0' }, 400);
        if (useAmount > remainingBefore + 1e-9) {
          return jsonResponse({ error: `Check remaining balance is insufficient (remaining=${remainingBefore})` }, 400);
        }

        const remainingAfter = Math.max(0, remainingBefore - useAmount);
        const usagePercentage = amountTotal > 0
          ? Math.min(100, Math.max(0, ((amountTotal - remainingAfter) / amountTotal) * 100))
          : null;

        // UI expects status values: pending / partial / used
        const newStatus = remainingAfter <= 0 ? 'used' : 'partial';

        // Keep an audit marker in notes (works even if optional audit columns do not exist)
        const prevNotes = String((checkRow as any)?.notes || '').trim();
        const marker = `client_global_payment_pending_consume=${checkInventoryId}`;
        const nextNotes = prevNotes.includes(marker)
          ? prevNotes
          : (prevNotes ? `${prevNotes} | ${marker}` : marker);

        // IMPORTANT:
        // The previous implementation used a concurrency guard:
        //   .eq('remaining_balance', checkRow.remaining_balance)
        // That fails when remaining_balance is NULL (common for newly created cheques in some environments),
        // producing a NO-OP update without an error.
        // We instead do a simple update. This is acceptable here because this is an edge function with service role;
        // if you need strict concurrency, move to a SQL RPC with row locks.
        const updatePayloadBase: any = {
          remaining_balance: remainingAfter,
          usage_percentage: usagePercentage,
          status: newStatus,
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        };

        // Best-effort optional audit link (column may not exist)
        const updatePayloadWithAudit: any = {
          ...updatePayloadBase,
          source_client_global_payment_id: null,
        };

        const upd1 = await supabase
          .from('check_inventory')
          .update(updatePayloadWithAudit)
          .eq('id', checkInventoryId);

        if (upd1.error) {
          const msg = String(upd1.error.message || '');
          if (msg.toLowerCase().includes('source_client_global_payment_id')) {
            const upd2 = await supabase
              .from('check_inventory')
              .update(updatePayloadBase)
              .eq('id', checkInventoryId);
            if (upd2.error) throw upd2.error;
          } else {
            throw upd1.error;
          }
        }
      }
      
      // Persist cheque link on the payment row (if column exists in DB).
      if (resolvedMethod === 'check' && checkInventoryId) {
      insertRow.check_inventory_id = checkInventoryId;
      }
      
      const { data, error } = await supabase
      .from("client_global_payments")
      .insert([insertRow])
      .select()
      .single();
      
      // If schema cache doesn't know check_inventory_id, retry without it.
      if (error) {
      const msg = String(error.message || '');
      if (msg.toLowerCase().includes('check_inventory_id')) {
      const retryRow: any = { ...insertRow };
      delete retryRow.check_inventory_id;
      const retry = await supabase
      .from('client_global_payments')
      .insert([retryRow])
      .select()
      .single();
      if (retry.error) throw retry.error;
      return jsonResponse({ success: true, client_global_payment: retry.data });
      }
      throw error;
      }
      
      return jsonResponse({ success: true, client_global_payment: data });
      } catch (error: any) {
      console.error("Error creating client global payment:", error);
      return jsonResponse({ error: error.message }, 500);
      }
      }

  if (path.startsWith("/client-global-payments/") && method === "PUT") {
    try {
      const paymentId = path.split("/")[2];
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: existing, error: existingErr } = await supabase
        .from("client_global_payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (!existing) return jsonResponse({ error: "Not found" }, 404);

      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ error: "Unauthorized" }, 403);
        const allowedStoreIds = [existing.paid_by_store_id, existing.acted_as_store_id]
          .filter(Boolean)
          .map((v: any) => String(v));
        if (!allowedStoreIds.includes(String(currentUser.store_id))) {
          return jsonResponse({ error: "Unauthorized" }, 403);
        }
      }

      const updateData: any = { updated_at: new Date().toISOString() };

      if (body.amount !== undefined) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return jsonResponse({ error: "amount must be > 0" }, 400);
        }
        updateData.amount = amount;
      }

      if (body.payment_method !== undefined) {
        const m = String(body.payment_method || "").trim().toLowerCase();
        if (!m || !["cash", "check", "bank_transfer", "other"].includes(m)) {
          return jsonResponse({ error: "Invalid payment_method" }, 400);
        }
        updateData.payment_method = m;
      }

      if (body.payment_date !== undefined) {
        const d = body.payment_date ? new Date(String(body.payment_date)) : null;
        if (!d || Number.isNaN(d.getTime())) {
          return jsonResponse({ error: "Invalid payment_date" }, 400);
        }
        updateData.payment_date = d.toISOString();
      }

      if (body.notes !== undefined) {
        updateData.notes = body.notes ? String(body.notes) : null;
      }

      // Best-effort audit: these columns might not exist on older DBs; if so, ignore.
      updateData.updated_by = currentUser.id;
      updateData.updated_by_email = currentUser.email;

      const { data: updated, error: updErr } = await supabase
        .from("client_global_payments")
        .update(updateData)
        .eq("id", paymentId)
        .select()
        .single();

      if (updErr) {
        // If schema cache doesn't know updated_by fields, retry without them
        const msg = String(updErr.message || "");
        if (msg.toLowerCase().includes("updated_by")) {
          const retryData: any = { ...updateData };
          delete retryData.updated_by;
          delete retryData.updated_by_email;

          const retry = await supabase
            .from("client_global_payments")
            .update(retryData)
            .eq("id", paymentId)
            .select()
            .single();

          if (retry.error) throw retry.error;
          return jsonResponse({ success: true, client_global_payment: retry.data });
        }
        throw updErr;
      }

      return jsonResponse({ success: true, client_global_payment: updated });
    } catch (error: any) {
      console.error("Error updating client global payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Supplier Passages (Fournisseur exceptionnel / temporaire) =====
  // Stored in `supplier_passages` table and used for:
  // - Supplier details page exceptional history
  // - Caisse page: subtract from Total Dépensé
  if (path === "/supplier-passages" && method === "GET") {
    try {
      const url = new URL(req.url);
      const supplierId = url.searchParams.get("supplier_id");
      const requestedStoreId = url.searchParams.get("store_id");

      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const effectiveStoreId = currentUser.role === "admin"
        ? (requestedStoreId || null)
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      // Admin must select a store to avoid cross-store leakage
      if (currentUser.role === "admin" && !effectiveStoreId) {
        return jsonResponse({ passages: [] });
      }

      let q = supabase
        .from("supplier_passages")
        .select("*")
        .order("created_at", { ascending: false });

      if (supplierId) q = q.eq("supplier_id", supplierId);
      if (effectiveStoreId) q = q.eq("store_id", effectiveStoreId);

      const { data, error } = await q;
      if (error) throw error;

      return jsonResponse({ passages: data || [] });
    } catch (error: any) {
      console.error("Error fetching supplier passages:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/supplier-passages" && method === "POST") {
  try {
  const body = await req.json();
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  const supplierId = String(body.supplier_id || "").trim();
  if (!supplierId) return jsonResponse({ error: "supplier_id is required" }, 400);
  
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
  return jsonResponse({ error: "amount must be > 0" }, 400);
  }
  
  // IMPORTANT: Prevent double-counting.
  // This endpoint already mirrors the passage into `payments`.
  // If the client (manager/admin UI) calls POST /payments separately,
  // you will see totals doubled (example: pay 1 => UI shows 2).
  // Enforce a stable reference so we can deduplicate.
  const reference = String(body.reference || body.reference_number || `PASSAGE-${Date.now()}`).trim();

      // Load supplier for authorization / store resolution
      const { data: supplier, error: supplierErr } = await supabase
        .from("suppliers")
        .select("id, store_id")
        .eq("id", supplierId)
        .maybeSingle();

      if (supplierErr) throw supplierErr;
      if (!supplier) return jsonResponse({ error: "Supplier not found" }, 404);

      const supplierStoreId = supplier.store_id ? String(supplier.store_id) : null;

      // Determine effective store scope
      let effectiveStoreId: string | null = null;
      if (currentUser.role === "admin") {
        const reqStoreId = body.store_id ? String(body.store_id) : null;
        if (!reqStoreId) {
          return jsonResponse({ error: "store_id is required for admin" }, 400);
        }
        effectiveStoreId = reqStoreId;
      } else {
        if (!currentUser.store_id) return jsonResponse({ error: "User must have a store assigned" }, 400);
        effectiveStoreId = String(currentUser.store_id);
      }

      if (supplierStoreId && effectiveStoreId && supplierStoreId !== effectiveStoreId) {
        return jsonResponse({ error: "Supplier does not belong to selected store" }, 403);
      }

      const insertRow: any = {
      supplier_id: supplierId,
      store_id: effectiveStoreId,
      amount,
      currency: body.currency || 'MAD',
      payment_method: body.payment_method || null,
      reference,
      notes: body.notes || null,
      passage_date: body.passage_date || new Date().toISOString(),
      created_by: currentUser.id,
      created_by_email: currentUser.email,
      created_by_role: currentUser.role,
      };

      const { data, error } = await supabase
        .from("supplier_passages")
        .insert([insertRow])
        .select()
        .single();

      if (error) throw error;

      // Mirror this operation into:
      // 1) `expenses`  -> so Caisse totals/history can display + discount it
      // 2) `payments`  -> so supplier remaining balance decreases using existing logic
      //
      // IMPORTANT: these inserts used to fail silently (schema mismatch / missing required fields like coffer_id),
      // which is why you saw rows in supplier_passages but nothing changed in Caisse or supplier balance.
      //
      // We now:
      // - record directly in STORE CAISSE (not coffre)
      // - return a clear error if mirroring fails, so the bug is visible instead of silent.

      // 1) Create expense row (drives Caisse totals + Historique)
      // NOTE: this is a magasin/caisse expense, so it should NOT require or set coffer_id.
      {
        const expenseRow: any = {
          store_id: effectiveStoreId,
          amount,
          // Some DBs don't have `category` column (schema cache error). Use `reason` which exists.
          reason: `Paiement Fournisseur Passage: ${supplierId}`,
          expense_type: "supplier_passage",
          created_by: currentUser.id,
        };

        const { error: expenseErr } = await supabase
          .from("expenses")
          .insert([expenseRow]);

        if (expenseErr) {
          console.error("Failed to create expense row for supplier passage", expenseErr);
          return jsonResponse({ error: `Failed to record passage in Caisse (expenses): ${expenseErr.message}` }, 500);
        }

        // Admin acting-as-store dual entry:
        // - Selected magasin caisse: OUT (negative)  [already inserted above]
        // - Admin's own caisse: IN (positive)
        // This models: admin gave cash to the magasin to execute the payment.
        if (String(currentUser.role || '').toLowerCase() === 'admin') {
          const adminStoreId = currentUser.store_id ? String(currentUser.store_id) : null;
          if (adminStoreId && String(adminStoreId) !== String(effectiveStoreId)) {
            const adminInRow: any = {
              store_id: adminStoreId,
              amount: Math.abs(amount),
              reason: `Entrée Admin (Paiement Passage pour Magasin ${effectiveStoreId})`,
              // NOTE: disabled per business rule: admin caisse should NOT increase for supplier passage.
              // expense_type: 'supplier_passage_admin_in',
              // created_by: currentUser.id,
            };

            // Business rule update: do NOT record any admin caisse movement when admin acts as a magasin
            // for supplier passage. Only the magasin caisse OUT must be recorded.
          }
        }
      }

      // 2) Create supplier payment row (drives supplier balance decrease)
      // IMPORTANT:
      // - Must follow the same store resolution rules as POST /payments
      // - Must NOT insert columns that don't exist (schema cache errors)
      {
        // Determine store context exactly like POST /payments:
        // - non-admin: always use their own store_id
        // - admin: must explicitly choose store_id (acting as magasin)
        const resolvedStoreId =
          currentUser.role === "admin"
            ? (body.store_id ? String(body.store_id) : null)
            : (currentUser.store_id ? String(currentUser.store_id) : null);

        if (currentUser.role === "admin" && !resolvedStoreId) {
          return jsonResponse({ error: "store_id is required for admin" }, 400);
        }

        // Ensure we stay consistent with the already computed effectiveStoreId
        // (defensive; should be identical in normal cases)
        if (resolvedStoreId && effectiveStoreId && String(resolvedStoreId) !== String(effectiveStoreId)) {
          console.warn("[/supplier-passages POST] store mismatch resolvedStoreId vs effectiveStoreId", {
            resolvedStoreId,
            effectiveStoreId,
          });
        }

        // Deduplication key for the mirrored `payments` row:
        // use the same `reference` we store in supplier_passages.
        const reference_number = reference;
        
        // If a payment already exists for this passage, do NOT insert it again.
        // This prevents double totals in manager UI.
        const { data: existingPayment, error: existingPaymentErr } = await supabase
        .from('payments')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('store_id', resolvedStoreId || effectiveStoreId)
        .eq('reference_number', reference_number)
        .limit(1)
        .maybeSingle();
        if (existingPaymentErr) throw existingPaymentErr;
        
        if (!existingPayment?.id) {
        const paymentRow: any = {
        supplier_id: supplierId,
        store_id: resolvedStoreId || effectiveStoreId,
        amount,
        payment_method: body.payment_method || "cash",
        reference_number,
        notes: body.notes ? `PASSAGE • ${body.notes}` : "PASSAGE",
        created_by: currentUser.id,
        // DO NOT set created_by_email here because some DBs don't have that column.
        // (POST /payments sets it, but your production schema cache indicates it's missing.)
        };
        
        const isSchemaCacheMissingColumn = (err: any, col: string) => {
        const msg = String(err?.message || "");
        return msg.includes(`Could not find the '${col}' column`) ||
        msg.includes(`Could not find the \"${col}\" column`) ||
        msg.toLowerCase().includes("schema cache") && msg.toLowerCase().includes(col.toLowerCase());
        };
        
        // Try insert including created_by_email.
        // If PostgREST schema cache is stale, retry without that column so the payment still succeeds.
        const firstTry = await supabase
        .from("payments")
        .insert([paymentRow]);
        
        if (firstTry.error) {
        if (isSchemaCacheMissingColumn(firstTry.error, "created_by_email")) {
        const retryRow: any = { ...paymentRow };
        delete retryRow.created_by_email;
        
        const retry = await supabase
        .from("payments")
        .insert([retryRow]);
        
        if (retry.error) {
        console.error("Failed to create payments row for supplier passage (retry without created_by_email)", retry.error);
        return jsonResponse({ error: `Failed to reduce supplier balance (payments): ${retry.error.message}` }, 500);
        }
        } else {
        console.error("Failed to create payments row for supplier passage", firstTry.error);
        return jsonResponse({ error: `Failed to reduce supplier balance (payments): ${firstTry.error.message}` }, 500);
        }
        }
        }
        
        // If the mirrored payment already exists, we do nothing.
      }

      // Mark supplier as passage (idempotent)
      try {
        await supabase
          .from("suppliers")
          .update({ is_passage: true, updated_at: new Date().toISOString() })
          .eq("id", supplierId);
      } catch (e) {
        console.warn("Could not mark supplier as passage:", e);
      }

      return jsonResponse({ success: true, passage: data });
    } catch (error: any) {
      console.error("Error creating supplier passage:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/orders" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      let query = supabase
        .from("orders")
        .select("*, stores(name, email), order_items(*)")
        .order("created_at", { ascending: false });

      // If user has a store_id and is not admin, filter by that store
      if (currentUser && currentUser.store_id && currentUser.role !== "admin") {
        query = query.eq("store_id", currentUser.store_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ orders: data || [] });
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/orders" && method === "POST") {
    try {
      const body = await req.json();
      const { data, error } = await supabase
        .from("orders")
        .insert([
          {
            order_number: body.order_number,
            store_id: body.store_id,
            total_amount: body.total_amount || 0,
            status: "pending",
            payment_status: "unpaid",
            payment_method: body.payment_method,
            notes: body.notes,
            delivery_date: body.delivery_date,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, order: data?.[0] });
    } catch (error: any) {
      console.error("Error creating order:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/orders/") && method === "PUT") {
    try {
      const orderId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("orders")
        .update({
          order_number: body.order_number,
          store_id: body.store_id,
          total_amount: body.total_amount,
          status: body.status,
          payment_status: body.payment_status,
          payment_method: body.payment_method,
          notes: body.notes,
          delivery_date: body.delivery_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, order: data?.[0] });
    } catch (error: any) {
      console.error("Error updating order:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/orders/") && path.includes("/confirm-delivery") && method === "POST") {
    try {
      const orderId = path.split("/")[2];
      const body = await req.json();

      console.log("=== ORDER DELIVERY CONFIRMATION DEBUG ===");
      console.log(`Order ID: ${orderId}`);
      console.log(`Buyer Store ID: ${body.buyer_store_id}`);

      const { data, error } = await supabase
        .from("orders")
        .update({
          status: "delivered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select();

      if (error) throw error;

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) throw itemsError;

      const buyerStoreId = body.buyer_store_id;

      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          console.log(`Processing item: ${item.product_id}, quantity: ${item.quantity}`);

          // Add stock to buyer's store_stocks
          if (buyerStoreId) {
            // Check if buyer already has this product
            const { data: buyerStock, error: buyerError } = await supabase
              .from("store_stocks")
              .select("quantity")
              .eq("product_id", item.product_id)
              .eq("store_id", buyerStoreId)
              .single();

            if (buyerError && buyerError.code === 'PGRST116') {
              // Buyer doesn't have this product yet, create entry
              const { error: insertError } = await supabase
                .from("store_stocks")
                .insert([{
                  product_id: item.product_id,
                  store_id: buyerStoreId,
                  quantity: item.quantity,
                }]);

              if (insertError) {
                console.error(`Error creating stock for buyer: ${insertError.message}`);
              } else {
                console.log(`✓ Created product ${item.product_id} in buyer store with quantity ${item.quantity}`);
              }
            } else if (!buyerError && buyerStock) {
              // Buyer already has this product, increment quantity
              const newQuantity = buyerStock.quantity + item.quantity;
              const { error: updateStockError } = await supabase
                .from("store_stocks")
                .update({ quantity: newQuantity })
                .eq("product_id", item.product_id)
                .eq("store_id", buyerStoreId);

              if (updateStockError) {
                console.error(`Error updating stock for buyer: ${updateStockError.message}`);
              } else {
                console.log(`✓ Updated product ${item.product_id} in buyer store: ${buyerStock.quantity} -> ${newQuantity}`);
              }
            } else if (buyerError) {
              console.error(`Error fetching buyer stock: ${buyerError.message}`);
            }
          }

          // NOTE: Do NOT update products.quantity_available
          // Only update store_stocks to keep total stock accurate
        }
      }

      console.log("=== END ORDER DELIVERY CONFIRMATION DEBUG ===");
      return jsonResponse({ success: true, order: data?.[0] });
    } catch (error: any) {
      console.error("Error confirming delivery:", error);
      console.log("=== END ORDER DELIVERY CONFIRMATION DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/orders/") && method === "DELETE") {
    try {
      const orderId = path.split("/")[2];
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/sales" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  // Store scoping:
  // - admin: may see all sales/orders
  // - manager/user: can only see sales where their store is involved
  //   (either destination store_id or source_store_id)
  const role = String(currentUser.role || '').toLowerCase();
  const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
  const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
  
  // Return sales rows enriched with actor/store meta (needed for UI marking BL/ACHAT/TRANSFER + "par")
  let query = supabase
  .from("sales")
  .select("*")
  .order("created_at", { ascending: false });
  
  if (role !== "admin") {
  if (!myStoreId) return jsonResponse({ sales: [] });
  // IMPORTANT: for transfers/purchases, a magasin must see rows where it is either:
  // - destination (store_id)
  // - OR source (source_store_id)
  query = query.or(`store_id.eq.${myStoreId},source_store_id.eq.${myStoreId}`);
  }

      const { data, error } = await query;
      if (error) {
        console.error("/sales GET query error:", error);
        throw error;
      }

      const sales = data || [];

      // Enrich with actor email + store names
      const userIds = Array.from(
        new Set(
          sales
            .map((s: any) => s?.created_by)
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      const storeIds = Array.from(
        new Set(
          sales
            .flatMap((s: any) => [s?.store_id, s?.source_store_id, s?.created_for_store_id])
            .filter((v: any) => v !== null && v !== undefined)
            .map((v: any) => String(v))
        )
      );

      let usersMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: usersRows, error: usersErr } = await supabase
          .from("users")
          .select("id, email, role, store_id")
          .in("id", userIds);
        if (usersErr) {
          console.warn("/sales GET could not fetch users:", usersErr.message);
        } else {
          (usersRows || []).forEach((u: any) => usersMap.set(String(u.id), u));
        }
      }

      let storesMap = new Map<string, any>();
      if (storeIds.length > 0) {
        const { data: storesRows, error: storesErr } = await supabase
          .from("stores")
          .select("id, name")
          .in("id", storeIds);
        if (storesErr) {
          console.warn("/sales GET could not fetch stores:", storesErr.message);
        } else {
          (storesRows || []).forEach((st: any) => storesMap.set(String(st.id), st));
        }
      }

      const enriched = sales.map((s: any) => {
        const createdById = s?.created_by ? String(s.created_by) : null;
        const createdBy = createdById ? usersMap.get(createdById) : null;

        // Normalize remise/discount amount for frontend compatibility.
        // DB canonical column: total_remise
        const totalRemiseNormalized = (() => {
          const v = s?.total_remise ?? s?.totalRemise ?? s?.remise_amount ?? s?.discount_amount ?? s?.total_discount ?? s?.remise ?? 0;
          const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
          return Number.isFinite(n) ? n : 0;
        })();

        const storeId = s?.store_id ? String(s.store_id) : null;
        const sourceStoreId = s?.source_store_id ? String(s.source_store_id) : null;
        const createdForStoreId = s?.created_for_store_id ? String(s.created_for_store_id) : null;

        const saleNumber = String(s?.sale_number || "");
        const docType = saleNumber.includes("TRANSFER-")
          ? "TRANSFER"
          : saleNumber.includes("PURCHASE-")
            ? "ACHAT"
            : saleNumber.includes("BL-") || saleNumber.startsWith("BL")
              ? "BL"
              : "VENTE";

        return {
          ...s,
          // Ensure the API always returns a consistent field
          total_remise: totalRemiseNormalized,
          // Alias for older UI code (camelCase)
          totalRemise: totalRemiseNormalized,
          doc_type: docType,
          created_by_email: createdBy?.email || null,
          created_by_role: s?.created_by_role || createdBy?.role || null,
          store_name: storeId ? storesMap.get(storeId)?.name || null : null,
          source_store_name: sourceStoreId ? storesMap.get(sourceStoreId)?.name || null : null,
          created_for_store_name: createdForStoreId ? storesMap.get(createdForStoreId)?.name || null : null,
        };
      });

      return jsonResponse({ sales: enriched });
    } catch (error: any) {
      console.error("Error fetching sales:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Fetch a single sale with its items (stable; no stores join).
  // Used by SalesDetailsPage / PurchaseModule / OrdersModule.
  if (path.startsWith("/sales/") && method === "GET") {
    try {
      const saleId = path.split("/")[2];
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // 1) Fetch sale
      let saleQuery = supabase.from("sales").select("*").eq("id", saleId);
      if (currentUser.role !== "admin") {
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || '').trim() || null;
      const myStoreId = (currentUser.store_id ? String(currentUser.store_id).trim() : null) || metaStoreId;
      if (!myStoreId) return jsonResponse({ error: "Unauthorized" }, 403);
      
      // For transfers/purchases, a magasin must see rows where it is either:
      // - destination (store_id)
      // - OR source (source_store_id)
      saleQuery = saleQuery.or(`store_id.eq.${myStoreId},source_store_id.eq.${myStoreId}`);
      }

      const { data: sale, error: saleError } = await saleQuery.single();
      if (saleError) throw saleError;

      // 2) Fetch items from sale_items
      const { data: saleItems, error: itemsError } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true });

      if (itemsError) {
        console.warn("/sales/:id GET could not fetch sale_items:", itemsError.message);
      }

      // 3) If sale_items is empty, fallback to legacy `sales.items` JSONB
      // (older purchases/transfers may have items only in JSONB)
      const resolvedSaleItems = (saleItems && Array.isArray(saleItems) && saleItems.length > 0)
        ? saleItems
        : (Array.isArray((sale as any).items) ? (sale as any).items : []);

      // 4) Resolve payment method from `payment_methods` array (used by purchases/transfers)
      // so UI doesn't show "Non spécifié".
      let resolvedPaymentMethod = (sale as any).payment_method || null;
      const paymentMethods = (sale as any).payment_methods;
      if (!resolvedPaymentMethod && Array.isArray(paymentMethods) && paymentMethods.length > 0) {
        // take the first method type (cash/check/bank_transfer)
        resolvedPaymentMethod = paymentMethods[0]?.type || null;
      }

      return jsonResponse({
        sale: {
          ...sale,
          payment_method: resolvedPaymentMethod,
          sale_items: resolvedSaleItems,
        },
      });
    } catch (error: any) {
      console.error("Error fetching sale:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/sales" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      console.log("=== SALES POST DEBUG ===");
      console.log("Request body:", JSON.stringify(body, null, 2));
      console.log("Current user:", currentUser);
      console.log("Items in request:", body.items);
      console.log("Items count:", body.items?.length || 0);

      // Helper: get a numeric quantity to use for stock operations.
      // Some modules (CreatePurchase/Transfer) store the real movement in `caisse`.
      const getMovementQty = (item: any) => {
        const raw = item?.caisse ?? item?.quantity;
        const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
        return Number.isFinite(n) ? n : 0;
      };

      // Helper: amount WE OWE the client for this sale (per your business logic)
      const computeClientOwedAmount = (sale: { total_amount?: any; amount_paid?: any; remaining_balance?: any; payment_status?: any; }) => {
        const status = String(sale.payment_status || "unpaid").toLowerCase();
        const total = Number(sale.total_amount || 0) || 0;
        const paid = Number(sale.amount_paid || 0) || 0;
        const remaining = sale.remaining_balance !== undefined && sale.remaining_balance !== null
          ? (Number(sale.remaining_balance) || 0)
          : Math.max(0, total - paid);

        if (status === "paid") return 0;
        if (status === "partial") return Math.max(0, remaining);
        // unpaid and anything else
        return Math.max(0, total);
      };

      // Determine delivery status based on whether this is a client order or store order
      // If store_id is null (direct client order), automatically mark as delivered
      // BUT if delivery_status is explicitly provided (for transfers/purchases), use that instead
      const finalStoreId = body.store_id || currentUser?.store_id || null;
      const finalDeliveryStatus = body.delivery_status || (finalStoreId === null ? "delivered" : "preparing");

      // Respect custom sale_number if provided. If missing, generate one.
      // NOTE: We also normalize common frontend field names so we never ignore a typed BL.
      const incomingSaleNumber = String(
        body.sale_number ?? body.saleNumber ?? body.blNumber ?? body.bl_number ?? ""
      ).trim();

      let finalSaleNumber = incomingSaleNumber;
      if (!finalSaleNumber) {
        try {
          const { data: nextBl, error: nextBlErr } = await supabase.rpc("consume_next_bl_number", {
            counter_id: "global",
          });
          if (nextBlErr) throw nextBlErr;
          finalSaleNumber = String(nextBl || "").trim();
        } catch (e) {
          console.error("[sales POST] Failed to allocate BL number, using timestamp fallback", e);
          finalSaleNumber = `BL-${Date.now()}`;
        }
      }

      // Debug to confirm what we received vs what we stored
      console.log("[sales POST] incomingSaleNumber:", incomingSaleNumber);
      console.log("[sales POST] finalSaleNumber:", finalSaleNumber);

      // For PURCHASE/TRANSFER documents, the UI may send both `quantity` and `caisse`.
      // We MUST NOT add them together. The real movement quantity is `caisse` when present.
      // Also: to prevent any UI calculation bugs, we compute total_amount server-side for these docs.
      const isPurchaseOrTransferDoc = finalSaleNumber.includes("PURCHASE-") || finalSaleNumber.includes("TRANSFER-");

      const computeDocTotal = () => {
        if (!Array.isArray(body.items) || body.items.length === 0) return null;
        const total = body.items.reduce((sum: number, it: any) => {
          const rawQty = it?.caisse ?? it?.quantity ?? 0;
          const qty = typeof rawQty === 'string' ? Number(String(rawQty).replace(',', '.')) : Number(rawQty);

          // For purchases/transfers, price usually comes from unitPrice/unit_price.
          // Keep a few aliases for robustness.
          const rawUnit = it?.unit_price ?? it?.unitPrice ?? it?.purchase_price ?? it?.price ?? it?.sale_price ?? 0;
          const unit = typeof rawUnit === 'string' ? Number(String(rawUnit).replace(',', '.')) : Number(rawUnit);

          const q = Number.isFinite(qty) ? qty : 0;
          const u = Number.isFinite(unit) ? unit : 0;
          return sum + (q * u);
        }, 0);
        return Number.isFinite(total) ? total : null;
      };

      const clientTotalRaw = body.total_amount;
      const clientTotal = typeof clientTotalRaw === 'string'
        ? Number(String(clientTotalRaw).replace(',', '.'))
        : Number(clientTotalRaw);

      const computedTotal = isPurchaseOrTransferDoc ? computeDocTotal() : null;
      const resolvedTotalAmount = (computedTotal !== null)
        ? computedTotal
        : (Number.isFinite(clientTotal) ? clientTotal : 0);

      console.log('[sales POST] totals:', { isPurchaseOrTransferDoc, clientTotal, computedTotal, resolvedTotalAmount });

      const { data, error } = await supabase
        .from("sales")
        .insert([
          {
            sale_number: finalSaleNumber,
            store_id: finalStoreId,
            // For PURCHASE/TRANSFER docs: persist source magasin so both magasins can see the operation.
            // This is required for GET /sales filtering (store_id OR source_store_id).
            source_store_id: body.source_store_id || null,
            // Persist remise/discount amount on the sale row so it is available in Sales history & exports.
            // Frontend variants: remise, remise_amount, discount_amount, totalRemise.
            // DB canonical column: total_remise (snake_case).
            total_remise: (() => {
              const v = body.totalRemise ?? body.total_remise ?? body.remise_amount ?? body.remiseAmount ?? body.discount_amount ?? body.discountAmount ?? body.remise ?? 0;
              const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
              return Number.isFinite(n) ? n : 0;
            })(),
            total_amount: resolvedTotalAmount,
            amount_paid: body.amount_paid || 0,
            payment_status: body.payment_status || "unpaid",
            delivery_status: finalDeliveryStatus,
            notes: body.notes,
            client_name: body.client_name || null,
            client_phone: body.client_phone || null,
            client_address: body.client_address || null,
            client_ice: body.client_ice || null,
            client_if_number: body.client_if_number || null,
            client_rc: body.client_rc || null,
            client_patente: body.client_patente || null,
            payment_method: body.payment_method || null,
            remaining_balance: body.remaining_balance || 0,
            // Track who created the BL and on behalf of which magasin (when admin is acting as magasin).
            created_by: currentUser?.id || null,
            created_by_role: currentUser?.role || null,
            created_for_store_id: body.store_id || null,
          },
        ])
        .select();

      if (error) {
        console.error("Insert error:", error);
        throw error;
      }

      const saleId = data?.[0]?.id;
      console.log("Sale created successfully with ID:", saleId);

      // ===== Client balance tracking (WE owe the client) =====
      // Only for real external sales (not PURCHASE/TRANSFER system rows).
      try {
        const saleNumber = String(body.sale_number || data?.[0]?.sale_number || "");
        const isPurchaseOrTransfer = saleNumber.includes("PURCHASE-") || saleNumber.includes("TRANSFER-");

        if (!isPurchaseOrTransfer && saleId) {
          const owedAmount = computeClientOwedAmount({
            total_amount: body.total_amount,
            amount_paid: body.amount_paid,
            remaining_balance: body.remaining_balance,
            payment_status: body.payment_status,
          });

          if (owedAmount > 0) {
            // Resolve client_id
            let clientId: string | null = (body.client_id ? String(body.client_id) : null);

            if (!clientId) {
              // Try match by phone, then by name (within the same store)
              const phone = String(body.client_phone || "").trim();
              const name = String(body.client_name || "").trim();

              if (finalStoreId && phone) {
                const { data: matched, error: matchErr } = await supabase
                  .from("clients")
                  .select("id")
                  .eq("store_id", finalStoreId)
                  .eq("phone", phone)
                  .limit(1)
                  .maybeSingle();

                if (!matchErr && matched?.id) clientId = String(matched.id);
              }

              if (!clientId && finalStoreId && name) {
                const { data: matched, error: matchErr } = await supabase
                  .from("clients")
                  .select("id")
                  .eq("store_id", finalStoreId)
                  .ilike("name", name)
                  .limit(1)
                  .maybeSingle();

                if (!matchErr && matched?.id) clientId = String(matched.id);
              }
            }

            if (clientId) {
              const { data: clientRow, error: clientErr } = await supabase
                .from("clients")
                .select("id, balance")
                .eq("id", clientId)
                .maybeSingle();

              if (!clientErr && clientRow) {
                const currentBalance = Number(clientRow.balance || 0) || 0;
                const newBalance = currentBalance + owedAmount;

                const { error: updErr } = await supabase
                  .from("clients")
                  .update({ balance: newBalance, updated_at: new Date().toISOString() })
                  .eq("id", clientId);

                if (updErr) {
                  console.error("[sales POST] failed to update client balance:", updErr.message);
                } else {
                  console.log("[sales POST] client balance updated", {
                    clientId,
                    currentBalance,
                    owedAmount,
                    newBalance,
                  });
                }
              }
            } else {
              console.warn("[sales POST] could not resolve client_id; client balance not updated", {
                saleId,
                finalStoreId,
                client_name: body.client_name,
                client_phone: body.client_phone,
              });
            }
          }
        }
      } catch (clientBalanceErr: any) {
        console.error("[sales POST] client balance tracking failed:", clientBalanceErr);
      }

      // Save items to sale_items table with all required columns
      if (body.items && body.items.length > 0 && saleId) {
        console.log("Saving items to sale_items table...");
        console.log("Items to process:", JSON.stringify(body.items, null, 2));
        
        // Fetch product details for each item
        const saleItemsToInsert = [];
        for (const item of body.items) {
          // IMPORTANT:
          // Some frontends send a UI row id (timestamp) in `item.id`.
          // The real product UUID is `item.product_id`.
          // Always prefer `product_id` when present.
          const productId = item.product_id || item.id;
          console.log(`Processing item with productId: ${productId}, item data:`, JSON.stringify(item, null, 2));
          
          let productData = null;
          
          // Fetch product details from database
          if (productId) {
            const { data: fetchedProduct, error: productError } = await supabase
              .from("products")
              .select("reference, category, lot, number_of_boxes, avg_net_weight_per_box, fourchette_min, fourchette_max, name, sale_price")
              .eq("id", productId)
              .single();

            if (productError) {
              console.warn(`Could not fetch product ${productId}:`, productError.message);
              console.warn(`Product lookup failed - will use item data as fallback`);
            } else {
              console.log(`Successfully fetched product ${productId}:`, JSON.stringify(fetchedProduct, null, 2));
              productData = fetchedProduct;
            }
          } else {
            console.warn(`No productId provided in item:`, JSON.stringify(item, null, 2));
          }

          // Build sale item with proper fallbacks
          // IMPORTANT:
          // - For normal sales, the "movement" is the sold quantity.
          // - Never fallback caisse to productData.number_of_boxes (that's current stock, not movement).
          // - If caisse is not provided, fallback to quantity.
          const saleItem = {
            sale_id: saleId,
            product_id: productId || null,
            name: item.name || productData?.name || 'Produit inconnu',
            reference: item.reference || productData?.reference || null,
            category: item.category || productData?.category || null,
            lot: item.lot || productData?.lot || null,
            // Preserve decimals: caisse can be a decimal value
            caisse: (parseFloat(String(item.caisse ?? '').replace(',', '.')) || 0) || (parseFloat(String(item.quantity ?? '').replace(',', '.')) || 0) || 0,
            moyenne: parseFloat(item.moyenne) || parseFloat(item.avg_net_weight_per_box) || parseFloat(productData?.avg_net_weight_per_box) || null,
            fourchette_min: parseFloat(item.fourchette_min) || parseFloat(productData?.fourchette_min) || null,
            fourchette_max: parseFloat(item.fourchette_max) || parseFloat(productData?.fourchette_max) || null,
            quantity: parseFloat(item.quantity) || 0,
            unit_price: parseFloat(item.unitPrice) || parseFloat(item.unit_price) || parseFloat(item.sale_price) || parseFloat(productData?.sale_price) || 0,
            total_price: parseFloat(item.subtotal) || parseFloat(item.total_price) || 0,
            subtotal: parseFloat(item.subtotal) || parseFloat(item.total_price) || 0,
          };
          
          console.log(`Sale item to insert:`, JSON.stringify(saleItem, null, 2));
          saleItemsToInsert.push(saleItem);
        }

        console.log("All items to save in sale_items table:", JSON.stringify(saleItemsToInsert, null, 2));

        if (saleItemsToInsert.length > 0) {
          const { error: itemsError, data: insertedItems } = await supabase
            .from("sale_items")
            .insert(saleItemsToInsert)
            .select();

          if (itemsError) {
            console.error("Error inserting sale items:", itemsError);
            console.error("Items error details:", JSON.stringify(itemsError, null, 2));
            console.warn("Sale created but items could not be saved to sale_items table");
          } else {
            console.log("Sale items saved successfully to sale_items table");
            console.log("Inserted items:", JSON.stringify(insertedItems, null, 2));

            // IMPORTANT: Make DB total_amount authoritative for PURCHASE/TRANSFER docs.
            // Some clients historically double-count by mixing `quantity` and `caisse`.
            // We recompute from saved sale_items using (caisse ?? quantity) * unit_price and overwrite sales.total_amount.
            // Do NOT rely on returned inserted rows; read back from DB to be deterministic.
            try {
              const snFinal = String(data?.[0]?.sale_number || finalSaleNumber || "");
              const isPT = snFinal.includes('PURCHASE-') || snFinal.includes('TRANSFER-');
              if (isPT && saleId) {
                const { data: dbItems, error: dbItemsErr } = await supabase
                  .from('sale_items')
                  .select('caisse, quantity, unit_price')
                  .eq('sale_id', saleId)
                  .limit(5000);

                if (dbItemsErr) {
                  console.error('[sales POST] could not load sale_items for total recompute:', dbItemsErr);
                } else {
                  const totalFromDb = (dbItems || []).reduce((sum: number, it: any) => {
                    const rawQty = it?.caisse ?? it?.quantity ?? 0;
                    const qty = typeof rawQty === 'string' ? Number(String(rawQty).replace(',', '.')) : Number(rawQty);
                    const unit = typeof it?.unit_price === 'string'
                      ? Number(String(it.unit_price).replace(',', '.'))
                      : Number(it?.unit_price ?? 0);
                    const q = Number.isFinite(qty) ? qty : 0;
                    const u = Number.isFinite(unit) ? unit : 0;
                    return sum + (q * u);
                  }, 0);

                  const computed = Number.isFinite(totalFromDb) ? totalFromDb : 0;

                  // Load current stored total for debugging
                  const { data: saleRow, error: saleRowErr } = await supabase
                    .from('sales')
                    .select('total_amount')
                    .eq('id', saleId)
                    .maybeSingle();

                  if (saleRowErr) {
                    console.error('[sales POST] could not load sale row for debug:', saleRowErr);
                  }

                  const before = Number(saleRow?.total_amount ?? 0) || 0;

                  const { error: updTotalErr } = await supabase
                    .from('sales')
                    .update({ total_amount: computed, updated_at: new Date().toISOString() })
                    .eq('id', saleId);

                  if (updTotalErr) {
                    console.error('[sales POST] failed to overwrite total_amount from DB sale_items:', updTotalErr);
                  } else {
                    console.log('[sales POST] total_amount overwritten from DB sale_items:', {
                      saleId,
                      before,
                      computed,
                      itemsCount: (dbItems || []).length,
                    });
                  }
                }
              }
            } catch (e) {
              console.error('[sales POST] overwrite total_amount failed:', e);
            }
          }
        }

        // Also save items to the items JSONB column for backward compatibility
        const itemsToSave = body.items.map((item: any) => ({
          // keep legacy JSONB id as the real product uuid when available
          id: item.product_id || item.id,
          name: item.name || item.description || 'Produit',
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || parseFloat(item.unit_price) || 0,
          subtotal: parseFloat(item.subtotal) || parseFloat(item.total_price) || 0,
          caisse: item.caisse || item.number_of_boxes || 0,
          moyenne: item.moyenne || item.avg_net_weight_per_box || 0,
          reference: item.reference || null,
          category: item.category || null,
          lot: item.lot || null,
          fourchette_min: item.fourchette_min || null,
          fourchette_max: item.fourchette_max || null,
        }));

        const { data: updatedSale, error: updateError } = await supabase
          .from("sales")
          .update({ items: itemsToSave })
          .eq("id", saleId)
          .select();

        if (updateError) {
          console.error("Error updating sale with items JSONB:", updateError);
          console.warn("Sale items saved to sale_items table but JSONB update failed");
        } else {
          console.log("Sale updated with items JSONB successfully");
        }
      } else {
        console.log("No items to save - body.items:", body.items, "saleId:", saleId);
      }

      // Fetch the complete sale with items
      const { data: completeSale, error: fetchError } = await supabase
      .from("sales")
      // sales has multiple FKs to stores (store_id, source_store_id, created_for_store_id),
      // so we must disambiguate the embed.
      .select("*, stores!sales_store_id_fkey(*), sale_items(*)")
      .eq("id", saleId)
      .single();

      if (fetchError) {
        console.error("Error fetching complete sale:", fetchError);
      }

      console.log("Complete sale with items:", JSON.stringify(completeSale, null, 2));
      console.log("=== END SALES POST DEBUG ===");

      // ===== Secure stock operations for PURCHASE / TRANSFER =====
      // Purchases/transfers are stored as sales with sale_number prefix.
      // We must NEVER update store_stocks from the client (anon key). Do it here with service role.
      // Additionally: when creating a Purchase/Transfer, we must also decrement the source product's `number_of_boxes`
      // ("caisse" in UI) so the Products page reflects the change immediately after confirmation.
      //
      // ===== ALSO: decrement product "caisse" for normal SALES =====
      // SalesModule can send a per-line `caisse` value. When a sale is confirmed (created),
      // we want Products page to reflect the new caisse automatically.
      try {
        // Use the final persisted sale number for all logic.
        // The request body can be missing sale_number or use a different field name.
        const saleNumber = String(data?.[0]?.sale_number || body.sale_number || "");
        const isPurchaseOrTransfer = saleNumber.includes("PURCHASE-") || saleNumber.includes("TRANSFER-");

        const decrementProductBoxes = async (productId: string, dec: number) => {
          if (!productId || dec <= 0) return;

          const { data: prod, error: prodErr } = await supabase
            .from("products")
            .select("id, number_of_boxes")
            .eq("id", productId)
            .maybeSingle();

          if (prodErr) throw prodErr;
          if (!prod) return;

          const currentBoxes = Number(prod.number_of_boxes || 0) || 0;
          const newBoxes = Math.max(0, currentBoxes - dec);

          const { error: updErr } = await supabase
            .from("products")
            .update({ number_of_boxes: newBoxes, updated_at: new Date().toISOString() })
            .eq("id", productId);

          if (updErr) throw updErr;
        };

        // For normal sales (not purchase/transfer), decrement stock by *CAISSE* (business rule).
        // Products page stock is driven by store_stocks.quantity, so we must also decrement store_stocks.
        // Stock movement:
        // - Normal sales: decrement the selling store
        // - Purchases/transfers: decrement SOURCE store (handled below), so this block must not be skipped.
        // We keep this block active and let the purchase/transfer section decide which store to debit.
        if (saleId) {
          const { data: saleItemsRows, error: saleItemsErr } = await supabase
            .from("sale_items")
            .select("product_id, caisse, quantity")
            .eq("sale_id", saleId);

          if (saleItemsErr) throw saleItemsErr;

          // Resolve which store(s) to decrement:
          // - Prefer sale.store_id (finalStoreId)
          // - Else fallback to created_for_store_id (body.store_id)
          // - Else fallback to decrement all store_stocks rows for the product (guaranteed to reflect in Products page)
          const targetStoreId: string | null = finalStoreId ? String(finalStoreId) : (body.store_id ? String(body.store_id) : null);

          for (const it of saleItemsRows || []) {
            const productId = String(it?.product_id || "");
            if (!productId) continue;

            const rawCaisse = (it as any)?.caisse;
            const rawQty = (it as any)?.quantity;
            const caisse = typeof rawCaisse === "string" ? parseFloat(rawCaisse) : Number(rawCaisse);
            const qty = typeof rawQty === "string" ? parseFloat(rawQty) : Number(rawQty);
            const dec = Number.isFinite(caisse) && caisse > 0 ? caisse : (Number.isFinite(qty) ? qty : 0);
            if (dec <= 0) continue;

            if (targetStoreId) {
              const { data: row, error: rowErr } = await supabase
                .from("store_stocks")
                .select("id, quantity")
                .eq("product_id", productId)
                .eq("store_id", targetStoreId)
                .maybeSingle();

              if (rowErr && rowErr.code !== 'PGRST116') throw rowErr;

              const currentQty = Number(row?.quantity || 0) || 0;
              const newQty = Math.max(0, currentQty - dec);

              if (row?.id) {
                const { error: updErr } = await supabase
                  .from("store_stocks")
                  .update({ quantity: newQty })
                  .eq("id", row.id);
                if (updErr) throw updErr;
              } else {
                const { error: insErr } = await supabase
                  .from("store_stocks")
                  .insert([{ product_id: productId, store_id: targetStoreId, quantity: newQty }]);
                if (insErr) throw insErr;
              }
            } else {
              // Guaranteed fallback: decrement all store stocks rows for the product
              const { data: rows, error: rowsErr } = await supabase
                .from("store_stocks")
                .select("id, quantity")
                .eq("product_id", productId);

              if (rowsErr) throw rowsErr;

              for (const r of rows || []) {
                const currentQty = Number(r.quantity || 0) || 0;
                const newQty = Math.max(0, currentQty - dec);
                const { error: updErr } = await supabase
                  .from("store_stocks")
                  .update({ quantity: newQty })
                  .eq("id", r.id);
                if (updErr) throw updErr;
              }
            }

            // Keep product-level caisse in sync too
            await decrementProductBoxes(productId, dec);
          }
        }

        if (isPurchaseOrTransfer && saleId) {
          // For PURCHASE/TRANSFER, stock must be moved:
          // - decrement SOURCE store (source_store_id)
          // - increment DEST store (store_id)
          const sourceStoreId = body.source_store_id || null;
          const destStoreId = body.store_id || null;

          // Load all sale items for this sale
          const { data: sItems, error: sItemsErr } = await supabase
            .from("sale_items")
            .select("product_id, caisse, quantity")
            .eq("sale_id", saleId);

          if (sItemsErr) throw sItemsErr;

          // Helper to decrement products.number_of_boxes (caisse) safely
          // NOTE: function is defined above (shared with normal sales logic)

          // 1) Deduct from source store
          if (sourceStoreId) {
            for (const it of sItems || []) {
              const moveQty = getMovementQty(it);
              if (!it.product_id || moveQty <= 0) continue;

              const { data: stockRow, error: stockErr } = await supabase
                .from("store_stocks")
                .select("id, quantity")
                .eq("product_id", it.product_id)
                .eq("store_id", sourceStoreId)
                .maybeSingle();

              if (stockErr && stockErr.code !== 'PGRST116') throw stockErr;

              const currentQty = stockRow?.quantity ?? 0;
              const newQty = Math.max(0, currentQty - moveQty);

              if (stockRow?.id) {
                const { error: updErr } = await supabase
                  .from("store_stocks")
                  .update({ quantity: newQty })
                  .eq("id", stockRow.id);
                if (updErr) throw updErr;
              } else {
                const { error: insErr } = await supabase
                  .from("store_stocks")
                  .insert([{ product_id: it.product_id, store_id: sourceStoreId, quantity: newQty }]);
                if (insErr) throw insErr;
              }

              // Also decrement product-level caisse (number_of_boxes)
              // NOTE: `moveQty` here represents the number of "caisses" for purchase/transfer items.
              await decrementProductBoxes(String(it.product_id), moveQty);
            }
          }

          // 2) For TRANSFER/PURCHASE, add to destination store
          // IMPORTANT:
          // - Facture/BonCommande suggestions come from /products, which returns ONLY products rows
          //   (not store_stocks-only entries). If the destination store doesn't have a products row
          //   for this product, the item won't appear in suggestions even if store_stocks increased.
          // - Therefore we must ensure a destination-store product exists when receiving a transfer/purchase.
          const isPurchaseOrTransfer = saleNumber.includes("PURCHASE-") || saleNumber.includes("TRANSFER-");

          if (isPurchaseOrTransfer && destStoreId) {
            for (const it of sItems || []) {
              const moveQty = getMovementQty(it);
              if (!it.product_id || moveQty <= 0) continue;

              // Ensure destination store has a products row.
              // In this codebase, each store owns its own product rows.
              let destProductId = String(it.product_id);

              try {
                // IMPORTANT: product IDs differ per store in this codebase.
                // `it.product_id` is the SOURCE store's product id.
                // So we must locate (or create) the DEST store's product by a stable key.
                const srcProductId = String(destProductId);

                const { data: srcProduct, error: srcErr } = await supabase
                  .from('products')
                  .select('*')
                  .eq('id', srcProductId)
                  .maybeSingle();
                if (srcErr) throw srcErr;

                // Prefer reference as the stable key (fallback to name).
                const srcReference = srcProduct?.reference ? String(srcProduct.reference).trim() : '';
                const srcName = srcProduct?.name ? String(srcProduct.name).trim() : '';

                let destExisting: any = null;

                if (srcReference) {
                  const { data: byRef, error: byRefErr } = await supabase
                    .from('products')
                    .select('id')
                    .eq('store_id', destStoreId)
                    .eq('reference', srcReference)
                    .maybeSingle();
                  if (byRefErr && byRefErr.code !== 'PGRST116') throw byRefErr;
                  destExisting = byRef;
                }

                if (!destExisting?.id && srcName) {
                  const { data: byName, error: byNameErr } = await supabase
                    .from('products')
                    .select('id')
                    .eq('store_id', destStoreId)
                    .eq('name', srcName)
                    .maybeSingle();
                  if (byNameErr && byNameErr.code !== 'PGRST116') throw byNameErr;
                  destExisting = byName;
                }

                if (destExisting?.id) {
                  destProductId = String(destExisting.id);
                } else if (srcProduct) {
                  const cloned: any = {
                    name: srcProduct.name,
                    reference: srcProduct.reference,
                    stock_reference: srcProduct.stock_reference || null,
                    category: srcProduct.category,
                    quantity_available: 0,
                    purchase_price: srcProduct.purchase_price || 0,
                    sale_price: srcProduct.sale_price || 0,
                    supplier_id: srcProduct.supplier_id || null,
                    number_of_boxes: srcProduct.number_of_boxes || 0,
                    total_net_weight: srcProduct.total_net_weight || 0,
                    avg_net_weight_per_box: srcProduct.avg_net_weight_per_box || 0,
                    max_purchase_limit: srcProduct.max_purchase_limit || null,
                    fourchette_min: srcProduct.fourchette_min || null,
                    fourchette_max: srcProduct.fourchette_max || null,
                    van_delivery_attachment_url: srcProduct.van_delivery_attachment_url || null,
                    van_delivery_attachment_type: srcProduct.van_delivery_attachment_type || null,
                    van_delivery_notes: srcProduct.van_delivery_notes || null,
                    lot: srcProduct.lot || null,
                    created_by: srcProduct.created_by || null,
                    store_id: destStoreId,
                  };

                  const { data: insertedDest, error: insProdErr } = await supabase
                    .from('products')
                    .insert([cloned])
                    .select('id')
                    .maybeSingle();

                  if (insProdErr) throw insProdErr;
                  if (insertedDest?.id) destProductId = String(insertedDest.id);
                }
              } catch (e) {
                console.error('[sales POST] ensure dest product failed:', e);
              }

              const { data: destRow, error: destErr } = await supabase
                .from("store_stocks")
                .select("id, quantity")
                .eq("product_id", destProductId)
                .eq("store_id", destStoreId)
                .maybeSingle();

              if (destErr && destErr.code !== 'PGRST116') throw destErr;

              const currentQty = Number(destRow?.quantity ?? 0) || 0;
              const newQty = currentQty + moveQty;

              if (destRow?.id) {
                const { error: updErr } = await supabase
                  .from("store_stocks")
                  .update({ quantity: newQty })
                  .eq("id", destRow.id);
                if (updErr) throw updErr;
              } else {
                const { error: insErr } = await supabase
                  .from("store_stocks")
                  .insert([{ product_id: destProductId, store_id: destStoreId, quantity: newQty }]);
                if (insErr) throw insErr;
              }
            }
          }
        }
      } catch (stockErr: any) {
        console.error("[sales POST] purchase/transfer stock update failed:", stockErr);
      }

      return jsonResponse({ success: true, sale: completeSale || data?.[0] });
    } catch (error: any) {
      console.error("Error creating sale:", error);
      console.log("=== END SALES POST DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/sales/") && method === "PUT") {
    try {
      const saleId = path.split("/")[2];
      const body = await req.json();
      const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      };
      
      // ===== Client balance reconciliation (scaffold) =====
      // We will later use these to adjust client.balance when a sale is edited.
      // (client change A->B, or totals/payment changes)
      const computeClientOwedAmount = (sale: {
      total_amount?: any;
      amount_paid?: any;
      remaining_balance?: any;
      payment_status?: any;
      }) => {
      const status = String(sale.payment_status || "unpaid").toLowerCase();
      
      const rem =
      sale.remaining_balance !== undefined && sale.remaining_balance !== null
      ? Number(sale.remaining_balance)
      : NaN;
      
      const total = Number(sale.total_amount || 0) || 0;
      const paid = Number(sale.amount_paid || 0) || 0;
      const computedRemaining = Number.isFinite(rem) ? Math.max(0, rem) : Math.max(0, total - paid);
      
      if (status === "paid") return 0;
      if (status === "partial" || status === "unpaid") return computedRemaining;
      return computedRemaining;
      };
      
      const { data: beforeSale, error: beforeErr } = await supabase
      .from("sales")
      .select("id, store_id, client_id, client_name, total_amount, amount_paid, remaining_balance, payment_status")
      .eq("id", saleId)
      .maybeSingle();
      if (beforeErr) throw beforeErr;
      
      const resolveClientId = async (saleRow: any): Promise<string | null> => {
      const directId = saleRow?.client_id ? String(saleRow.client_id) : null;
      if (directId) return directId;
      
      const name = String(saleRow?.client_name || "").trim();
      const storeId = saleRow?.store_id ? String(saleRow.store_id) : null;
      if (!name) return null;
      
      let q = supabase
      .from("clients")
      .select("id")
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1);
      
      if (storeId) q = q.eq("store_id", storeId);
      
      const { data: c, error: cErr } = await q.maybeSingle();
      if (cErr) return null;
      return c?.id ? String(c.id) : null;
      };
      
      const oldOwed = beforeSale ? computeClientOwedAmount(beforeSale) : 0;
      const oldClientId = beforeSale ? await resolveClientId(beforeSale) : null;
      
      console.log("=== SALES UPDATE DEBUG ===");
      console.log("Sale ID:", saleId);
      console.log("Request body:", JSON.stringify(body, null, 2));
      console.log("[sales PUT] old owed/balance inputs:", { oldClientId, oldOwed, beforePaymentStatus: beforeSale?.payment_status });
      
      if (body.sale_number !== undefined) updateData.sale_number = body.sale_number;
      if (body.store_id !== undefined) updateData.store_id = body.store_id;
      
      // Allow editing client info (required to move totals between clients when editing a BL)
      if (body.client_id !== undefined) updateData.client_id = body.client_id || null;
      if (body.client_name !== undefined) updateData.client_name = body.client_name || null;
      if (body.client_phone !== undefined) updateData.client_phone = body.client_phone || null;
      if (body.client_address !== undefined) updateData.client_address = body.client_address || null;
      if (body.client_ice !== undefined) updateData.client_ice = body.client_ice || null;
      if (body.client_if_number !== undefined || body.client_if !== undefined) updateData.client_if_number = body.client_if_number ?? body.client_if ?? null;
      if (body.client_rc !== undefined) updateData.client_rc = body.client_rc || null;
      if (body.client_patente !== undefined) updateData.client_patente = body.client_patente || null;
      
      // Persist remise/discount amount when updating a sale.
      // Accept common frontend field names; save into DB column `total_remise`.
      if (
      body.totalRemise !== undefined || body.total_remise !== undefined ||
      body.remise_amount !== undefined || body.remiseAmount !== undefined ||
      body.discount_amount !== undefined || body.discountAmount !== undefined ||
      body.remise !== undefined
      ) {
      const v = body.totalRemise ?? body.total_remise ?? body.remise_amount ?? body.remiseAmount ?? body.discount_amount ?? body.discountAmount ?? body.remise ?? 0;
      const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
      updateData.total_remise = Number.isFinite(n) ? n : 0;
      }
      // If items are sent during edit, we must recompute totals safely and keep sale_items in sync.
      const parseNum = (v: any) => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'string') return Number(v.replace(',', '.')) || 0;
      return Number(v) || 0;
      };
      
      const normalizeSaleItems = (raw: any): any[] => {
      const arr = Array.isArray(raw) ? raw : [];
      return arr.map((it: any) => {
      const quantity = parseNum(it?.quantity);
      const caisse = (it?.caisse === null || it?.caisse === undefined || it?.caisse === '')
      ? null
      : parseNum(it?.caisse);
      
      // Frontend can send `unitPrice` or `unit_price`
      const unit_price = it?.unit_price !== undefined ? parseNum(it.unit_price) : parseNum(it?.unitPrice);
      
      const effectiveQty = (caisse !== null && caisse !== 0) ? caisse : quantity;
      const subtotal = effectiveQty * unit_price;
      
      return {
      ...it,
      quantity,
      caisse,
      unit_price,
      subtotal,
      };
      });
      };
      
      const computeItemsTotal = (items: any[]) => {
      return (items || []).reduce((sum: number, it: any) => sum + (parseNum(it?.subtotal) || 0), 0);
      };
      
      if (Array.isArray(body?.items)) {
      const normItems = normalizeSaleItems(body.items);
      body.items = normItems;
      
      const computedTotal = computeItemsTotal(normItems);
      updateData.total_amount = Number(computedTotal.toFixed(2));
      
      // Keep remaining_balance coherent if amount_paid provided
      if (body.amount_paid !== undefined) {
      const paid = parseNum(body.amount_paid);
      updateData.amount_paid = Number(paid.toFixed(2));
      updateData.remaining_balance = Number(Math.max(0, computedTotal - paid).toFixed(2));
      }
      }
      
      // If caller updates amount_paid without sending items, keep old behavior.
      if (body.amount_paid !== undefined && updateData.amount_paid === undefined) updateData.amount_paid = body.amount_paid;
      if (body.payment_status !== undefined) {
        updateData.payment_status = body.payment_status;
        console.log("Setting payment_status to:", body.payment_status);
      }
      if (body.delivery_status !== undefined) updateData.delivery_status = body.delivery_status;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.payment_notes !== undefined) updateData.payment_notes = body.payment_notes;
      
      if (body.delivery_status === "delivered" && body.received_by) {
        updateData.received_by = body.received_by;
        updateData.received_date = new Date().toISOString();
        updateData.delivery_confirmed_by = body.delivery_confirmed_by || null;
      }
      
      const { data, error } = await supabase
      .from("sales")
      .update(updateData)
      .eq("id", saleId)
      .select();
      
      if (error) throw error;
      
      // Sync sale_items if items were provided
      if (Array.isArray(body?.items)) {
      try {
      const itemsToInsert = normalizeSaleItems(body.items).map((it: any) => ({
      sale_id: saleId,
      product_id: it?.product_id || null,
      name: it?.name || it?.product_name || null,
      reference: it?.reference || null,
      caisse: it?.caisse,
      quantity: it?.quantity,
      unit_price: it?.unit_price,
      subtotal: it?.subtotal,
      }));
      
      await supabase.from('sale_items').delete().eq('sale_id', saleId);
      if (itemsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('sale_items').insert(itemsToInsert);
      if (insErr) {
      console.error('[sales PUT] sale_items insert failed:', insErr);
      }
      }
      } catch (e) {
      console.error('[sales PUT] sale_items sync failed:', e);
      }
      }

      console.log("=== SALES UPDATE RESULT ===");
      console.log("Updated sale data:", JSON.stringify(data?.[0], null, 2));
      console.log("Payment status in DB:", data?.[0]?.payment_status);
      console.log("=== END SALES UPDATE RESULT ===");
      
      // ===== Client balance reconciliation (apply) =====
      // This prevents wrong "total facture" when editing a BL:
      // - If client changed: remove old owed from old client, add new owed to new client.
      // - If same client: apply delta.
      try {
      const { data: afterSale, error: afterErr } = await supabase
      .from("sales")
      .select("id, store_id, client_id, client_name, total_amount, amount_paid, remaining_balance, payment_status, sale_number")
      .eq("id", saleId)
      .maybeSingle();
      if (afterErr) throw afterErr;
      
      const saleNumber = String(afterSale?.sale_number || beforeSale?.sale_number || '');
      const isInternalDoc =
      saleNumber.startsWith('TRANSFER-') ||
      saleNumber.startsWith('PURCHASE-') ||
      saleNumber.startsWith('TRANSFER-ADMIN-');
      
      if (!isInternalDoc) {
      const newOwed = afterSale ? computeClientOwedAmount(afterSale) : 0;
      const newClientId = afterSale ? await resolveClientId(afterSale) : null;
      
      console.log('[sales PUT] new owed/balance inputs:', { newClientId, newOwed, afterPaymentStatus: afterSale?.payment_status });
      
      const adjustClientBalance = async (clientId: string, delta: number) => {
      if (!clientId) return;
      const d = Number(delta) || 0;
      if (!Number.isFinite(d) || d === 0) return;
      
      const { data: cRow, error: cErr } = await supabase
      .from('clients')
      .select('id, balance')
      .eq('id', clientId)
      .maybeSingle();
      if (cErr || !cRow) return;
      
      const current = Number((cRow as any).balance || 0) || 0;
      const next = current + d;
      
      const { error: updErr } = await supabase
      .from('clients')
      .update({ balance: next, updated_at: new Date().toISOString() } as any)
      .eq('id', clientId);
      
      if (updErr) {
      console.error('[sales PUT] failed to update client balance', { clientId, delta: d, error: updErr.message });
      } else {
      console.log('[sales PUT] client balance updated', { clientId, from: current, to: next, delta: d });
      }
      };
      
      if (oldClientId && newClientId && String(oldClientId) !== String(newClientId)) {
      await adjustClientBalance(oldClientId, -oldOwed);
      await adjustClientBalance(newClientId, +newOwed);
      } else {
      const targetId = newClientId || oldClientId;
      if (targetId) {
      await adjustClientBalance(String(targetId), newOwed - oldOwed);
      }
      }
      }
      } catch (balanceErr) {
      console.error('[sales PUT] client balance reconciliation failed:', balanceErr);
      }
      
      // STEP: Deduct stock from seller when payment is confirmed
      if (body.payment_status === "paid" || body.payment_status === "partial") {
        try {
          const { data: saleItems, error: itemsError } = await supabase
            .from("sale_items")
            .select("*")
            .eq("sale_id", saleId);

          if (itemsError) throw itemsError;

          if (saleItems && saleItems.length > 0) {
            for (const item of saleItems) {
              // Get seller's store ID from product creator
              const { data: productData, error: productError } = await supabase
                .from("products")
                .select("created_by")
                .eq("id", item.product_id)
                .single();

              if (productError) {
                console.error("Error fetching product creator:", productError);
                continue;
              }

              // Get the seller's store ID
              const { data: userData, error: userError } = await supabase
                .from("users")
                .select("store_id")
                .eq("id", productData?.created_by)
                .single();

              if (userError) {
                console.error("Error fetching user store:", userError);
                continue;
              }

              const productSellerStoreId = userData?.store_id;

              if (!productSellerStoreId) {
                console.warn(`No store found for product creator`);
                continue;
              }

              // Decrease seller's stock when payment is confirmed
              const { data: sellerStock, error: sellerError } = await supabase
                .from("store_stocks")
                .select("quantity")
                .eq("product_id", item.product_id)
                .eq("store_id", productSellerStoreId)
                .single();

              if (!sellerError && sellerStock) {
                const newSellerQuantity = Math.max(0, sellerStock.quantity - item.quantity);
                await supabase
                  .from("store_stocks")
                  .update({ quantity: newSellerQuantity })
                  .eq("product_id", item.product_id)
                  .eq("store_id", productSellerStoreId);
                console.log(`✓ Seller store ${productSellerStoreId}: Product ${item.product_id} ${sellerStock.quantity} -> ${newSellerQuantity}`);
              } else {
                console.warn(`No store_stocks entry found for product ${item.product_id} in seller store ${productSellerStoreId}`);
              }

              // NOTE: Do NOT update products.quantity_available
              // Only update store_stocks to keep total stock accurate
              console.log(`✓ Stock deducted from seller store only (store_stocks table)`);
            }
          }
        } catch (stockError: any) {
          console.error("Error decreasing stock:", stockError);
        }
      }

      return jsonResponse({ success: true, sale: data?.[0] });
    } catch (error: any) {
      console.error("Error updating sale:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/sales/") && path.includes("/items") && method === "POST") {
    try {
      const saleId = path.split("/")[2];
      const body = await req.json();
      
      const { error } = await supabase
        .from("sale_items")
        .insert(body.items);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error creating sale items:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/sales/") && path.includes("/confirm-delivery") && method === "POST") {
    try {
      const saleId = path.split("/")[2];
      const body = await req.json();

      console.log("=== DELIVERY CONFIRMATION DEBUG ===");
      console.log(`Sale ID: ${saleId}`);
      console.log(`Buyer Store ID from request: ${body.buyer_store_id}`);

      // Get the sale
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .single();

      if (saleError) throw saleError;

      // Get current user to determine buyer store ID if not provided
      const currentUser = await getCurrentUserWithRole(req);
      const buyerStoreId = body.buyer_store_id || currentUser?.store_id;
      
      console.log(`Final buyer store ID: ${buyerStoreId}`);
      console.log(`Current user store: ${currentUser?.store_id}`);

      // Update sale delivery status
      const { data: updatedSale, error: updateError } = await supabase
        .from("sales")
        .update({
          delivery_status: "delivered",
          received_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", saleId)
        .select();

      if (updateError) throw updateError;

      // Get sale items
      const { data: saleItems, error: itemsError } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId);

      if (itemsError) throw itemsError;

      if (saleItems && saleItems.length > 0 && buyerStoreId) {
      console.log(`Transferring stock from seller to buyer store ${buyerStoreId}`);
      
      // Prevent double apply
      const existingNotes = String((saleData as any)?.notes || '');
      if (existingNotes.includes('dest_stock_applied=1')) {
      console.log('Destination stock already applied (dest_stock_applied=1). Skipping.');
      } else {
      for (const item of saleItems) {
      const srcProductId = String(item.product_id || '').trim();
      if (!srcProductId) continue;
      
      const moveQty = Number((item as any)?.caisse ?? item.quantity ?? 0) || 0;
      if (!Number.isFinite(moveQty) || moveQty <= 0) continue;
      
      console.log(`Processing item (srcProductId=${srcProductId}) qty=${moveQty}`);
      
      // IMPORTANT: product ids are per-store. We must resolve/create the BUYER store product by reference/name.
      let buyerProductId = srcProductId;
      
      try {
      const { data: srcProduct, error: srcErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', srcProductId)
      .maybeSingle();
      if (srcErr) throw srcErr;
      
      const srcReference = srcProduct?.reference ? String(srcProduct.reference).trim() : '';
      const srcName = srcProduct?.name ? String(srcProduct.name).trim() : '';
      
      let destExisting: any = null;
      if (srcReference) {
      const { data: byRef, error: byRefErr } = await supabase
      .from('products')
      .select('id')
      .eq('store_id', buyerStoreId)
      .eq('reference', srcReference)
      .maybeSingle();
      if (byRefErr && byRefErr.code !== 'PGRST116') throw byRefErr;
      destExisting = byRef;
      }
      
      if (!destExisting?.id && srcName) {
      const { data: byName, error: byNameErr } = await supabase
      .from('products')
      .select('id')
      .eq('store_id', buyerStoreId)
      .eq('name', srcName)
      .maybeSingle();
      if (byNameErr && byNameErr.code !== 'PGRST116') throw byNameErr;
      destExisting = byName;
      }
      
      if (destExisting?.id) {
      buyerProductId = String(destExisting.id);
      } else if (srcProduct) {
      const cloned: any = {
      name: srcProduct.name,
      reference: srcProduct.reference,
      stock_reference: srcProduct.stock_reference || null,
      category: srcProduct.category,
      quantity_available: 0,
      purchase_price: srcProduct.purchase_price || 0,
      sale_price: srcProduct.sale_price || 0,
      supplier_id: srcProduct.supplier_id || null,
      number_of_boxes: 0,
      total_net_weight: srcProduct.total_net_weight || 0,
      avg_net_weight_per_box: srcProduct.avg_net_weight_per_box || 0,
      max_purchase_limit: srcProduct.max_purchase_limit || null,
      fourchette_min: srcProduct.fourchette_min || null,
      fourchette_max: srcProduct.fourchette_max || null,
      van_delivery_attachment_url: srcProduct.van_delivery_attachment_url || null,
      van_delivery_attachment_type: srcProduct.van_delivery_attachment_type || null,
      van_delivery_notes: srcProduct.van_delivery_notes || null,
      lot: srcProduct.lot || null,
      created_by: srcProduct.created_by || null,
      store_id: buyerStoreId,
      };
      
      const { data: insertedDest, error: insProdErr } = await supabase
      .from('products')
      .insert([cloned])
      .select('id')
      .maybeSingle();
      
      if (insProdErr) throw insProdErr;
      if (insertedDest?.id) buyerProductId = String(insertedDest.id);
      }
      } catch (e) {
      console.error('[confirm-delivery] resolve buyer product failed:', e);
      }
      
      // Upsert buyer store stock
      const { data: buyerRow, error: buyerErr } = await supabase
      .from('store_stocks')
      .select('id, quantity')
      .eq('product_id', buyerProductId)
      .eq('store_id', buyerStoreId)
      .maybeSingle();
      
      if (buyerErr && buyerErr.code !== 'PGRST116') {
      console.error(`Error fetching buyer stock: ${buyerErr.message}`);
      continue;
      }
      
      const currentQty = Number(buyerRow?.quantity ?? 0) || 0;
      const nextQty = currentQty + moveQty;
      
      if (buyerRow?.id) {
      const { error: updErr } = await supabase
      .from('store_stocks')
      .update({ quantity: nextQty })
      .eq('id', buyerRow.id);
      if (updErr) console.error(`Error updating stock for buyer: ${updErr.message}`);
      } else {
      const { error: insErr } = await supabase
      .from('store_stocks')
      .insert([{ product_id: buyerProductId, store_id: buyerStoreId, quantity: nextQty }]);
      if (insErr) console.error(`Error creating stock for buyer: ${insErr.message}`);
      }
      
      console.log(`✓ Buyer stock updated: product=${buyerProductId} store=${buyerStoreId} +${moveQty}`);
      }
      
      // Mark as applied
      try {
      const marker = 'dest_stock_applied=1';
      const prevNotes = String((saleData as any)?.notes || '').trim();
      const nextNotes = prevNotes.includes(marker) ? prevNotes : (prevNotes ? `${prevNotes} | ${marker}` : marker);
      await supabase
      .from('sales')
      .update({ notes: nextNotes, updated_at: new Date().toISOString() } as any)
      .eq('id', saleId);
      } catch (e) {
      console.warn('[confirm-delivery] failed to mark dest_stock_applied:', e);
      }
      }
      } else {
      console.warn(`No items to process or no buyer store ID. Items: ${saleItems?.length}, BuyerStoreId: ${buyerStoreId}`);
      }

      console.log("✓ Delivery confirmed - stock transferred to buyer");
      console.log("=== END DELIVERY CONFIRMATION DEBUG ===");
      return jsonResponse({ success: true, sale: updatedSale?.[0] });
    } catch (error: any) {
      console.error("Error confirming delivery:", error);
      console.log("=== END DELIVERY CONFIRMATION DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/sales/") && method === "DELETE") {
    try {
      const saleId = path.split("/")[2];
      const { error } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/checks" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      let query = supabase
        .from("checks")
        .select("*")
        .order("created_at", { ascending: false });

      // If user has a store_id and is not admin, filter by that store
      if (currentUser && currentUser.store_id && currentUser.role !== "admin") {
        query = query.eq("store_id", currentUser.store_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ checks: data || [] });
    } catch (error: any) {
      console.error("Error fetching checks:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/checks" && method === "POST") {
    try {
      const body = await req.json();
      const { data, error } = await supabase
        .from("checks")
        .insert([
          {
            check_number: body.check_number,
            amount: body.amount,
            issuer_name: body.issuer_name,
            bank_name: body.bank_name,
            due_date: body.due_date,
            status: "pending",
            store_id: body.store_id,
            notes: body.notes,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, check: data?.[0] });
    } catch (error: any) {
      console.error("Error creating check:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/checks/") && method === "PUT") {
    try {
      const checkId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("checks")
        .update({
          check_number: body.check_number,
          amount: body.amount,
          issuer_name: body.issuer_name,
          bank_name: body.bank_name,
          due_date: body.due_date,
          status: body.status,
          store_id: body.store_id,
          notes: body.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, check: data?.[0] });
    } catch (error: any) {
      console.error("Error updating check:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/checks/") && method === "DELETE") {
    try {
      const checkId = path.split("/")[2];
      const { error } = await supabase
        .from("checks")
        .delete()
        .eq("id", checkId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting check:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/transfers" && method === "GET") {
    try {
      const { data, error } = await supabase
        .from("transfers")
        .select("*, transfer_items(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ transfers: data || [] });
    } catch (error: any) {
      console.error("Error fetching transfers:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/transfers" && method === "POST") {
    try {
      const body = await req.json();
      const { data, error } = await supabase
        .from("transfers")
        .insert([
          {
            transfer_number: body.transfer_number,
            from_location: body.from_location,
            to_location: body.to_location,
            status: "pending",
            notes: body.notes,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, transfer: data?.[0] });
    } catch (error: any) {
      console.error("Error creating transfer:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/transfers/") && method === "PUT") {
    try {
      const transferId = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("transfers")
        .update({
          transfer_number: body.transfer_number,
          from_location: body.from_location,
          to_location: body.to_location,
          status: body.status,
          received_date: body.received_date,
          notes: body.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transferId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, transfer: data?.[0] });
    } catch (error: any) {
      console.error("Error updating transfer:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/transfers/") && method === "DELETE") {
    try {
      const transferId = path.split("/")[2];
      const { error } = await supabase
        .from("transfers")
        .delete()
        .eq("id", transferId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting transfer:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Client Global Payments (separate from invoices/BL/sales) =====
  if (path === "/client-global-payments" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const url = new URL(req.url);
      const clientId = url.searchParams.get("client_id");

      let query = supabase
        .from("client_global_payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      // Non-admin: scope to current store
      if (currentUser.role !== "admin") {
        if (!currentUser.store_id) return jsonResponse({ client_global_payments: [] });
        query = query.eq("paid_by_store_id", currentUser.store_id);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Enrich with actor email + admin marker
      const createdByIds = Array.from(
        new Set(
          (rows || [])
            .map((r: any) => r?.created_by)
            .filter((id: any) => id)
            .map((id: any) => String(id))
        )
      );

      const emailByUserId = new Map<string, string>();
      if (createdByIds.length > 0) {
        const { data: uRows, error: uErr } = await supabase
          .from("users")
          .select("id, email, role")
          .in("id", createdByIds);

        if (uErr) {
          console.warn("/client-global-payments GET could not fetch users:", uErr.message);
        }

        (uRows || []).forEach((u: any) => {
          if (u?.id && u?.email) emailByUserId.set(String(u.id), String(u.email));
        });
      }

      const roleByUserId = new Map<string, string>();
      if (createdByIds.length > 0) {
        const { data: uRows, error: uErr } = await supabase
          .from("users")
          .select("id, email, role")
          .in("id", createdByIds);

        if (uErr) {
          console.warn("/client-global-payments GET could not fetch users:", uErr.message);
        }

        (uRows || []).forEach((u: any) => {
          if (u?.id && u?.email) emailByUserId.set(String(u.id), String(u.email));
          if (u?.id && u?.role) roleByUserId.set(String(u.id), String(u.role));
        });
      }

      const enriched = (rows || []).map((p: any) => {
        const createdBy = p?.created_by ? String(p.created_by) : null;
        const created_by_email = p?.created_by_email || (createdBy ? (emailByUserId.get(createdBy) || null) : null);

        const actorRole = createdBy ? (roleByUserId.get(createdBy) || null) : null;
        const is_admin_payment = Boolean(p?.is_admin_payment) || actorRole === 'admin';

        return {
          ...p,
          created_by_email,
          is_admin_payment,
        };
      });

      return jsonResponse({ client_global_payments: enriched });
    } catch (error: any) {
      console.error("Error fetching client global payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/client-global-payments" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const clientId = String(body.client_id || "").trim();
      if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: "amount must be a positive number" }, 400);
      }

      const paymentMethod = String(body.payment_method || "cash");
      if (!["cash", "check", "bank_transfer", "other"].includes(paymentMethod)) {
        return jsonResponse({ error: "Invalid payment_method" }, 400);
      }

      const paymentDate = body.payment_date
        ? new Date(body.payment_date).toISOString()
        : new Date().toISOString();

      // Resolve paid_by_store (admin may act as a store; store users default to their store)
      const paidByStoreId = body.paid_by_store_id
        ? String(body.paid_by_store_id)
        : (currentUser.role === "admin" ? null : currentUser.store_id);

      const paidByStoreName = body.paid_by_store_name ? String(body.paid_by_store_name) : null;

      // Capture the actor email in DB at write-time (most reliable)
      const actorEmail = currentUser.email || null;

      const { data, error } = await supabase
        .from("client_global_payments")
        .insert([
          {
            client_id: clientId,
            amount,
            payment_method: paymentMethod,
            payment_date: paymentDate,
            notes: body.notes || null,
            paid_by_store_id: paidByStoreId,
            paid_by_store_name: paidByStoreName,
            created_by: currentUser.id,
            // Always prefer server-side resolved email; never trust client payload for audit
            created_by_email: actorEmail,
            is_admin_payment: Boolean(body.is_admin_payment) || (currentUser.role === "admin"),
            acted_as_store_id: body.acted_as_store_id ? String(body.acted_as_store_id) : null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return jsonResponse({ success: true, client_global_payment: data });
    } catch (error: any) {
      console.error("Error creating client global payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== Payments (Supplier settlements) =====
  // IMPORTANT (Option A): If payment_method === "check", enforce a check reference.
  // We accept:
  // - check_safe_id        (preferred when paying with a coffer check)
  // - check_inventory_id   (when paying with a check from check_inventory)
  // - check_number         (fallback/manual)
  // We store the reference into payments.check_ids_used as a JSON array (TEXT column).
  // This allows the frontend SupplierDetails "Chèques utilisés" tab to reliably display checks.
  //
  // NOTE: This option only stores the linkage (does not update check_safe_usages).

  if (path === "/payments" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const paymentMethod = String(body.payment_method || body.method || body.type || '').trim().toLowerCase();
      const isCheck = paymentMethod === 'check' || paymentMethod === 'cheque' || paymentMethod === 'chèque';

      // Enforce supplier_id for supplier settlements
      const supplierId = String(body.supplier_id || '').trim();
      if (!supplierId) {
        return jsonResponse({ error: "supplier_id is required" }, 400);
      }

      // Determine store context exactly like other store-scoped operations:
      // - admin can choose store_id
      // - non-admin is forced to their own store
      const requestedStoreId = body.store_id ? String(body.store_id) : null;
      const resolvedStoreId = (String(currentUser.role || '').toLowerCase() === 'admin')
        ? (requestedStoreId || currentUser.store_id || null)
        : (currentUser.store_id ? String(currentUser.store_id) : null);

      // If check payment, enforce a reference and normalize it.
      const checkSafeId = String(body.check_safe_id || body.selected_check_safe_id || '').trim() || null;
      const checkInventoryId = String(body.check_inventory_id || '').trim() || null;
      const checkNumber = String(body.check_number || body.check_reference || '').trim() || null;
      
      // Coffre cheques have a different lifecycle than check_inventory.
      // For supplier global payments from the Coffre, we MUST have a check_safe_id so we can:
      // - mark it as used (Type => Utilisé) via check_safe_usages
      // - keep the audit trail
      const cofferIdForEnforce = String(body.coffer_id || '').trim() || null;
      if (isCheck && cofferIdForEnforce && !checkSafeId) {
      return jsonResponse(
      { error: "For Coffre check payments, check_safe_id is required" },
      400
      );
      }

      let checkIdsUsed: string[] = [];
      if (isCheck) {
        if (checkSafeId) checkIdsUsed = [checkSafeId];
        else if (checkInventoryId) checkIdsUsed = [checkInventoryId];
        else if (checkNumber) checkIdsUsed = [checkNumber];

        if (checkIdsUsed.length === 0) {
          return jsonResponse(
            { error: "For check payments, provide check_safe_id or check_inventory_id or check_number" },
            400
          );
        }
      }

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: "amount must be > 0" }, 400);
      }

      const paymentRow: any = {
        store_id: resolvedStoreId,
        supplier_id: supplierId,
        amount,
        payment_method: paymentMethod || null,
        payment_date: body.payment_date || null,
        reference_number: body.reference_number || body.reference || null,
        notes: body.notes || null,
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
      };

      // Persist linkage using optional schema columns when available.
      // IMPORTANT: some environments do NOT have these columns.
      // We will try insert with them, and retry without if schema cache complains.
      if (isCheck) {
      (paymentRow as any).check_ids_used = JSON.stringify(checkIdsUsed);
      (paymentRow as any).paid_by_checks = true;
      (paymentRow as any).checks_count = checkIdsUsed.length;
      (paymentRow as any).amount_paid_by_checks = amount;
      }

      const firstTry = await supabase
      .from("payments")
      .insert([paymentRow])
      .select("*")
      .maybeSingle();
      
      if (firstTry.error) {
      // Backward compatibility: some DBs might not have the extra columns.
      // Retry without the optional check tracking columns if schema cache is missing.
      const msg = String(firstTry.error.message || '');
      const maybeSchemaMissing = msg.toLowerCase().includes('column') || msg.toLowerCase().includes('schema cache');
      
      if (maybeSchemaMissing) {
      const retryRow: any = { ...paymentRow };
      delete retryRow.check_ids_used;
      delete retryRow.paid_by_checks;
      delete retryRow.checks_count;
      delete retryRow.amount_paid_by_checks;
      
      const retry = await supabase
      .from("payments")
      .insert([retryRow])
      .select("*")
      .maybeSingle();
      
      if (retry.error) throw retry.error;
      return jsonResponse({ success: true, payment: retry.data });
      }
      
      throw firstTry.error;
      }

      // IMPORTANT: Supplier payments are COFFER operations (not caisse).
      // When paying a supplier (normal supplier), we must:
      // 1) record a movement in `expenses` (so it shows in Coffre movements)
      // 2) if method=check, record a usage in `check_safe_usages` so the cheque type becomes Utilisé
      
      try {
        const supplierName = String(body.supplier_name || '').trim() || supplierId;
        const cofferId = String(body.coffer_id || '').trim() || null;

        // Only log coffer movement when coffer_id is provided (normal flow).
        if (cofferId) {
          const movementMarker = `supplier_payment_id=${String(firstTry.data?.id || '')}`;

          // Resolve check_safe_id when needed.
          // IMPORTANT: For Coffre supplier payments, the frontend should always send check_safe_id.
          // We keep a fallback by check_number for manual/legacy payloads.
          let resolvedCheckSafeId: string | null = null;
          if (isCheck) {
          if (checkSafeId) {
          resolvedCheckSafeId = checkSafeId;
          } else if (checkNumber) {
          const { data: csRow, error: csErr } = await supabase
          .from('check_safe')
          .select('id')
          .eq('coffer_id', cofferId)
          .eq('check_number', checkNumber)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          if (!csErr && csRow?.id) resolvedCheckSafeId = String(csRow.id);
          }
          
          // If we still can't resolve it, this is a hard error for Coffre cheque payments.
          if (!resolvedCheckSafeId) {
          return jsonResponse(
          { error: 'Coffre cheque payment requires a valid check_safe_id' },
          400
          );
          }
          }

          // 1) For cheque payments, mark usage in the safe ledger so UI type becomes Utilisé.
          // This MUST succeed for Coffre cheques, otherwise the cheque remains reusable.
          if (isCheck) {
          const usageRow: any = {
          check_safe_id: resolvedCheckSafeId,
          store_id: resolvedStoreId,
          coffer_id: cofferId,
          // Using the full payment amount marks the cheque as used (or partially used).
          amount_used: amount,
          usage_type: 'supplier_global_payment',
          ref_table: 'payments',
          ref_id: String(firstTry.data?.id || ''),
          created_by: currentUser.id,
          notes: `Paiement Fournisseur • ${supplierName}`,
          };
          
          const { error: uErr } = await supabase
          .from('check_safe_usages')
          .insert([usageRow]);
          
          if (uErr) {
          console.error('Failed to record check_safe usage for supplier payment:', uErr);
          // Hard-fail: without this row the cheque stays Disponible and can be reused.
          return jsonResponse(
          { error: 'Failed to record Coffre cheque usage', details: uErr.message },
          500
          );
          }
          }

          // 2) Always create an expense row so the payment appears in Coffre movements.
          const expenseType = isCheck
            ? 'coffer_out_check'
            : (paymentMethod === 'bank_transfer')
              ? 'coffer_out_bank_transfer'
              : 'coffer_out_cash';

          const exp: any = {
            store_id: resolvedStoreId,
            coffer_id: cofferId,
            amount: -Math.abs(amount),
            expense_type: expenseType,
            reason: `Paiement Fournisseur • ${supplierName}`,
            created_by: currentUser.id,
          };

          const expWithNotes: any = { ...exp, notes: movementMarker };
          const ins = await supabase.from('expenses').insert([expWithNotes]);
          if (ins.error) {
          const msg = String(ins.error?.message || '');
          const missingNotes = msg.toLowerCase().includes('column notes') && msg.toLowerCase().includes('does not exist');
          const schemaCacheNotes = msg.toLowerCase().includes("could not find the 'notes' column");
          if (missingNotes || schemaCacheNotes) {
          const ins2 = await supabase.from('expenses').insert([exp]);
          if (ins2.error) {
          // Hard-fail: movement must be visible in Coffre.
          return jsonResponse(
          { error: 'Failed to create Coffre movement', details: ins2.error.message },
          500
          );
          }
          } else {
          // Hard-fail: movement must be visible in Coffre.
          return jsonResponse(
          { error: 'Failed to create Coffre movement', details: ins.error.message },
          500
          );
          }
          }
        }
      } catch (e) {
      console.error('Failed to create coffer movement for supplier payment:', e);
      // Hard-fail: for supplier payments from Coffre, we want an audit trail and cheque locking.
      return jsonResponse(
      { error: 'Failed to record Coffre side-effects for supplier payment' },
      500
      );
      }
      
      return jsonResponse({ success: true, payment: firstTry.data });
      } catch (error: any) {
      console.error("Error creating payment:", error);
      return jsonResponse({ error: error.message }, 500);
      }
      }

  if (path === "/payments" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      let query = supabase
        .from("payments")
        .select("*, stores(name)")
        .order("created_at", { ascending: false });

      // If user has a store_id and is not admin, filter by that store
      if (currentUser && currentUser.store_id && currentUser.role !== "admin") {
        query = query.eq("store_id", currentUser.store_id);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Enrich with actor email (for old rows that don't have created_by_email stored)
      const createdByIds = Array.from(
        new Set(
          (rows || [])
            .map((r: any) => r?.created_by)
            .filter((id: any) => id)
            .map((id: any) => String(id))
        )
      );

      const emailByUserId = new Map<string, string>();
      if (createdByIds.length > 0) {
        const { data: uRows, error: uErr } = await supabase
          .from("users")
          .select("id, email")
          .in("id", createdByIds);

        if (uErr) {
          console.warn("/payments GET could not fetch users:", uErr.message);
        }

        (uRows || []).forEach((u: any) => {
          if (u?.id && u?.email) emailByUserId.set(String(u.id), String(u.email));
        });
      }

      const enriched = (rows || []).map((p: any) => {
        const createdBy = p?.created_by ? String(p.created_by) : null;
        const created_by_email = p?.created_by_email || (createdBy ? (emailByUserId.get(createdBy) || null) : null);
        return {
          ...p,
          created_by_email,
        };
      });

      return jsonResponse({ payments: enriched });
    } catch (error: any) {
      console.error("Error fetching payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // NOTE:
  // There is an advanced /payments POST handler earlier in this file
  // that handles:
  // - cheque usage (check_safe_usages)
  // - coffre movements (expenses coffer_out_*)
  // - schema-cache compatibility
  // This legacy handler was kept by mistake and was overriding the correct behavior.
  // We disable it to avoid duplicate/conflicting logic.
  if (path === "/payments" && method === "POST") {
  return jsonResponse({
  error: "Legacy /payments POST handler is disabled. Use the main /payments handler earlier in this file.",
  }, 409);
  }

  if (path.startsWith("/payments/") && method === "DELETE") {
    try {
      const paymentId = path.split("/")[2];
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", paymentId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/partial-payments" && method === "GET") {
    try {
      const { data, error } = await supabase
        .from("partial_payments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ partial_payments: data || [] });
    } catch (error: any) {
      console.error("Error fetching partial payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/partial-payments" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUser(req);

      const { data, error } = await supabase
        .from("partial_payments")
        .insert([
          {
            sale_id: body.sale_id || null,
            order_id: body.order_id || null,
            invoice_id: body.invoice_id || null,
            amount_paid: body.amount_paid,
            remaining_balance: body.remaining_balance,
            pending_discount: body.pending_discount,
            confirmation_status: body.confirmation_status || 'pending',
            payment_method: body.payment_method || 'cash',
            payment_date: new Date().toISOString(),
            notes: body.notes || null,
            created_by: currentUser?.id || null,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, partial_payment: data?.[0] });
    } catch (error: any) {
      console.error("Error creating partial payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/partial-payments/") && path.includes("/approve") && method === "POST") {
    try {
      const paymentId = path.split("/")[2];
      const body = await req.json();
      
      const { data, error } = await supabase
        .from("partial_payments")
        .update({
          confirmation_status: "approved",
          confirmed_by: body.confirmed_by,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, payment: data?.[0] });
    } catch (error: any) {
      console.error("Error approving partial payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/partial-payments/") && path.includes("/reject") && method === "POST") {
    try {
      const paymentId = path.split("/")[2];
      const body = await req.json();
      
      const { data, error } = await supabase
        .from("partial_payments")
        .update({
          confirmation_status: "rejected",
          confirmed_by: body.confirmed_by,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, payment: data?.[0] });
    } catch (error: any) {
      console.error("Error rejecting partial payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/auth/login" && method === "POST") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Update last_login timestamp for the user
      const { data, error } = await supabase
        .from("users")
        .update({
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id)
        .select();

      if (error) {
        console.error("Error updating last_login:", error);
        // Don't throw - just log it
      } else {
        console.log(`Updated last_login for user ${currentUser.id}`);
      }

      return jsonResponse({ success: true, user: data?.[0] });
    } catch (error: any) {
      console.error("Error in login endpoint:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/users" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // If user doesn't exist in database, create them automatically
      if (currentUser && currentUser.id) {
        const { data: existingUser, error: checkError } = await supabase
          .from("users")
          .select("id")
          .eq("id", currentUser.id)
          .single();

        if (checkError && checkError.code === 'PGRST116') {
          // User doesn't exist, create them
          const { error: createError } = await supabase
            .from("users")
            .insert([
              {
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.email.split('@')[0],
                role: 'admin',
                permissions: [],
                is_active: true,
                last_login: new Date().toISOString(),
              },
            ]);

          if (createError) {
            console.error("Error creating user:", createError);
          } else {
            console.log(`Auto-created user: ${currentUser.email}`);
          }
        }
      }

      let query = supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is admin, show all users
      // If user has a store_id, show only users in their store
      if (currentUser.role !== "admin") {
        if (currentUser.store_id) {
          query = query.eq("store_id", currentUser.store_id);
        } else {
          // User has no store, can only see themselves
          query = query.eq("id", currentUser.id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ users: data || [] });
    } catch (error: any) {
      console.error("Error fetching users:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/users" && method === "POST") {
    try {
      const body = await req.json();

      if (!body.email || !body.password) {
        return jsonResponse({ error: "Email and password are required" }, 400);
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });

      if (authError) throw authError;

      const userId = authData.user.id;
      let storeId = body.store_id || null; // Use provided store_id if available

      console.log(`[USER CREATE] Creating user ${userId} (${body.email}) with role: ${body.role}`);
      console.log(`[USER CREATE] Provided store_id: ${body.store_id}`);

      // If role is manager and storeData is provided (and no store_id selected), create a NEW store
      if (body.role === "manager" && body.storeData && !body.store_id) {
        const storeData = body.storeData;
        
        // Only create store if at least one field is provided
        if (storeData.storeName || storeData.storeEmail || storeData.storePhone || storeData.storeAddress) {
          // Generate a unique email if not provided (required by schema)
          const storeEmail = storeData.storeEmail || `store-${Date.now()}@frutaria.local`;
          
          console.log(`[USER CREATE] Creating NEW store for manager user ${userId}:`, { storeName: storeData.storeName });
          
          const { data: newStore, error: storeError } = await supabase
            .from("stores")
            .insert([
              {
                name: storeData.storeName || "Store",
                email: storeEmail,
                phone: storeData.storePhone || null,
                address: storeData.storeAddress || null,
                city: null,
                postal_code: null,
                contact_person: body.name || null,
                balance: 0,
                status: "active",
                // Link the newly created store to the manager user
                // so magasin filtering and "take my place" work correctly.
                user_id: userId,
              },
            ])
            .select();

          if (storeError) {
            console.error("[USER CREATE] Error creating store:", storeError);
            console.error("[USER CREATE] Store error details:", storeError.message);
            // Don't throw - continue with user creation even if store creation fails
          } else {
            storeId = newStore?.[0]?.id;
            console.log(`[USER CREATE] ✓ Created NEW store ${storeId} for manager user ${userId}`);
          }
        }
      } else if (body.store_id) {
        console.log(`[USER CREATE] Assigning user ${userId} to EXISTING store: ${body.store_id}`);
      }

      const { data, error } = await supabase
        .from("users")
        .insert([
          {
          id: userId,
          email: body.email,
          name: body.name || "",
          role: normalizeRole(body.role),
          // Role-based only: ignore body.permissions
          permissions: buildRoleBasedPermissions(normalizeRole(body.role)),
          store_id: storeId,
          is_active: true,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, user: data?.[0], store_id: storeId });
    } catch (error: any) {
      console.error("Error creating user:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/users/") && path.includes("/status") && method === "PATCH") {
    try {
      const userId = path.split("/")[2];
      const body = await req.json();
      
      const updateData: any = {
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      };
      
      // If deactivating user, set last_logout to force logout
      if (!body.is_active) {
        updateData.last_logout = new Date().toISOString();
        console.log('Deactivating user:', userId);
      } else {
        // If activating user, set last_login timestamp
        updateData.last_login = new Date().toISOString();
        console.log('Activating user:', userId);
      }
      
      console.log('Toggling user status:', { userId, is_active: body.is_active });
      
      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId)
        .select();

      if (error) throw error;
      console.log('Status update result:', data);
      return jsonResponse({ 
        success: true, 
        user: data?.[0],
        message: body.is_active ? 'Utilisateur activé' : 'Utilisateur désactivé et déconnecté'
      });
    } catch (error: any) {
      console.error("Error updating user status:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/users/") && method === "PUT") {
  try {
  const userId = path.split("/")[2];
  const body = await req.json();
  
  // 1) If password/email updates are requested, apply them to Supabase Auth first.
  // Otherwise the DB user will look updated but login will fail (invalid_credentials).
  const authUpdate: any = {};
  if (body.password !== undefined && String(body.password || '').trim()) {
  authUpdate.password = String(body.password);
  }
  if (body.email !== undefined && String(body.email || '').trim()) {
  authUpdate.email = String(body.email).trim();
  }
  
  if (Object.keys(authUpdate).length > 0) {
  const { error: authErr } = await supabase.auth.admin.updateUserById(userId, authUpdate);
  if (authErr) throw authErr;
  }
  
  // 2) Update our app-level profile/permissions table.
  const updateData: any = {
  updated_at: new Date().toISOString(),
  };
  
  if (body.name !== undefined) updateData.name = body.name;
  if (body.role !== undefined) {
  const nextRole = normalizeRole(body.role);
  updateData.role = nextRole;
  // Role-based only: recompute permissions whenever role changes
  updateData.permissions = buildRoleBasedPermissions(nextRole);
  }
  // Ignore client-provided permissions
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.email !== undefined) updateData.email = String(body.email || '').trim() || null;
  
  console.log('Updating user with data:', updateData);
  
  const { data, error } = await supabase
  .from("users")
  .update(updateData)
  .eq("id", userId)
  .select();
  
  if (error) throw error;
  console.log('Update result:', data);
  return jsonResponse({ success: true, user: data?.[0] });
  } catch (error: any) {
  console.error("Error updating user:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }
  
  if (path.startsWith("/users/") && method === "DELETE") {
  try {
  const userId = path.split("/")[2];
  
  // Delete from Supabase Auth first so the identity cannot log in anymore.
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) throw authErr;
  
  // Then delete from the public users table.
  const { error } = await supabase
  .from("users")
  .delete()
  .eq("id", userId);
  
  if (error) throw error;
  return jsonResponse({ success: true });
  } catch (error: any) {
  console.error("Error deleting user:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path === "/purchases" && method === "POST") {
  try {
  const body = await req.json().catch(() => ({}));
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  console.log("=== PURCHASES POST DEBUG ===");
  console.log("Request body:", JSON.stringify(body, null, 2));
  console.log("Current user:", currentUser);
  
  // IMPORTANT:
  // "Transferts & Achats" are stored as rows in `sales` with a specific sale_number prefix.
  // UI filters by prefixes:
  // - PURCHASE-* (achat)
  // - TRANSFER-* (transfert)
  // This endpoint historically inserted SALE-* and often omitted store_id.
  
  const purchaseTypeRaw = String(body.purchase_type || body.type || body.operation_type || "purchase").toLowerCase();
  const isTransfer = purchaseTypeRaw === "transfer";
  const prefix = isTransfer ? "TRANSFER" : "PURCHASE";
  
  const destStoreId = body.store_id ? String(body.store_id).trim() : (currentUser.store_id ? String(currentUser.store_id).trim() : null);
  const sourceStoreId = body.source_store_id ? String(body.source_store_id).trim() : null;
  
  console.log("Resolved stores:", { destStoreId, sourceStoreId, isTransfer });
  
  if (!destStoreId) return jsonResponse({ error: "store_id is required" }, 400);
  if (isTransfer && !sourceStoreId) return jsonResponse({ error: "source_store_id is required for transfer" }, 400);
  
  const saleNumber = `${prefix}-${Date.now()}`;
  
  const paymentMethod = String(body.payment_method || "cash").toLowerCase();

  // IMPORTANT: do NOT auto-force cash/bank_transfer to "paid".
  // The UI supports partial payments even for cash/bank transfers.
  // If the client did not send payment_status, derive it from amount_paid/remaining_balance.
  const incomingPaymentStatus = String(body.payment_status || '').trim().toLowerCase();

  const resolvedTotalNum = Number(body.total_amount || 0) || 0;
  const amountPaidNum = Number(body.amount_paid || 0) || 0;

  // If remaining_balance is explicitly provided, respect it (can be 0).
  // Otherwise compute it from total - paid.
  const remainingBalanceNum =
    body.remaining_balance !== undefined && body.remaining_balance !== null
      ? (Number(body.remaining_balance) || 0)
      : Math.max(0, resolvedTotalNum - amountPaidNum);

  const derivedPaymentStatus = remainingBalanceNum <= 0
    ? 'paid'
    : (amountPaidNum > 0 ? 'partial' : 'unpaid');

  const paymentStatus = incomingPaymentStatus || derivedPaymentStatus;
  
  // Compute total_amount server-side to avoid UI bugs (double-counting, wrong field, etc.)
  // For purchase/transfer modules, the moved quantity is often stored in `caisse`.
  const computeServerTotal = () => {
  if (!Array.isArray(body.items) || body.items.length === 0) return 0;
  return body.items.reduce((sum: number, it: any) => {
  const rawQty = it?.caisse ?? it?.quantity ?? 0;
  const qty = typeof rawQty === 'string' ? Number(String(rawQty).replace(',', '.')) : Number(rawQty);
  
  const rawUnit = it?.unit_price ?? it?.unitPrice ?? it?.purchase_price ?? it?.price ?? 0;
  const unit = typeof rawUnit === 'string' ? Number(String(rawUnit).replace(',', '.')) : Number(rawUnit);
  
  const q = Number.isFinite(qty) ? qty : 0;
  const u = Number.isFinite(unit) ? unit : 0;
  return sum + (q * u);
  }, 0);
  };
  
  const serverTotal = computeServerTotal();
  const clientTotalRaw = body.total_amount;
  const clientTotal = typeof clientTotalRaw === 'string'
  ? Number(String(clientTotalRaw).replace(',', '.'))
  : Number(clientTotalRaw);
  
  // Prefer server total when it is valid and non-zero; otherwise fall back to client total.
  const resolvedTotal = (Number.isFinite(serverTotal) && serverTotal > 0)
  ? serverTotal
  : (Number.isFinite(clientTotal) ? clientTotal : 0);
  
  const saleRow: any = {
  sale_number: saleNumber,
  store_id: destStoreId,
  source_store_id: sourceStoreId,
  total_amount: resolvedTotal,
  amount_paid: body.amount_paid || 0,
  remaining_balance: body.remaining_balance || 0,
  payment_method: paymentMethod,
  payment_status: paymentStatus,
  delivery_status: body.delivery_status || "preparing",
  notes: body.notes || `Operation: ${prefix}`,
  created_by: currentUser.id,
  created_by_role: currentUser.role,
  created_for_store_id: body.store_id || destStoreId,
  };
  
  console.log("Resolved totals:", { serverTotal, clientTotal, resolvedTotal });
  
  console.log("Inserting sales row:", JSON.stringify(saleRow, null, 2));
  
  const { data: saleData, error: saleError } = await supabase
  .from("sales")
  .insert([saleRow])
  .select();
  
  if (saleError) {
  console.error("[purchases POST] sales insert error:", saleError);
  console.error("[purchases POST] sales insert error (json):", JSON.stringify(saleError, null, 2));
  return jsonResponse({
  error: saleError.message || "Failed to insert into sales",
  details: saleError,
  }, 500);
  }
  
  const saleId = saleData?.[0]?.id;
  console.log("Inserted saleId:", saleId);
  if (!saleId) throw new Error("Failed to create sale");
  
  if (Array.isArray(body.items) && body.items.length > 0) {
  const saleItems = body.items.map((item: any) => ({
  sale_id: saleId,
  product_id: item.product_id || item.id || null,
  caisse: item.caisse ?? null,
  quantity: item.quantity ?? 0,
  unit_price: item.unit_price ?? item.unitPrice ?? 0,
  total_price: item.total_price ?? item.subtotal ?? 0,
  subtotal: item.subtotal ?? item.total_price ?? 0,
  name: item.name ?? null,
  reference: item.reference ?? null,
  category: item.category ?? null,
  lot: item.lot ?? null,
  moyenne: item.moyenne ?? item.avg_net_weight_per_box ?? null,
  fourchette_min: item.fourchette_min ?? null,
  fourchette_max: item.fourchette_max ?? null,
  }));
  
  console.log("Inserting sale_items:", JSON.stringify(saleItems, null, 2));
  
  const { error: itemsError } = await supabase
  .from("sale_items")
  .insert(saleItems);
  
  if (itemsError) {
  console.error("[purchases POST] sale_items insert error:", itemsError);
  console.error("[purchases POST] sale_items insert error (json):", JSON.stringify(itemsError, null, 2));
  return jsonResponse({
  error: itemsError.message || "Failed to insert into sale_items",
  details: itemsError,
  }, 500);
  }
  }
  
  console.log("=== END PURCHASES POST DEBUG ===");
  
  return jsonResponse({
  success: true,
  sale: saleData?.[0],
  message: "Purchase/Transfer recorded successfully",
  });
  } catch (error: any) {
  console.error("Error creating purchase:", error);
  console.error("Error creating purchase (json):", JSON.stringify(error, null, 2));
  return jsonResponse({ error: error.message || String(error), details: error }, 500);
  }
  }

  // Upload attachment for an EXISTING cheque (edit flow)
  // POST /check-inventory/:id/edit-upload
  if (path.startsWith("/check-inventory/") && path.includes("/edit-upload") && method === "POST") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
      const role = String(currentUser.role || '').toLowerCase();
      if (role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);

      const parts = path.split('/').filter(Boolean); // [check-inventory, :id, edit-upload]
      const checkId = parts[1];
      if (!checkId) return jsonResponse({ error: 'Invalid check id' }, 400);

      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return jsonResponse({ error: 'file is required' }, 400);
      }

      const check_id_number = String(formData.get('check_id_number') || '').trim() || null;
      const given_to = String(formData.get('given_to') || '').trim() || null;
      const notes = String(formData.get('notes') || '').trim() || null;
      const check_date = String(formData.get('check_date') || '').trim() || null;
      const due_date = String(formData.get('due_date') || '').trim() || null;

      const originalName = String((file as any).name || 'attachment');
      const lower = originalName.toLowerCase();
      const ext = lower.endsWith('.pdf')
        ? 'pdf'
        : (lower.endsWith('.png') ? 'png' : (lower.endsWith('.webp') ? 'webp' : 'jpg'));

      const fileType = ext === 'pdf' ? 'pdf' : 'image';
      const timestamp = Date.now();
      const filename = `check-inventory/${checkId}-${timestamp}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();

      // Ensure bucket exists
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      if (bucketsError) throw bucketsError;
      const bucketExists = buckets?.some((b: any) => b.name === 'check-inventory');
      if (!bucketExists) {
        const { error: createError } = await supabase.storage.createBucket('check-inventory', { public: true });
        if (createError) throw createError;
      }

      const { error: uploadError } = await supabase.storage
        .from('check-inventory')
        .upload(filename, new Uint8Array(arrayBuffer), {
          contentType: (file as any).type || (fileType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('check-inventory').getPublicUrl(filename);
      const publicUrl = urlData?.publicUrl || null;

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };
      if (check_id_number !== null) updateData.check_id_number = check_id_number;
      if (given_to !== null) updateData.given_to = given_to;
      if (notes !== null) updateData.notes = notes;
      if (check_date !== null) updateData.check_date = check_date || null;
      if (due_date !== null) updateData.due_date = due_date || null;

      // Persist attachment fields
      updateData.file_type = fileType;
      if (fileType === 'pdf') {
        updateData.pdf_url = publicUrl;
        updateData.image_url = null;
      } else {
        updateData.image_url = publicUrl;
        updateData.pdf_url = null;
      }

      const { data: updated, error: updErr } = await supabase
        .from('check_inventory')
        .update(updateData)
        .eq('id', checkId)
        .select('*')
        .maybeSingle();

      if (updErr) throw updErr;
      return jsonResponse({ success: true, check: updated });
    } catch (error: any) {
      console.error('Error edit-upload check-inventory:', error);
      return jsonResponse({ error: error.message || String(error) }, 500);
    }
  }

  if (path === "/check-inventory" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      
      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Build query based on user role
      let query = supabase
        .from("check_inventory")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show checks they received or gave
      if (currentUser.role !== "admin") {
        query = query.or(`receiver_id.eq.${currentUser.id},giver_id.eq.${currentUser.id}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ check_inventory: data || [] });
    } catch (error: any) {
      console.error("Error fetching check inventory:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/check-inventory" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // If check_date not provided, default to TODAY (yyyy-mm-dd)
      const defaultCheckDate = new Date().toISOString().slice(0, 10);
      const resolvedCheckDate = (body.check_date && String(body.check_date).trim())
        ? String(body.check_date).trim()
        : defaultCheckDate;

      const resolvedDueDate = (body.due_date && String(body.due_date).trim())
        ? String(body.due_date).trim()
        : null;

      const { data, error } = await supabase
        .from("check_inventory")
        .insert([
          {
            check_id_number: body.check_id_number,
            amount_value: body.amount_value,
            given_to: body.given_to,
            given_to_type: body.given_to_type,
            given_to_id: body.given_to_id || null,
            status: body.status || "pending",
            notes: body.notes || null,
            check_date: resolvedCheckDate,
            due_date: resolvedDueDate,
            giver_id: currentUser.id,
            receiver_id: body.receiver_id || null,
            usage_percentage: 0,
            remaining_balance: body.amount_value || 0,
            created_by: currentUser.id,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, check: data?.[0] });
    } catch (error: any) {
      console.error("Error creating check inventory:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/check-inventory/") && path.includes("/upload") && method === "POST") {
    try {
      const body = await req.formData();
      const file = body.get("file") as File | null;
      const checkIdNumber = body.get("check_id_number") as string;
      const amountValue = body.get("amount_value") as string;
      const userEmail = body.get("user_email") as string;
      const giverName = body.get("giver_name") as string; // Client name if provided
      const notes = body.get("notes") as string;
      const executionDate = body.get("execution_date") as string; // Due date (legacy field name)
      const dueDate = (body.get("due_date") as string) || executionDate || null;
      const currentUser = await getCurrentUser(req);

      if (!checkIdNumber || !amountValue) {
        return jsonResponse({ error: "Missing required fields: check_id_number, amount_value" }, 400);
      }

      let fileUrl: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      // File upload is now optional
      if (file) {
        // Determine file type
        fileType = file.type.startsWith("image/") ? "image" : "pdf";
        fileSize = file.size;

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `check-inventory/${timestamp}-${checkIdNumber}.${fileType === "image" ? "jpg" : "pdf"}`;

        // Ensure bucket exists
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some((b: any) => b.name === "check-inventory");
        
        if (!bucketExists) {
          console.log("Creating check-inventory bucket...");
          const { error: createError } = await supabase.storage.createBucket("check-inventory", {
            public: true,
          });
          if (createError) {
            console.warn("Could not create bucket (may already exist):", createError);
          }
        }

        // Upload file to Supabase Storage
        const arrayBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("check-inventory")
          .upload(filename, new Uint8Array(arrayBuffer), {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("check-inventory")
          .getPublicUrl(filename);

        fileUrl = urlData?.publicUrl || null;
      }

      // Dynamically determine given_to and given_to_type
      // If giver_name (client name) is provided, use it; otherwise use userEmail
      const finalGivenTo = giverName || userEmail || "unknown";
      const finalGivenToType = giverName ? "client" : "user";

      // Create check inventory record in database
      const rawCheckDate = (body.get("check_date") as string) || null;

      // If frontend doesn't send check_date, default it to TODAY (yyyy-mm-dd)
      // so it never ends up NULL at insert-time.
      const defaultCheckDate = new Date().toISOString().slice(0, 10);
      const resolvedCheckDate = (rawCheckDate && String(rawCheckDate).trim())
        ? String(rawCheckDate).trim()
        : defaultCheckDate;

      const { data: checkData, error: checkError } = await supabase
        .from("check_inventory")
        .insert([
          {
            check_id_number: checkIdNumber,
            amount_value: parseFloat(amountValue),
            given_to: finalGivenTo,
            given_to_type: finalGivenToType,
            status: "pending",
            image_url: fileType === "image" ? fileUrl : null,
            pdf_url: fileType === "pdf" ? fileUrl : null,
            file_type: fileType,
            file_size: fileSize,
            notes: notes || null,
            check_date: resolvedCheckDate,
            due_date: dueDate || null,
            uploaded_by: currentUser?.id,
            created_by: currentUser?.id,
            giver_id: currentUser?.id,
            receiver_id: null,
            usage_percentage: 0,
            remaining_balance: parseFloat(amountValue),
          },
        ])
        .select();

      if (checkError) throw checkError;

      return jsonResponse({ success: true, check: checkData?.[0] });
    } catch (error: any) {
      console.error("Error uploading check inventory:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/check-inventory/") && method === "PUT") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      // Allow editing cheque fields from the UI.
      // Security: only admin can edit (frontend also hides action based on permissions).
      // NOTE: status-only updates are handled further below (existing behavior).
      // We keep backward compatibility by accepting both status-only and full edit payload.
      const role = String(currentUser.role || '').toLowerCase();
      const urlParts = path.split('/').filter(Boolean);
      const checkId = urlParts[1];
      const body = await req.json().catch(() => ({}));

      const editableFields = [
        'check_id_number',
        // amount_value is intentionally NOT editable via modification UI
        'given_to',
        'given_to_type',
        'notes',
        'check_date',
        'due_date',
        'execution_date',
        'image_url',
        'pdf_url',
        'file_type',
      ];

      const isEditRequest = editableFields.some((k) => (body as any)?.[k] !== undefined);
      if (isEditRequest) {
        if (role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);

        const updateData: any = { updated_at: new Date().toISOString() };

        if ((body as any).check_id_number !== undefined) updateData.check_id_number = (body as any).check_id_number || null;
        // amount_value edits are forbidden
        if ((body as any).amount_value !== undefined) {
          return jsonResponse({ error: 'amount_value cannot be edited' }, 400);
        }
        if ((body as any).given_to !== undefined) updateData.given_to = (body as any).given_to || null;
        if ((body as any).given_to_type !== undefined) updateData.given_to_type = (body as any).given_to_type || null;
        if ((body as any).notes !== undefined) updateData.notes = (body as any).notes || null;
        if ((body as any).check_date !== undefined) updateData.check_date = (body as any).check_date || null;
        if ((body as any).due_date !== undefined) updateData.due_date = (body as any).due_date || null;
        if ((body as any).execution_date !== undefined) updateData.execution_date = (body as any).execution_date || null;
        if ((body as any).image_url !== undefined) updateData.image_url = (body as any).image_url || null;
        if ((body as any).pdf_url !== undefined) updateData.pdf_url = (body as any).pdf_url || null;
        if ((body as any).file_type !== undefined) updateData.file_type = (body as any).file_type || null;

        // amount_value is not editable; do not touch remaining_balance here.

        const { data: updated, error: updErr } = await supabase
          .from('check_inventory')
          .update(updateData)
          .eq('id', checkId)
          .select('*')
          .maybeSingle();

        if (updErr) throw updErr;
        return jsonResponse({ success: true, check: updated });
      }

      console.log("=== CHECK INVENTORY UPDATE DEBUG ===");
      console.log(`Check ID: ${checkId}`);
      console.log(`Request body:`, JSON.stringify(body, null, 2));

      // First, fetch the current check to see what we're updating
      const { data: currentCheck, error: fetchError } = await supabase
        .from("check_inventory")
        .select("*")
        .eq("id", checkId)
        .single();

      if (fetchError) {
        console.error(`Error fetching current check ${checkId}:`, fetchError);
      } else {
        console.log(`Current check data:`, JSON.stringify(currentCheck, null, 2));
      }

      // Build update object with all provided fields
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Always ensure check_date is not null.
      // - If client sends it -> use it
      // - If client doesn't send it and row has NULL -> default to created_at date
      if (body.check_date !== undefined) {
        // Expect yyyy-mm-dd string from UI <input type="date">
        updateData.check_date = body.check_date || null;
        console.log(`Setting check_date: ${updateData.check_date}`);
      } else if ((currentCheck as any)?.check_date == null && (currentCheck as any)?.created_at) {
        updateData.check_date = String((currentCheck as any).created_at).slice(0, 10);
        console.log(`Defaulting check_date from created_at: ${updateData.check_date}`);
      }

      // Always update these if provided
      if (body.status !== undefined) {
        updateData.status = body.status;
        console.log(`Setting status: ${body.status}`);
      }
      if (body.notes !== undefined) {
        updateData.notes = body.notes;
        console.log(`Setting notes: ${body.notes}`);
      }
      if (body.remaining_balance !== undefined) {
        // Handle remaining_balance - can be 0, null, or a number
        updateData.remaining_balance = body.remaining_balance === 0 ? 0 : (body.remaining_balance || null);
        console.log(`Setting remaining_balance: ${updateData.remaining_balance}`);
      }
      if (body.original_amount !== undefined) {
        updateData.original_amount = body.original_amount;
        console.log(`Setting original_amount: ${body.original_amount}`);
      } else if (currentCheck && !currentCheck.original_amount && body.remaining_balance !== undefined) {
        // If original_amount is not set and we're updating remaining_balance, set it from amount_value
        updateData.original_amount = currentCheck.amount_value;
        console.log(`Auto-setting original_amount from amount_value: ${currentCheck.amount_value}`);
      }
      if (body.usage_percentage !== undefined) {
        updateData.usage_percentage = body.usage_percentage;
        console.log(`Setting usage_percentage: ${body.usage_percentage}`);
      }
      if (body.receiver_id !== undefined) {
        updateData.receiver_id = body.receiver_id;
        console.log(`Setting receiver_id: ${body.receiver_id}`);
      }
      if (body.giver_id !== undefined) {
        updateData.giver_id = body.giver_id;
        console.log(`Setting giver_id: ${body.giver_id}`);
      }

      console.log(`Final update data:`, JSON.stringify(updateData, null, 2));
      console.log(`Update will change status from "${currentCheck?.status}" to "${updateData.status || 'unchanged'}"`);

      const { data, error } = await supabase
        .from("check_inventory")
        .update(updateData)
        .eq("id", checkId)
        .select();

      // If check_date is still null, default it to created_at date (backend safeguard)
      if (!error && data?.[0] && (data[0] as any).check_date == null) {
        const createdAt = (data[0] as any).created_at;
        if (createdAt) {
          const fallbackDate = String(createdAt).slice(0, 10);
          const { data: patched, error: patchErr } = await supabase
            .from("check_inventory")
            .update({ check_date: fallbackDate })
            .eq("id", checkId)
            .select();

          if (!patchErr) {
            return jsonResponse({ success: true, check: patched?.[0] });
          }
        }
      }

      if (error) {
        console.error(`Update error for check ${checkId}:`, error);
        throw error;
      }
      
      console.log(`Check ${checkId} updated successfully`);
      console.log(`Updated check data:`, JSON.stringify(data?.[0], null, 2));
      console.log("=== END DEBUG ===");
      
      return jsonResponse({ success: true, check: data?.[0] });
    } catch (error: any) {
      console.error("Error updating check inventory:", error);
      console.log("=== END DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/check-inventory/") && method === "DELETE") {
    try {
      const checkId = path.split("/")[2];
      const { error } = await supabase
        .from("check_inventory")
        .delete()
        .eq("id", checkId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting check inventory:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Upload endpoint for product template photos
  if (path.startsWith("/uploads/product-template") && method === "POST") {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const form = await req.formData();
      const file = form.get("file") as File;
      const folder = (form.get("folder") as string) || "product-templates";

      if (!file) {
        return jsonResponse({ error: "No file provided" }, 400);
      }

      // Ensure bucket exists
      const bucketName = "product-templates";
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b: any) => b.name === bucketName);
      if (!bucketExists) {
        const { error: bucketErr } = await supabase.storage.createBucket(bucketName, { public: true });
        if (bucketErr) console.warn("Could not create product-templates bucket:", bucketErr.message);
      }

      const timestamp = Date.now();
      const ext = file.type.includes("pdf") ? "pdf" : (file.type.split("/")[1] || "bin");
      const key = `${folder}/${timestamp}-${crypto.randomUUID()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(key, new Uint8Array(arrayBuffer), { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(key);
      const url = pub?.publicUrl;

      return jsonResponse({ url });
    } catch (error: any) {
      console.error("Error uploading product template photo:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Upload endpoint for bank transfer proof
  if (path.startsWith("/uploads/bank-transfer-proof") && method === "POST") {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const form = await req.formData();
      const file = form.get("file") as File;
      const folder = (form.get("folder") as string) || "invoices-proofs";

      if (!file) {
        return jsonResponse({ error: "No file provided" }, 400);
      }

      // Ensure bucket exists
      const bucketName = "invoices-proofs";
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b: any) => b.name === bucketName);
      if (!bucketExists) {
        const { error: bucketErr } = await supabase.storage.createBucket(bucketName, { public: true });
        if (bucketErr) console.warn("Could not create invoices-proofs bucket:", bucketErr.message);
      }

      const timestamp = Date.now();
      const ext = file.type.includes("pdf") ? "pdf" : (file.type.split("/")[1] || "bin");
      const key = `${folder}/${timestamp}-${crypto.randomUUID()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(key, new Uint8Array(arrayBuffer), { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(key);
      const url = pub?.publicUrl;

      return jsonResponse({ url });
    } catch (error: any) {
      console.error("Error uploading bank transfer proof:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/charge-categories" && method === "GET") {
    try {
      const { data, error } = await supabase
        .from("charge_categories")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ categories: data || [] });
    } catch (error: any) {
      console.error("Error fetching charge categories:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/charge-categories" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      // Only admins can create charge categories
      if (!currentUser || currentUser.role !== "admin") {
        return jsonResponse({ error: "Only admins can create charge categories" }, 403);
      }

      if (!body.name || !body.name.trim()) {
        return jsonResponse({ error: "Category name is required" }, 400);
      }

      const { data, error } = await supabase
        .from("charge_categories")
        .insert([
          {
            name: body.name.trim(),
            description: body.description || null,
            icon: body.icon || null,
            color: body.color || "#3b82f6",
            status: body.status || "active",
            created_by: currentUser.id,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, category: data?.[0] });
    } catch (error: any) {
      console.error("Error creating charge category:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/charge-categories/") && method === "PUT") {
    try {
      const categoryId = path.split("/")[2];
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      // Only admins can update charge categories
      if (!currentUser || currentUser.role !== "admin") {
        return jsonResponse({ error: "Only admins can update charge categories" }, 403);
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.description !== undefined) updateData.description = body.description;
      if (body.icon !== undefined) updateData.icon = body.icon;
      if (body.color !== undefined) updateData.color = body.color;
      if (body.status !== undefined) updateData.status = body.status;

      const { data, error } = await supabase
        .from("charge_categories")
        .update(updateData)
        .eq("id", categoryId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, category: data?.[0] });
    } catch (error: any) {
      console.error("Error updating charge category:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/charge-categories/") && method === "DELETE") {
    try {
      const categoryId = path.split("/")[2];
      const currentUser = await getCurrentUserWithRole(req);

      // Only admins can delete charge categories
      if (!currentUser || currentUser.role !== "admin") {
        return jsonResponse({ error: "Only admins can delete charge categories" }, 403);
      }

      const { error } = await supabase
        .from("charge_categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting charge category:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/stats" && method === "GET") {
    try {
      const [
        { count: productsCount },
        { count: clientsCount },
        { count: suppliersCount },
        { count: ordersCount },
        { count: transfersCount },
        { count: checksCount },
        { data: salesData },
        { count: activeUsersCount },
        { count: totalUsersCount },
      ] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("stores").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("transfers")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("checks")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("sales").select("total_amount"),
        supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("users").select("*", { count: "exact", head: true }),
      ]);

      const totalSales = salesData?.reduce(
        (sum: number, s: any) => sum + (s.total_amount || 0),
        0
      ) || 0;

      return jsonResponse({
        stats: {
          totalProducts: productsCount || 0,
          totalSales,
          totalClients: clientsCount || 0,
          totalSuppliers: suppliersCount || 0,
          pendingOrders: ordersCount || 0,
          pendingTransfers: transfersCount || 0,
          pendingChecks: checksCount || 0,
          activeUsers: activeUsersCount || 0,
          totalUsers: totalUsersCount || 0,
        },
      });
    } catch (error: any) {
      console.error("Error fetching stats:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/invoices" && method === "GET") {
    try {
      console.log("=== GET /invoices DEBUG ===");
      const currentUser = await getCurrentUserWithRole(req);
      console.log("Current User:", currentUser);

      if (!currentUser) {
        console.log("No current user - returning 401");
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      console.log("Fetching invoices from database...");
      let query = supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is admin, show all invoices
      // If user has a store_id, show only their store's invoices
      // If user has no store_id, show only invoices they created
      if (currentUser.role !== "admin") {
        if (currentUser.store_id) {
          query = query.eq("store_id", currentUser.store_id);
        } else {
          // User has no store, show only invoices they created
          query = query.eq("created_by", currentUser.id);
        }
      }

      const { data, error } = await query;

      console.log("Query Error:", error);
      console.log("Query Data:", data);
      console.log("Data Length:", data?.length || 0);

      if (error) throw error;
      console.log("=== END GET /invoices DEBUG ===");
      return jsonResponse({ invoices: data || [] });
    } catch (error: any) {
      console.error("Error fetching invoices:", error);
      console.log("=== END GET /invoices DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/invoices" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUser(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      console.log("=== INVOICE POST DEBUG ===");
      console.log("Request body:", JSON.stringify(body, null, 2));
      console.log("Current user:", currentUser);

      // Use invoice_number from request body - don't auto-generate it
      let invoiceNumber = body.invoice_number;
      if (!invoiceNumber) {
        const { data, error } = await supabase.rpc("consume_next_invoice_number", {
          counter_id: body.counter_id || "global",
        });
        if (error) throw error;
        invoiceNumber = data;
      }

      const remainingBalance = body.total_amount - body.amount_paid;

      console.log("Invoice number:", invoiceNumber);
      console.log("Remaining balance:", remainingBalance);

      // Build insert object with all fields
      // Remise for invoices is stored in invoices.pending_discount (existing schema).
      // Accept multiple frontend keys for backward compatibility.
      const remiseAmount = (() => {
      const raw = body.total_remise ?? body.remise_amount ?? body.discount_amount ?? body.remise ?? body.pending_discount ?? 0;
      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
      })();
      
      const insertData = {
      // invoice_number is the system allocated unique number (FAC-xxxx)
      invoice_number: invoiceNumber,
      // display_number is an optional user-entered reference to show in UI/history/PDF.
      // IMPORTANT: never let the backend overwrite a user-provided display_number.
      // Only fall back to invoice_number when the user did not provide any custom reference.
      display_number: (String(body.display_number ?? body.invoice_display_number ?? body.custom_invoice_ref ?? body.customInvoiceRef ?? body.invoiceNumber ?? '').trim() || invoiceNumber),
      store_id: body.store_id || null,
      client_name: body.client_name || "Unknown",
      client_phone: body.client_phone || null,
      client_address: body.client_address || null,
      client_ice: body.client_ice || null,
      payment_method: body.payment_method || "cash",
      bank_transfer_proof_url: body.bank_transfer_proof_url || null,
      total_amount: body.total_amount || 0,
      amount_paid: body.amount_paid || 0,
      remaining_balance: remainingBalance,
      // This is the per-invoice remise (MAD)
      pending_discount: remiseAmount,
      status: body.amount_paid >= body.total_amount ? "paid" : (body.amount_paid > 0 ? "partial" : "pending"),
      check_id: body.check_id || null,
      items: body.items || [],
      notes: body.notes || null,
      created_by: currentUser.id,
      };

      console.log("Insert data:", JSON.stringify(insertData, null, 2));

      // Insert invoice. If the DB hasn't been migrated/reloaded yet for display_number,
      // PostgREST returns PGRST204. In that case retry without display_number.
      let { data, error } = await supabase
        .from("invoices")
        .insert([insertData])
        .select();

      if (error && String(error.code || '') === 'PGRST204' && String(error.message || '').includes('display_number')) {
        const retryData: any = { ...insertData };
        delete retryData.display_number;

        const retry = await supabase
          .from("invoices")
          .insert([retryData])
          .select();

        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error("Insert error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Error details:", error.details);
        throw error;
      }

      console.log("Insert successful:", data);

      // STEP: Deduct stock from store_stocks for each item in the invoice
      const invoiceId = data?.[0]?.id;
      const items = body.items || [];
      const stockDeductionResults: any[] = [];
      
      console.log("=== STOCK DEDUCTION STEP ===");
      console.log(`Items array length: ${items.length}`);
      console.log(`Items array content:`, JSON.stringify(items, null, 2));
      
      if (items.length > 0) {
        console.log(`\n>>> Starting stock deduction for ${items.length} items...`);
        
        for (const item of items) {
          try {
            console.log(`\n--- Processing Item ---`);
            console.log(`Description: "${item.description}"`);
            console.log(`ProductId: "${item.productId}"`);
            console.log(`Quantity to Deduct: ${item.quantity}`);
            
            let productId = item.productId;
            
            // If productId is not provided, search for product matching the item description (case-insensitive)
            if (!productId) {
              const { data: matchingProducts, error: searchError } = await supabase
                .from("products")
                .select("id, name, reference")
                .ilike("name", `%${item.description}%`);
              
              if (searchError) {
                console.error(`Error searching for product "${item.description}":`, searchError);
                stockDeductionResults.push({ item: item.description, status: "error", error: searchError.message });
                continue;
              }
              
              console.log(`Searching for product matching: "%${item.description}%"`);
              console.log(`Found ${matchingProducts?.length || 0} matching products`);
              
              if (!matchingProducts || matchingProducts.length === 0) {
                console.warn(`⚠ No product found matching "${item.description}"`);
                stockDeductionResults.push({ item: item.description, status: "no_product_found" });
                continue;
              }
              
              // Use the first matching product
              productId = matchingProducts[0].id;
              console.log(`✓ Selected Product: ${matchingProducts[0].name} (ID: ${productId})`);
            } else {
              console.log(`✓ Using provided productId: ${productId}`);
            }
            
            // Get current user's store_id to deduct from their store
            const currentUser = await getCurrentUserWithRole(req);
            const userStoreId = currentUser?.store_id;
            
            console.log(`Current user store_id: ${userStoreId}`);
            
            if (!userStoreId) {
              console.warn(`⚠ User has no store_id assigned`);
              stockDeductionResults.push({ item: item.description, product: productId, status: "no_store" });
              continue;
            }
            
            const quantityToDeduct = item.quantity || 0;
            
            // Fetch current store_stocks for this product in user's store
            const { data: storeStockData, error: storeStockError } = await supabase
              .from("store_stocks")
              .select("id, quantity")
              .eq("product_id", productId)
              .eq("store_id", userStoreId)
              .single();
            
            if (storeStockError && storeStockError.code !== 'PGRST116') {
              console.error(`Error fetching store_stocks:`, storeStockError);
              stockDeductionResults.push({ item: item.description, product: productId, status: "error", error: storeStockError.message });
              continue;
            }
            
            if (storeStockError && storeStockError.code === 'PGRST116') {
              // No store_stocks entry exists, create one with negative quantity (or 0 if deduction exceeds)
              console.log(`No store_stocks entry found, creating new entry with deduction`);
              const newQuantity = Math.max(0, 0 - quantityToDeduct);
              
              const { error: insertError } = await supabase
                .from("store_stocks")
                .insert([{
                  product_id: productId,
                  store_id: userStoreId,
                  quantity: newQuantity,
                }]);
              
              if (insertError) {
                console.error(`Error creating store_stocks entry:`, insertError);
                stockDeductionResults.push({ item: item.description, product: productId, status: "error", error: insertError.message });
              } else {
                console.log(`✓ Created store_stocks entry with quantity: ${newQuantity}`);
                stockDeductionResults.push({ item: item.description, product: productId, status: "success", oldQty: 0, newQty: newQuantity });
              }
            } else if (storeStockData) {
              // Update existing store_stocks entry
              const currentQty = storeStockData.quantity || 0;
              const newQuantity = Math.max(0, currentQty - quantityToDeduct);
              
              console.log(`  Current Quantity in store_stocks: ${currentQty}`);
              console.log(`  Deducting: ${quantityToDeduct}`);
              console.log(`  New Quantity: ${newQuantity}`);
              
              const { error: updateError } = await supabase
                .from("store_stocks")
                .update({ quantity: newQuantity })
                .eq("id", storeStockData.id);
              
              if (updateError) {
                console.error(`  ✗ Error updating store_stocks:`, updateError);
                stockDeductionResults.push({ item: item.description, product: productId, status: "error", error: updateError.message });
              } else {
                console.log(`  ✓ Successfully updated store_stocks quantity`);
                stockDeductionResults.push({ item: item.description, product: productId, status: "success", oldQty: currentQty, newQty: newQuantity });
              }
            }
          } catch (itemError: any) {
            console.error(`Error processing item "${item.description}":`, itemError);
            stockDeductionResults.push({ item: item.description, status: "exception", error: itemError.message });
          }
        }
        
        console.log(`\n>>> Stock deduction completed for all items`);
        console.log("Stock deduction results:", JSON.stringify(stockDeductionResults, null, 2));
      }

      // If payment method is check and check_id is provided, update check status
      if (body.payment_method === "check" && body.check_id) {
        await supabase
          .from("check_inventory")
          .update({
            status: "used",
            usage_percentage: 100,
            remaining_balance: 0,
          })
          .eq("id", body.check_id);
      }

      return jsonResponse({ success: true, invoice: data?.[0], stockDeductionResults });
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      console.log("=== END INVOICE POST DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message, details: error.details }, 500);
    }
  }

  if (path.startsWith("/invoices/") && method === "PUT") {
    try {
      const invoiceId = path.split("/")[2];
      const body = await req.json();

      console.log("=== INVOICE EDIT DEBUG ===");
      console.log(`Invoice ID: ${invoiceId}`);
      console.log("Request body:", JSON.stringify(body, null, 2));

      // Fetch current invoice to get original items and total_amount
      const { data: current, error: fetchErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (fetchErr) throw fetchErr;

      console.log("Current invoice:", JSON.stringify(current, null, 2));

      const totalAmount = body.total_amount ?? current?.total_amount ?? 0;
      const amountPaid = body.amount_paid ?? 0;
      const remaining = Math.max(0, totalAmount - amountPaid);
      const status = amountPaid >= totalAmount ? "paid" : (amountPaid > 0 ? "partial" : "pending");

      // STEP 1: Process stock adjustments if provided
      if (body.stock_adjustments) {
        console.log("Processing stock adjustments:", JSON.stringify(body.stock_adjustments, null, 2));

        for (const [productId, netChange] of Object.entries(body.stock_adjustments)) {
          console.log(`\nProcessing product ${productId}: net change = ${netChange}`);

          // Get current store_stocks for this product
          const { data: storeStocks, error: stocksError } = await supabase
            .from("store_stocks")
            .select("*")
            .eq("product_id", productId);

          if (stocksError) {
            console.error(`Error fetching store_stocks for product ${productId}:`, stocksError);
            continue;
          }

          console.log(`Found ${storeStocks?.length || 0} store_stocks entries for product ${productId}`);

          // Apply net change to each store's stock
          if (storeStocks && storeStocks.length > 0) {
            for (const stock of storeStocks) {
              const newQuantity = Math.max(0, stock.quantity + (netChange as number));
              console.log(`  Store ${stock.store_id}: ${stock.quantity} + ${netChange} = ${newQuantity}`);

              const { error: updateError } = await supabase
                .from("store_stocks")
                .update({ quantity: newQuantity })
                .eq("id", stock.id);

              if (updateError) {
                console.error(`Error updating store_stocks ${stock.id}:`, updateError);
              } else {
                console.log(`  ✓ Updated store_stocks ${stock.id}`);
              }
            }
          } else {
            console.warn(`No store_stocks found for product ${productId}`);
          }
        }
      }

      // STEP 2: Update invoice with new items and totals
      // Remise for invoices is stored in invoices.pending_discount (existing schema).
      // Accept multiple keys so edits also persist correctly.
      const editRemiseAmount = (() => {
      const raw = body.total_remise ?? body.remise_amount ?? body.discount_amount ?? body.remise ?? body.pending_discount;
      if (raw === undefined || raw === null || raw === '') return undefined;
      const n = typeof raw === 'string' ? Number(String(raw).replace(',', '.')) : Number(raw);
      return Number.isFinite(n) ? Math.max(0, n) : undefined;
      })();
      
      const updateData: any = {
      items: body.items || current?.items || [],
      client_name: body.client_name || current?.client_name,
      client_phone: body.client_phone || current?.client_phone,
      client_address: body.client_address || current?.client_address,
      client_ice: body.client_ice || current?.client_ice,
      payment_method: body.payment_method || current?.payment_method,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      remaining_balance: remaining,
      status,
      notes: body.notes || current?.notes,
      paid_by_store_id: body.paid_by_store_id || current?.paid_by_store_id || null,
      paid_by_store_name: body.paid_by_store_name || current?.paid_by_store_name || null,
      payment_notes_admin: body.payment_notes_admin || current?.payment_notes_admin || null,
      updated_at: new Date().toISOString(),
      };
      
      if (editRemiseAmount !== undefined) updateData.pending_discount = editRemiseAmount;
      
      const { data, error } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", invoiceId)
      .select();

      if (error) throw error;

      console.log("Invoice updated successfully:", JSON.stringify(data?.[0], null, 2));
      console.log("=== END INVOICE EDIT DEBUG ===");

      return jsonResponse({ success: true, invoice: data?.[0] });
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      console.log("=== END INVOICE EDIT DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/invoices/") && method === "DELETE") {
    try {
      const invoiceId = path.split("/")[2];
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/documents" && method === "POST") {
    try {
      const body = await req.json();
      
      const documentTypeMeta: any = {
        Devis: "DEV",
        Facture: "FAC",
        "Bon Commande": "BC",
        "Bon Livraison": "BL"
      };
      
      const prefix = documentTypeMeta[body.type] || "DOC";
      const year = new Date().getFullYear();
      const nextSequence = Math.floor(Math.random() * 10000);
      const documentId = `${prefix}-${year}-${nextSequence.toString().padStart(4, "0")}`;
      
      const documentData = {
        id: documentId,
        type: body.type,
        clientName: body.clientName,
        clientEmail: body.clientEmail,
        clientAddress: body.clientAddress,
        clientICE: body.clientICE || "",
        date: body.date || new Date().toISOString(),
        items: body.items || [],
        notes: body.notes || "",
        paymentHeaderNote: body.paymentHeaderNote || "",
        factureVersion: body.factureVersion || "v1",
        remise: body.remise || 0,
        subtotal: body.subtotal || 0,
        totalRemise: body.totalRemise || 0,
        subtotalAfterRemise: body.subtotalAfterRemise || 0,
        tva: body.tva || 0,
        totalWithTVA: body.totalWithTVA || 0,
        created_at: new Date().toISOString(),
      };
      
      return jsonResponse({ 
        success: true, 
        document: documentData,
        id: documentId
      });
    } catch (error: any) {
      console.error("Error creating document:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/documents/") && path.endsWith("/pdf") && method === "GET") {
    try {
      const documentId = path.split("/")[2];
      const queryParams = new URLSearchParams(url.search);
      
      // Extract all query parameters
      let documentData: any = {
        clientName: queryParams.get("clientName") || "",
        clientEmail: queryParams.get("clientEmail") || queryParams.get("clientPhone") || "",
        clientAddress: queryParams.get("clientAddress") || "",
        clientICE: queryParams.get("clientICE") || "",
        clientIF: queryParams.get("clientIF") || "",
        clientRC: queryParams.get("clientRC") || "",
        clientPatente: queryParams.get("clientPatente") || "",
        companyAddress: queryParams.get("companyAddress") || "",
        companyPhone: queryParams.get("companyPhone") || "",
        companyEmail: queryParams.get("companyEmail") || "",
        companyICE: queryParams.get("companyICE") || "",
        companyIF: queryParams.get("companyIF") || "",
        companyRC: queryParams.get("companyRC") || "",
        companyPatente: queryParams.get("companyPatente") || "",
        date: queryParams.get("date") || new Date().toISOString().split('T')[0],
        paymentHeaderNote: queryParams.get("paymentHeaderNote") || "",
        subtotal: parseFloat(queryParams.get("subtotal") || "0"),
        totalRemise: parseFloat(queryParams.get("totalRemise") || "0"),
        tva: parseFloat(queryParams.get("tva") || "0"),
        tvaPercentage: parseFloat(queryParams.get("tvaPercentage") || "20"),
        totalWithTVA: parseFloat(queryParams.get("totalWithTVA") || "0"),
      };
      
      // Parse items from JSON string
      const itemsStr = queryParams.get("items");
      if (itemsStr) {
        try {
          documentData.items = JSON.parse(decodeURIComponent(itemsStr));
        } catch (e) {
          console.warn("Could not parse items from query params");
          documentData.items = [];
        }
      } else {
        documentData.items = [];
      }
      
      const templateUrl = 'https://fjvmssmimoujxzqketsx.supabase.co/storage/v1/object/public/logo/Entete%20DA-2.pdf%20(1).pdf';
      let pdfDoc: any;
      let page: any;
      
      try {
        const templateResponse = await fetch(templateUrl);
        if (templateResponse.ok) {
          const templateBytes = await templateResponse.arrayBuffer();
          pdfDoc = await PDFDocument.load(new Uint8Array(templateBytes));
          const pages = pdfDoc.getPages();
          if (pages.length > 0) {
            page = pages[0];
          } else {
            throw new Error("Template PDF has no pages");
          }
        } else {
          throw new Error(`Template fetch failed with status ${templateResponse.status}`);
        }
      } catch (templateError) {
        console.warn("Could not load template PDF, creating blank document:", templateError);
        pdfDoc = await PDFDocument.create();
        page = pdfDoc.addPage([595.28, 841.89]);
      }
      
      const { width, height } = page.getSize();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      const ORANGE = rgb(1, 0.6, 0);
      const GRAY = rgb(0.5, 0.5, 0.5);
      const BLUE = rgb(0.1, 0.5, 0.8);
      
      const margin = 40;
      const contentWidth = width - (margin * 2);
      
      let y = height - margin;
      const invoiceX = width - margin - 140;
      let invoiceY = y;
      
      // Determine document title based on type
      // Frontend can send multiple variants for BL/BC.
      const rawType = (queryParams.get("type") || queryParams.get("documentType") || "Facture").trim();
      const normalizedType = rawType.replace(/\s+/g, " ").toLowerCase();

      const isBonCommande = normalizedType === "boncommande" || normalizedType === "bon commande";
      const isBonLivraison = normalizedType === "bon livraison" || normalizedType === "bon de livraison" || normalizedType === "bl";

      let documentTitle = "FACTURE";
      if (isBonCommande) {
        documentTitle = "BON DE COMMANDE";
      } else if (isBonLivraison) {
        documentTitle = "BON DE LIVRAISON";
      }
      
      page.drawText(documentTitle, {
        x: invoiceX,
        y: invoiceY,
        size: 11,
        font: helveticaBold,
        color: ORANGE,
      });
      
      invoiceY -= 10;
      page.drawText("Date: " + (documentData.date || formatDateFrench(new Date())), {
        x: invoiceX,
        y: invoiceY,
        size: 8,
        font: helvetica,
      });
      
      invoiceY -= 8;
      const invoiceNumber = queryParams.get("invoiceNumber") || queryParams.get("invoice_number") || documentId;
      const blNumber = queryParams.get("blNumber") || queryParams.get("saleNumber") || queryParams.get("bl_number") || documentId;
      const displayNumber = isBonLivraison ? (blNumber || invoiceNumber || documentId) : (invoiceNumber || documentId);
      const label = (isBonCommande || isBonLivraison) ? "N° BL: " : "N° Facture: ";
      page.drawText(label + displayNumber, {
        x: invoiceX,
        y: invoiceY,
        size: 8,
        font: helvetica,
      });
      
      invoiceY -= 8;
      page.drawText("Statut: " + (documentData.paymentHeaderNote || "Non Payée"), {
        x: invoiceX,
        y: invoiceY,
        size: 8,
        font: helvetica,
        color: rgb(1, 0, 0),
      });
      
      // Client info on the LEFT side - moved down
      let clientLeftX = margin - 30;
      let clientLeftY = height - margin - 80;
      
      page.drawText("Nom: " + (documentData.clientName || "Client Name") + " | Tél: " + (documentData.clientEmail || "+212 XXX XXX XXX"), {
        x: clientLeftX,
        y: clientLeftY,
        size: 8,
        font: helvetica,
      });
      
      clientLeftY -= 8;
      page.drawText("Adresse: " + (documentData.clientAddress || "Client Address") + " | ICE: " + (documentData.clientICE || "XXXXXXXXXX"), {
        x: clientLeftX,
        y: clientLeftY,
        size: 8,
        font: helvetica,
      });
      
      // Company info on the FAR RIGHT side - moved down and slightly to the left
      let companyX = width - margin - 170;
      let companyY = height - margin - 75;
      
      
      
      companyY -= 8;
      // Only show IF, RC, Patente if they are provided and not placeholder values
      const companyIfText = documentData.companyIF && documentData.companyIF !== 'XXXXXXXXXX' ? `IF: ${documentData.companyIF}` : '';
      const companyRcText = documentData.companyRC && documentData.companyRC !== 'XXXXXXXXXX' ? `RC: ${documentData.companyRC}` : '';
      const companyPatenteText = documentData.companyPatente && documentData.companyPatente !== 'XXXXXXXXXX' ? `Patente: ${documentData.companyPatente}` : '';
      const companyExtraFields = [companyIfText, companyRcText, companyPatenteText].filter(t => t).join(' | ');
      
      if (companyExtraFields) {
        page.drawText(companyExtraFields, {
          x: companyX,
          y: companyY,
          size: 7,
          font: helvetica,
        });
      }
      
      y = companyY - 70; // the hight and to postion of  the table and all the info dowen 
      
      const tableX = margin - 40;
      const tableW = contentWidth + 40;//to make it move right iminimz the num
      const headerHeight = 14;
      
      const colNoWidth = 25;
      const colDescWidth = 120;
      const colCaisseWidth = 80;
      const colQtyWidth = 50;
      const colMoyWidth = 50;
      const colPriceWidth = 70;
      const colTotalWidth = 60;
      
      page.drawRectangle({
        x: tableX,
        y: y - headerHeight,
        width: tableW,
        height: headerHeight,
        color: rgb(0.9, 0.9, 0.9),
      });
      
      page.drawText("No", {
        x: tableX + 6,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Description", {
        x: tableX + colNoWidth + 6,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Caisse", {
        x: tableX + colNoWidth + colDescWidth + 6,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Quantité", {
        x: tableX + colNoWidth + colDescWidth + colCaisseWidth + 6 - 40,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Moyenne", {
        x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + 6 - 40,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Prix Unitaire", {
        x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + colMoyWidth + 6 - 40,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      page.drawText("Sous-total", {
        x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + colMoyWidth + colPriceWidth + 6 - 40,
        y: y - 11,
        size: 7,
        font: helveticaBold,
      });
      
      y -= headerHeight + 10;
      
      const items = documentData.items || [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        page.drawText(String(i + 1), {
          x: tableX + 6,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(item.description || "", {
          x: tableX + colNoWidth + 6,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(item.caisse || "", {
          x: tableX + colNoWidth + colDescWidth + 6,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(String(item.quantity || 0), {
          x: tableX + colNoWidth + colDescWidth + colCaisseWidth + 6 - 40,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(item.moyenne || "", {
          x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + 6 - 40,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(formatMoney(item.unitPrice || 0) + " MAD", {
          x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + colMoyWidth + 6 - 40,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        page.drawText(formatMoney(item.total || 0) + " MAD", {
          x: tableX + colNoWidth + colDescWidth + colCaisseWidth + colQtyWidth + colMoyWidth + colPriceWidth + 6 - 40,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        y -= 14;
      }
      
      y -= 12;
      
      const totalsStartX = tableX + 280;
      const totalsValueX = totalsStartX + 100;
      
      page.drawText("Sous-total HT:", {
        x: totalsStartX,
        y: y,
        size: 7,
        font: helveticaBold,
      });
      page.drawText(formatMoney(documentData.subtotal || 0) + " MAD", {
        x: totalsValueX,
        y: y,
        size: 7,
        font: helvetica,
      });
      
      y -= 10;
      
      // Show Remise and TVA only for non-Bon de Commande documents
      if (!isBonCommande) {
        page.drawText("Remise (MAD):", {
          x: totalsStartX,
          y: y,
          size: 7,
          font: helveticaBold,
        });
        page.drawText(formatMoney(documentData.totalRemise || 0) + " MAD", {
          x: totalsValueX,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        y -= 10;
        
        page.drawText(`TVA (${documentData.tvaPercentage}%):`, {
          x: totalsStartX,
          y: y,
          size: 7,
          font: helveticaBold,
        });
        page.drawText(formatMoney(documentData.tva || 0) + " MAD", {
          x: totalsValueX,
          y: y,
          size: 7,
          font: helvetica,
        });
        
        y -= 8;
      } else {
        // For Bon de Commande, show remise with percentage if applicable
        const remisePercentage = parseFloat(queryParams.get("remisePercentage") || "0");
        if (remisePercentage > 0) {
          page.drawText(`Remise (${remisePercentage}%):`, {
            x: totalsStartX,
            y: y,
            size: 7,
            font: helveticaBold,
          });
          page.drawText(formatMoney(documentData.totalRemise || 0) + " MAD", {
            x: totalsValueX,
            y: y,
            size: 7,
            font: helvetica,
          });
          
          y -= 10;
        }
      }
      
      page.drawLine({
        start: { x: totalsStartX, y: y },
        end: { x: totalsValueX + 60, y: y },
        color: ORANGE,
        thickness: 1,
      });
      
      y -= 10;
      
      page.drawText(isBonCommande ? "Total:" : "Total TTC:", {
        x: totalsStartX,
        y: y,
        size: 8,
        font: helveticaBold,
        color: ORANGE,
      });
      page.drawText(formatMoney(documentData.totalWithTVA || 0) + " MAD", {
        x: totalsValueX,
        y: y,
        size: 8,
        font: helveticaBold,
        color: ORANGE,
      });
      
      const pdfBytes = await pdfDoc.save();
      
      return new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${documentId}.pdf"`,
          ...corsHeaders,
        },
      });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // DISCOUNTS ENDPOINTS
  if (path === "/discounts" && method === "GET") {
    try {
      const { data, error } = await supabase
        .from("discounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Enrich discounts with supplier_id and normalize field names for easier filtering
      const enrichedDiscounts = (data || []).map((discount: any) => ({
        ...discount,
        supplier_id: discount.entity_type === 'supplier' ? (discount.supplier_id || discount.entity_id) : null,
        // Normalize amount field for backward compatibility
        amount: discount.discount_amount || discount.amount || 0,
      }));
      
      return jsonResponse({ discounts: enrichedDiscounts });
    } catch (error: any) {
      console.error("Error fetching discounts:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/discounts" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUser(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const discountAmount = Number(body.discount_amount ?? body.discountAmount ?? 0) || 0;
      if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
        return jsonResponse({ error: "discount_amount must be > 0" }, 400);
      }

      const refTable = String(body.ref_table ?? body.refTable ?? "").trim() || null;
      const refId = body.ref_id ?? body.refId ?? null;

      const { data, error } = await supabase
        .from("discounts")
        .insert([
          {
            entity_type: body.entity_type,
            entity_name: body.entity_name,
            entity_id: body.entity_id || null,
            supplier_id: body.entity_type === 'supplier' ? (body.entity_id || null) : null,
            discount_percentage: Number(body.discount_percentage ?? body.discountPercentage ?? 0) || 0,
            // IMPORTANT: use discount_amount only (never mix with payment amount)
            discount_amount: discountAmount,
            reason: body.reason ?? body.notes ?? null,
            status: body.status || "active",
            created_by: currentUser.id,
            applied_date: body.applied_date ?? body.appliedDate ?? new Date().toISOString(),
            // Link fields (must be persisted for caisse to join remise with payment)
            ref_table: refTable,
            ref_id: refId,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, discount: data?.[0] });
    } catch (error: any) {
      console.error("Error creating discount:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/discounts/") && method === "PUT") {
    try {
      const discountId = path.split("/")[2];
      const body = await req.json();

      const { data, error } = await supabase
        .from("discounts")
        .update({
          entity_type: body.entity_type,
          entity_name: body.entity_name,
          entity_id: body.entity_id || null,
          supplier_id: body.entity_type === 'supplier' ? (body.entity_id || null) : null,
          discount_percentage: body.discount_percentage || 0,
          // IMPORTANT: use discount_amount only (never mix with payment amount)
          discount_amount: Number(body.discount_amount ?? body.discountAmount ?? 0) || 0,
          reason: body.reason ?? body.notes ?? null,
          applied_date: body.applied_date ?? body.appliedDate ?? new Date().toISOString(),
          // Link fields (must be persisted for caisse to join remise with payment)
          ref_table: String(body.ref_table ?? body.refTable ?? '') || null,
          ref_id: body.ref_id ?? body.refId ?? null,
          status: body.status || "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", discountId)
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, discount: data?.[0] });
    } catch (error: any) {
      console.error("Error updating discount:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/discounts/") && method === "DELETE") {
    try {
      const discountId = path.split("/")[2];
      const { error } = await supabase
        .from("discounts")
        .delete()
        .eq("id", discountId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting discount:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Expenses endpoints (Le Charge - withdrawals from cash)
  // ===== Caisse expenses (dedicated endpoint for CashManagementPage) =====
  // Isolated endpoint so we don't impact other modules using /expenses.
  // Returns ONLY CAISSE movements for the store scope.
  // IMPORTANT:
  // - Coffre movements (expense_type=coffer_*) must NOT appear in Caisse.
  // - Supplier normal payments/advances are Coffre operations, so they are logged as coffer_out_*.
  // - We still keep caisse_out_* (mirror) for actual caisse→coffre transfers and other caisse outflows.
  if (path === "/caisse-expenses" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);
  
  const scope = resolveStoreScope(currentUser, req);
  
  let q = supabase
  .from("expenses")
  .select("*")
  .order("created_at", { ascending: false });
  
  q = applyStoreScope(q, "store_id", scope);
  
  // Exclude all Coffre movements.
  // This avoids showing "Avance Fournisseur" and "Paiement Fournisseur" in Caisse history.
  q = q.not('expense_type', 'ilike', 'coffer_%');
  
  // Also exclude legacy/typo variants if they exist.
  q = q.not('expense_type', 'ilike', 'coffre_%');
  
  const { data, error } = await q;
  if (error) throw error;
  
  return jsonResponse({ expenses: data || [] });
  } catch (error: any) {
  console.error("Error fetching caisse expenses:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path === "/expenses" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  
  if (!currentUser) {
  return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  const url = new URL(req.url);
  const requestedStoreId = String(url.searchParams.get('store_id') || '').trim() || null;
  const startDateStr = String(url.searchParams.get('start_date') || '').trim() || null;
  const endDateStr = String(url.searchParams.get('end_date') || '').trim() || null;
  
  // Store scoping:
  // - Admin can request any store_id (or omit to get all)
  // - Non-admin always forced to their own store_id
  const role = String(currentUser.role || '').toLowerCase();
  const storeId = role === 'admin' ? requestedStoreId : (currentUser.store_id ? String(currentUser.store_id) : null);
  
  let query = supabase
  .from("expenses")
  .select("*")
  .order("created_at", { ascending: false });
  
  if (storeId) {
  query = query.eq('store_id', storeId);
  }
  
  // Date range filtering (inclusive)
  if (startDateStr) {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  query = query.gte('created_at', start.toISOString());
  }
  
  if (endDateStr) {
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);
  query = query.lte('created_at', end.toISOString());
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return jsonResponse({ expenses: data || [] });
  } catch (error: any) {
  console.error("Error fetching expenses:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path === "/expenses" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const role = String((currentUser as any)?.role || "").toLowerCase();
      const isAdmin = role === "admin";

      // Resolve store scope:
      // - Admin can specify store_id
      // - Non-admin must be restricted to their own store
      //   (fallback to auth.user_metadata.store_id for accounts not backfilled into public.users)
      const requestedStoreId = body.store_id ? String(body.store_id).trim() : "";
      const metaStoreId = String((currentUser as any)?.user_metadata?.store_id || "").trim();
      const myStoreId = String(currentUser.store_id || "").trim() || metaStoreId;
      const effectiveStoreId = isAdmin ? (requestedStoreId || myStoreId) : myStoreId;

      if (!effectiveStoreId) {
        // Without a store_id the UI will never show the row (and it's unsafe to create store-scoped expense)
        return jsonResponse({ error: "store_id is required" }, 400);
      }

      const amount = typeof body.amount === "string"
      ? Number(String(body.amount).replace(",", "."))
      : Number(body.amount);
      
      // Allow creating a new coffer with a 0-balance seed row.
      // Only `expense_type=coffer_seed` may have amount === 0.
      const expenseType = String(body.expense_type || "").trim();
      const isCofferSeed = expenseType === "coffer_seed";
      
      if (!Number.isFinite(amount) || (isCofferSeed ? amount < 0 : amount <= 0)) {
      return jsonResponse(
      { error: isCofferSeed ? "amount must be >= 0" : "amount must be > 0" },
      400,
      );
      }

      const reason = String(body.reason || "").trim();
      if (!reason) return jsonResponse({ error: "reason is required" }, 400);

      const insertRow: any = {
        store_id: effectiveStoreId,
        amount,
        reason,
        proof_file: body.proof_file || null,
        proof_file_type: body.proof_file_type || null,
        proof_file_name: body.proof_file_name || null,
        expense_type: body.expense_type || null,
        created_by: currentUser.id,
        updated_at: new Date().toISOString(),
      };

      // Best-effort notes support (some DBs may not have the column)
      if (body.notes) insertRow.notes = String(body.notes);

      const firstTry = await supabase
        .from("expenses")
        .insert([insertRow])
        .select()
        .limit(1);

      if (!firstTry.error) {
        return jsonResponse({ success: true, expense: firstTry.data?.[0] });
      }

      const msg = String(firstTry.error?.message || "");
      const missingNotes = msg.includes("Could not find the 'notes' column") ||
        msg.includes('Could not find the "notes" column') ||
        (msg.toLowerCase().includes("schema cache") && msg.toLowerCase().includes("notes"));

      if (missingNotes) {
        const retryRow: any = { ...insertRow };
        delete retryRow.notes;

        const retry = await supabase
          .from("expenses")
          .insert([retryRow])
          .select()
          .limit(1);

        if (retry.error) throw retry.error;
        return jsonResponse({ success: true, expense: retry.data?.[0] });
      }

      throw firstTry.error;
    } catch (error: any) {
      console.error("Error creating expense:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/expenses/") && method === "DELETE") {
    try {
      const expenseId = path.split("/")[2];
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Get the expense to check ownership
      const { data: expense, error: fetchError } = await supabase
        .from("expenses")
        .select("created_by, store_id")
        .eq("id", expenseId)
        .single();

      if (fetchError) throw fetchError;

      // Only allow deletion if user is admin or created the expense
      if (currentUser.role !== "admin" && expense.created_by !== currentUser.id) {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting expense:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // Coffer Expenses endpoints (Dépenses Coffre - expenses from coffer)
  if (path === "/coffer-expenses" && method === "POST") {
  try {
  const body = await req.json();
  const currentUser = await getCurrentUserWithRole(req);
  
  if (!currentUser) {
  return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  // Allow custom expense_type for coffer movements (ex: coffer_transfer_check_bank)
  const requestedType = String(body.expense_type || '').trim();
  const expenseType = requestedType || "coffer_expense";
  
  // IMPORTANT: Coffer expenses are OUTFLOWS and must REDUCE coffer totals.
  // Store as NEGATIVE amount so the view correctly deducts from espèce.
  const expenseAmount = -Math.abs(Number(body.amount) || 0);
  
  // Resolve store_id: use current user's store so the expense is scoped correctly
  const storeId = currentUser.store_id ? String(currentUser.store_id).trim() : null;
  
  const { data, error } = await supabase
  .from("expenses")
  .insert([
  {
  store_id: storeId,
  coffer_id: body.coffer_id || "main",
  amount: expenseAmount,
  reason: body.reason,
  proof_file: body.proof_file || null,
  proof_file_type: body.proof_file_type || null,
  proof_file_name: body.proof_file_name || null,
  expense_type: expenseType,
  created_by: currentUser.id,
  },
  ])
  .select();
  
  if (error) throw error;
  return jsonResponse({ success: true, expense: data?.[0] });
  } catch (error: any) {
  console.error("Error creating coffer expense:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  // Cash Payments endpoints
  if (path === "/cash-payments" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);
      
      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let query = supabase
        .from("cash_payments")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show payments from their store
      if (currentUser.role !== "admin" && currentUser.store_id) {
        query = query.eq("store_id", currentUser.store_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ payments: data || [] });
    } catch (error: any) {
      console.error("Error fetching cash payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/cash-payments" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data, error } = await supabase
        .from("cash_payments")
        .insert([
          {
            store_id: body.store_id || currentUser.store_id || null,
            amount: body.amount,
            reason: body.reason,
            proof_file: body.proof_file || null,
            proof_file_type: body.proof_file_type || null,
            proof_file_name: body.proof_file_name || null,
            created_by: currentUser.id,
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, payment: data?.[0] });
    } catch (error: any) {
      console.error("Error creating cash payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/cash-payments/") && method === "DELETE") {
    try {
      const paymentId = path.split("/")[2];
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Get the payment to check ownership
      const { data: payment, error: fetchError } = await supabase
        .from("cash_payments")
        .select("created_by, store_id")
        .eq("id", paymentId)
        .single();

      if (fetchError) throw fetchError;

      // Only allow deletion if user is admin or created the payment
      if (currentUser.role !== "admin" && payment.created_by !== currentUser.id) {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const { error } = await supabase
        .from("cash_payments")
        .delete()
        .eq("id", paymentId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting cash payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/check-safe" && method === "GET") {
  try {
  const currentUser = await getCurrentUserWithRole(req);
  const url = new URL(req.url);
  const cofferId = url.searchParams.get("coffer_id") || "main";
  
  let query = supabase
  .from("check_safe")
  .select("*")
  .eq("coffer_id", cofferId)
  .order("created_at", { ascending: false });
  
  // If user has a store_id and is not admin, filter by that store
  if (currentUser && currentUser.store_id && currentUser.role !== "admin") {
  query = query.eq("store_id", currentUser.store_id);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return jsonResponse({ check_safe: data || [] });
  } catch (error: any) {
  console.error("Error fetching check safe:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path === "/check-safe" && method === "POST") {
  try {
  const body = await req.json();
  const currentUser = await getCurrentUserWithRole(req);
  
  if (!currentUser) {
  return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  // Resolve store scope (NEVER allow NULL store_id in check_safe)
  const role = String((currentUser as any).role || "").toLowerCase();
  const requestedStoreId = body.store_id ? String(body.store_id).trim() : "";
  const effectiveStoreId = role === "admin"
  ? (requestedStoreId || "")
  : (currentUser.store_id ? String(currentUser.store_id).trim() : "");
  
  if (!effectiveStoreId) {
  return jsonResponse({ error: "store_id is required" }, 400);
  }
  
  const cofferId = String(body.coffer_id || "main").trim() || "main";
  const checkId = body.check_id ? String(body.check_id).trim() : "";
  if (!checkId) return jsonResponse({ error: "check_id is required" }, 400);
  
  // Get the check details
  const { data: checkData, error: checkError } = await supabase
  .from("checks")
  .select("*")
  .eq("id", checkId)
  .single();
  
  if (checkError) throw checkError;
  
  const { data, error } = await supabase
  .from("check_safe")
  .insert([
  {
  check_id: checkId,
  store_id: effectiveStoreId,
  sale_id: body.sale_id || null,
  coffer_id: cofferId,
  check_number: (checkData as any).check_number,
  amount: (checkData as any).amount,
  status: "pending",
  // Backfill check dates when available in the source table
  // (these columns exist on check_safe per later handler usage)
  check_date: (checkData as any).check_date || null,
  check_due_date: (checkData as any).check_due_date || (checkData as any).due_date || null,
  verification_notes: body.verification_notes || null,
  created_by: currentUser?.id || null,
  },
  ])
  .select();
  
  if (error) throw error;
  return jsonResponse({ success: true, check_safe: data?.[0] });
  } catch (error: any) {
  console.error("Error adding check to safe:", error);
  return jsonResponse({ error: error.message }, 500);
  }
  }

  if (path.startsWith("/check-safe/") && method === "PUT") {
    try {
      const checkSafeId = path.split("/")[2];
      const body = await req.json();
      const currentUser = await getCurrentUser(req);

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (body.status !== undefined) {
        updateData.status = body.status;

        // Set timestamps based on status transitions
        if (body.status === "verified") {
          updateData.verified_by = currentUser?.id;
          updateData.verified_at = new Date().toISOString();
        } else if (body.status === "confirmed") {
          updateData.confirmed_by = currentUser?.id;
          updateData.confirmed_at = new Date().toISOString();
        } else if (body.status === "in_safe") {
          updateData.placed_in_safe_by = currentUser?.id;
          updateData.placed_in_safe_at = new Date().toISOString();
        } else if (body.status === "transferred") {
          updateData.payment_transferred = true;
          updateData.payment_transferred_at = new Date().toISOString();
          updateData.payment_transferred_by = currentUser?.id;
        }
      }

      if (body.verification_notes !== undefined) {
        updateData.verification_notes = body.verification_notes;
      }
      if (body.confirmation_notes !== undefined) {
        updateData.confirmation_notes = body.confirmation_notes;
      }

      // Optional: store a human note describing where/how this payment was transferred
      // (ex: "Attijari", "BMCE", "Paiement fournisseur ...").
      if (body.payment_transferred_note !== undefined) {
        updateData.payment_transferred_note = body.payment_transferred_note;
      }

      const { data, error } = await supabase
        .from("check_safe")
        .update(updateData)
        .eq("id", checkSafeId)
        .select();

      if (error) throw error;

      // If status is "in_safe", automatically update the sale payment status
      if (body.status === "in_safe" && data?.[0]?.sale_id) {
        const { error: saleError } = await supabase
          .from("sales")
          .update({
            payment_status: "paid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", data[0].sale_id);

        if (saleError) {
          console.error("Error updating sale payment status:", saleError);
        } else {
          console.log(`Sale ${data[0].sale_id} payment status updated to 'paid'`);
        }
      }

      return jsonResponse({ success: true, check_safe: data?.[0] });
    } catch (error: any) {
      console.error("Error updating check safe:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/check-safe/") && method === "DELETE") {
    try {
      const checkSafeId = path.split("/")[2];
      const { error } = await supabase
        .from("check_safe")
        .delete()
        .eq("id", checkSafeId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting check safe:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/check-safe/transfer" && method === "POST") {
    try {
      const body = await req.json();
      // IMPORTANT: use role-aware user so we can resolve store_id for caisse history insert.
      const currentUser = await getCurrentUserWithRole(req);

      const checkInventoryId = String(body.check_inventory_id || "").trim();
      if (!checkInventoryId) {
        return jsonResponse({ error: "check_inventory_id is required" }, 400);
      }

      // Get the check inventory item
      const { data: checkInventory, error: checkError } = await supabase
        .from("check_inventory")
        .select("*")
        .eq("id", checkInventoryId)
        .single();

      if (checkError) throw checkError;

      // Security: prevent transferring the same check twice
      if ((checkInventory as any)?.transferred_to_safe) {
        return jsonResponse({ error: "Ce chèque a déjà été transféré au coffre" }, 409);
      }

      // Legacy safeguard: if row already exists in check_safe, block and backfill flag
      const { data: existingSafe, error: existErr } = await supabase
        .from("check_safe")
        .select("id")
        .eq("check_inventory_id", checkInventoryId)
        .limit(1);

      if (existErr) throw existErr;
      if (existingSafe && existingSafe.length > 0) {
        await supabase
          .from("check_inventory")
          .update({ transferred_to_safe: true, updated_at: new Date().toISOString() })
          .eq("id", checkInventoryId);
        return jsonResponse({ error: "Ce chèque a déjà été transféré au coffre" }, 409);
      }

      // Create check safe record with coffer_id
      // IMPORTANT: "pending" means it still requires the Coffre workflow steps.
      // For cheques coming from Clients Magasins → Paiements Reçus, we want to SKIP the Coffre transfer step
      // and land directly in the LAST step. In this Coffre system, the last step is `in_safe`.
      // We detect that origin using the notes marker written on the check_inventory row.
      const invNotes = String((checkInventory as any)?.notes || '').toLowerCase();
      const isClientsMagasinsOrigin = invNotes.includes('depuis page clients magasins');

      // Normalize coffer id and store id for downstream caisse mirror movement.
      const requestedCofferId = String(body.coffer_id || 'main').trim() || 'main';

      // Resolve store_id for caisse mirror movement:
      // 1) explicit body.store_id
      // 2) current user store_id (from getCurrentUserWithRole)
      // 3) fallback to cheque receiver store (given_to_id) if it looks like a UUID
      const storeIdFromBody = String(body.store_id || '').trim() || null;
      const storeIdFromUser = (currentUser as any)?.store_id ? String((currentUser as any).store_id).trim() : null;
      const storeIdFromInventory = (checkInventory as any)?.given_to_id ? String((checkInventory as any).given_to_id).trim() : null;
      const looksLikeUuid = (v: string | null) => !!v && /^[0-9a-f\-]{36}$/i.test(v);

      const resolvedStoreId = storeIdFromBody || storeIdFromUser || (looksLikeUuid(storeIdFromInventory) ? storeIdFromInventory : null);
      
      const initialSafeStatus = isClientsMagasinsOrigin ? 'in_safe' : 'pending';
      
      const { data: checkSafe, error: safeError } = await supabase
      .from("check_safe")
      .insert([
      {
      check_inventory_id: checkInventoryId,
      check_id: null, // Not linked to checks table, linked to inventory
      store_id: resolvedStoreId,
      admin_id: body.admin_id || currentUser?.id || null,
      sale_id: body.sale_id || null,
      coffer_id: requestedCofferId, // Use selected coffer or default to main
      check_number: checkInventory.check_id_number,
      amount: checkInventory.amount_value,
      status: initialSafeStatus,
      // Store dates on check_safe so the Coffre table can display "Date du chèque"
      // Source-of-truth is check_inventory
      check_date: (checkInventory as any)?.check_date || null,
      check_due_date: (checkInventory as any)?.due_date || null,
      // Persist giver name so Coffre can display "Donneur"
      // check_inventory uses "given_to" as the giver label.
      giver_name: (checkInventory as any)?.given_to || null,
      verification_notes: body.verification_notes || null,
      created_by: currentUser?.id || null,
      // Auto-fill the "in safe" audit fields when we skip to the last step
      placed_in_safe_by: isClientsMagasinsOrigin ? (currentUser?.id || null) : null,
      placed_in_safe_at: isClientsMagasinsOrigin ? new Date().toISOString() : null,
      },
      ])
      .select();

      if (safeError) throw safeError;

      // Update check inventory status to mark it as transferred
      // For Clients Magasins-origin cheques we also move it to the last step (`in_safe`).
      const nextInventoryStatus = isClientsMagasinsOrigin ? 'in_safe' : 'received';
      
      const { error: updateError } = await supabase
      .from("check_inventory")
      .update({
      status: nextInventoryStatus,
      transferred_to_safe: true,
      // Also set coffer_id so the cheque is clearly marked as transferred.
      coffer_id: requestedCofferId,
      updated_at: new Date().toISOString(),
      })
      .eq("id", checkInventoryId);

      if (updateError) throw updateError;

      // Create a caisse mirror movement so it appears in Caisse history.
      // This is correct ONLY when the cheque is coming from a MAGASIN caisse (Clients Magasins flow).
      // For Coffre-only operations (ex: supplier advances / supplier payments using a safe cheque),
      // we must NOT write a caisse movement.
      //
      // We detect Clients Magasins origin using the notes marker on check_inventory.
      if (isClientsMagasinsOrigin) {
      if (!resolvedStoreId) {
      console.warn('[check-safe/transfer] could not resolve store_id for caisse_out_check expense. Provide body.store_id or ensure user has store_id.', {
      check_inventory_id: checkInventoryId,
      body_store_id: (body as any)?.store_id || null,
      user_store_id: (currentUser as any)?.store_id || null,
      inventory_given_to_id: (checkInventory as any)?.given_to_id || null,
      });
      } else {
      const { error: expenseErr } = await supabase
      .from('expenses')
      .insert([
      {
      store_id: resolvedStoreId,
      coffer_id: requestedCofferId,
      amount: -Math.abs(Number((checkInventory as any)?.amount_value || 0) || 0),
      expense_type: 'caisse_out_check',
      reason: `Versement au coffre (check) → ${requestedCofferId}`,
      created_by: (currentUser as any)?.id || null,
      created_by_email: (currentUser as any)?.email || null,
      },
      ]);
      
      if (expenseErr) {
      console.error('[check-safe/transfer] failed to insert caisse_out_check expense:', expenseErr);
      // do not fail transfer; cheque is already in check_safe
      }
      }
      }

      return jsonResponse({ success: true, check_safe: checkSafe?.[0] });
    } catch (error: any) {
      console.error("Error transferring check to safe:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // ===== BORROWED MONEY ENDPOINTS =====

  if (path === "/borrowed-money" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let query = supabase
        .from("borrowed_money")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show their borrowed money
      if (currentUser.role !== "admin") {
        query = query.eq("admin_id", currentUser.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ borrowed_money: data || [] });
    } catch (error: any) {
      console.error("Error fetching borrowed money:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/borrowed-money" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data, error } = await supabase
        .from("borrowed_money")
        .insert([
          {
            admin_id: currentUser.id,
            borrower_name: body.borrower_name,
            borrower_phone: body.borrower_phone || null,
            borrower_email: body.borrower_email || null,
            amount: parseFloat(body.amount),
            currency: body.currency || "MAD",
            loan_date: new Date().toISOString(),
            due_date: body.due_date || null,
            status: "active",
            notes: body.notes || null,
          },
        ])
        .select();

      if (error) throw error;

      // Add the loan amount to check_safe (Gestion des Coffres)
      const loanAmount = parseFloat(body.amount);
      const { error: checkSafeError } = await supabase
        .from("check_safe")
        .insert([
          {
            admin_id: currentUser.id,
            check_number: `LOAN-${Date.now()}`,
            amount: loanAmount,
            status: "pending",
            inventory_name: `Prêt à ${body.borrower_name}`,
            notes: `Prêt enregistré - ${body.notes || ""}`,
            coffer_id: "main",
          },
        ]);

      if (checkSafeError) {
        console.error("Error adding loan to check_safe:", checkSafeError);
        // Don't throw - loan was created successfully, just log the error
      }

      return jsonResponse({
        success: true,
        borrowed_money: data?.[0],
        message: "Prêt enregistré avec succès et ajouté aux coffres",
      });
    } catch (error: any) {
      console.error("Error creating borrowed money:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/borrowed-money/") && method === "DELETE") {
    try {
      const borrowedMoneyId = path.split("/")[2];
      const { error } = await supabase
        .from("borrowed_money")
        .delete()
        .eq("id", borrowedMoneyId);

      if (error) throw error;
      return jsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error deleting borrowed money:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/borrowed-money-payments" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let query = supabase
        .from("borrowed_money_payments")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show payments for their borrowed money
      if (currentUser.role !== "admin") {
        query = query.in(
          "borrowed_money_id",
          (await supabase
            .from("borrowed_money")
            .select("id")
            .eq("admin_id", currentUser.id)).data?.map((bm: any) => bm.id) || []
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ payments: data || [] });
    } catch (error: any) {
      console.error("Error fetching borrowed money payments:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/borrowed-money-payments" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Create payment record
      const { data: paymentData, error: paymentError } = await supabase
        .from("borrowed_money_payments")
        .insert([
          {
            borrowed_money_id: body.borrowed_money_id,
            payment_amount: parseFloat(body.payment_amount),
            payment_method: body.payment_method,
            reference_number: body.reference_number || null,
            notes: body.notes || null,
          },
        ])
        .select();

      if (paymentError) throw paymentError;

      const paymentId = paymentData?.[0]?.id;

      // If payment method is check, create check record
      if (body.payment_method === "check" && body.check_data && paymentId) {
        const checkData = body.check_data;
        const { error: checkError } = await supabase
          .from("borrowed_money_checks")
          .insert([
            {
              borrowed_money_payment_id: paymentId,
              check_number: checkData.check_number,
              check_amount: parseFloat(checkData.check_amount),
              check_date: checkData.check_date || null,
              check_due_date: checkData.check_due_date || null,
              bank_name: checkData.bank_name || null,
              check_status: "received",
              inventory_name: checkData.inventory_name || null,
            },
          ]);

        if (checkError) {
          console.error("Error creating check record:", checkError);
          // Don't fail the payment if check creation fails
        }
      }

      // Update borrowed money status based on payment
      const { data: borrowedMoney, error: bmError } = await supabase
        .from("borrowed_money")
        .select("amount")
        .eq("id", body.borrowed_money_id)
        .single();

      if (!bmError && borrowedMoney) {
        // Get total paid so far
        const { data: allPayments, error: allPaymentsError } = await supabase
          .from("borrowed_money_payments")
          .select("payment_amount")
          .eq("borrowed_money_id", body.borrowed_money_id);

        if (!allPaymentsError && allPayments) {
          const totalPaid = allPayments.reduce((sum: number, p: any) => sum + (p.payment_amount || 0), 0);
          let newStatus = "active";

          if (totalPaid >= borrowedMoney.amount) {
            newStatus = "fully_paid";
          } else if (totalPaid > 0) {
            newStatus = "partially_paid";
          }

          await supabase
            .from("borrowed_money")
            .update({ status: newStatus })
            .eq("id", body.borrowed_money_id);
        }
      }

      return jsonResponse({ success: true, payment: paymentData?.[0] });
    } catch (error: any) {
      console.error("Error creating borrowed money payment:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/borrowed-money-checks" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let query = supabase
        .from("borrowed_money_checks")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show checks for their borrowed money
      if (currentUser.role !== "admin") {
        query = query.in(
          "borrowed_money_payment_id",
          (await supabase
            .from("borrowed_money_payments")
            .select("id")
            .in(
              "borrowed_money_id",
              (await supabase
                .from("borrowed_money")
                .select("id")
                .eq("admin_id", currentUser.id)).data?.map((bm: any) => bm.id) || []
            )).data?.map((p: any) => p.id) || []
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ checks: data || [] });
    } catch (error: any) {
      console.error("Error fetching borrowed money checks:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/check-safe" && method === "GET") {
    try {
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let query = supabase
        .from("check_safe")
        .select("*")
        .order("created_at", { ascending: false });

      // If user is not admin, only show their check safe entries
      if (currentUser.role !== "admin") {
        query = query.eq("admin_id", currentUser.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return jsonResponse({ check_safe: data || [] });
    } catch (error: any) {
      console.error("Error fetching check safe:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path === "/check-safe" && method === "POST") {
    try {
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data, error } = await supabase
        .from("check_safe")
        .insert([
          {
            admin_id: currentUser.id,
            check_number: body.check_number || null,
            amount: parseFloat(body.amount),
            status: body.status || "pending",
            check_date: body.check_date || null,
            check_due_date: body.check_due_date || null,
            bank_name: body.bank_name || null,
            inventory_name: body.inventory_name || null,
            notes: body.notes || null,
            coffer_id: body.coffer_id || "main",
          },
        ])
        .select();

      if (error) throw error;
      return jsonResponse({ success: true, check_safe: data?.[0] });
    } catch (error: any) {
      console.error("Error creating check safe entry:", error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  if (path.startsWith("/check-inventory/") && path.includes("/return") && method === "POST") {
    try {
      const checkId = path.split("/")[2];
      const body = await req.json();
      const currentUser = await getCurrentUserWithRole(req);

      if (!currentUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      console.log("=== CHECK RETURN DEBUG ===");
      console.log(`Check ID: ${checkId}`);
      console.log(`Return amount: ${body.return_amount}`);
      console.log(`Reason: ${body.reason}`);

      // Fetch current check
      const { data: currentCheck, error: fetchError } = await supabase
        .from("check_inventory")
        .select("*")
        .eq("id", checkId)
        .single();

      if (fetchError) {
        console.error(`Error fetching check ${checkId}:`, fetchError);
        return jsonResponse({ error: "Check not found" }, 404);
      }

      console.log(`Current check:`, JSON.stringify(currentCheck, null, 2));

      // Calculate new values
      const returnAmount = parseFloat(body.return_amount);
      const currentUsed = (currentCheck.amount_value || 0) - (currentCheck.remaining_balance || 0);
      
      if (returnAmount > currentUsed) {
        return jsonResponse({ 
          error: `Cannot return more than used amount (${currentUsed.toFixed(2)} MAD)` 
        }, 400);
      }

      // Calculate new remaining balance and usage
      const newRemaining = (currentCheck.remaining_balance || 0) + returnAmount;
      const newUsed = currentUsed - returnAmount;
      const newUsagePercentage = currentCheck.amount_value > 0 
        ? (newUsed / currentCheck.amount_value) * 100 
        : 0;

      console.log(`Calculation:`);
      console.log(`  Original amount: ${currentCheck.amount_value}`);
      console.log(`  Current used: ${currentUsed}`);
      console.log(`  Return amount: ${returnAmount}`);
      console.log(`  New used: ${newUsed}`);
      console.log(`  New remaining: ${newRemaining}`);
      console.log(`  New usage %: ${newUsagePercentage.toFixed(2)}%`);

      // Determine new status based on remaining balance
      let newStatus = currentCheck.status;
      if (newRemaining >= currentCheck.amount_value) {
        newStatus = "pending"; // Back to pending if fully returned
      } else if (newUsed > 0) {
        newStatus = "partly_used"; // Partially used if some amount still used
      } else {
        newStatus = "pending"; // Back to pending if nothing used
      }

      console.log(`New status: ${newStatus}`);

      // Update check with new values
      const { data: updatedCheck, error: updateError } = await supabase
        .from("check_inventory")
        .update({
          remaining_balance: newRemaining,
          usage_percentage: newUsagePercentage,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkId)
        .select();

      if (updateError) {
        console.error(`Error updating check:`, updateError);
        return jsonResponse({ error: "Failed to update check" }, 500);
      }

      console.log(`✓ Check returned successfully`);
      console.log(`Updated check:`, JSON.stringify(updatedCheck?.[0], null, 2));
      console.log("=== END CHECK RETURN DEBUG ===");

      return jsonResponse({ 
        success: true, 
        check: updatedCheck?.[0],
        message: `${returnAmount.toFixed(2)} MAD returned to inventory`
      });
    } catch (error: any) {
      console.error("Error returning check to inventory:", error);
      console.log("=== END CHECK RETURN DEBUG (ERROR) ===");
      return jsonResponse({ error: error.message }, 500);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

serve(async (req: Request) => {
  // Handle CORS preflight for ALL routes (including ones that may throw before reaching handler)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const res = await handler(req);

    // Ensure CORS headers are always present, even if a route forgot to add them
    const headers = new Headers(res.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err: any) {
    console.error("[super-handler] Uncaught error:", err);
    return jsonResponse({ error: err?.message || String(err) }, 500);
  }
});
