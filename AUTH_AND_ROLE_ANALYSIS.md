# Authentication and Role Management Analysis

## Overview
This application uses Supabase Auth for user authentication with a two-tier role system: one in `user_metadata` (auth layer) and one in the `public.users` database table (application layer).

---

## 1. SESSION CREATION & RETRIEVAL

### Where Session is Created (Frontend)

**File:** [src/App.tsx](src/App.tsx#L115-L127)
```typescript
// In App.tsx, session is retrieved on app load and monitored for changes
useEffect(() => {
  // Check for existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setLoading(false);
  });

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    console.log('Auth state changed:', _event, session?.user?.email);
    setSession(session);
    setLoading(false);
  });

  return () => subscription?.unsubscribe();
}, []);
```

### Session Object Structure
The session object contains:
- `session.user.id` - Auth user ID
- `session.user.email` - User email
- `session.user.user_metadata` - Contains `role`, `name`, `boutique` fields
- `session.access_token` - Bearer token for API calls

**Example session structure:**
```typescript
{
  user: {
    id: "uuid-from-auth",
    email: "admin@hmad.com",
    user_metadata: {
      role: "admin",      // ⚠️ Set during signup
      name: "Admin Name",
      boutique: "Admin"
    }
  },
  access_token: "eyJ0eXAiOiJKV1Q..."
}
```

---

## 2. HOW ROLES ARE SET

### Dual Role System

**Layer 1: Auth (`user_metadata.role`)** - Set when user signs up
**Layer 2: Database (`public.users.role`)** - Source of truth for app permissions

### Initial Role Assignment During Signup

**File:** [src/supabase/functions/server/index.tsx](src/supabase/functions/server/index.tsx#L54-L88)

Signup endpoint sets role in `user_metadata`:
```typescript
app.post("/super-handler/auth/signup", async (c) => {
  const { email, password, name, role = 'user', boutique } = await c.req.json();
  
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, boutique }  // ← Role stored here
  });
  
  // ...
});
```

**File:** [src/components/FirstTimeSetup.tsx](src/components/FirstTimeSetup.tsx#L33-L49)

When creating first admin user:
```typescript
const response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/super-handler/auth/signup`,
  {
    method: 'POST',
    body: JSON.stringify({
      ...formData,
      role: 'admin',      // ← Hardcoded as admin for first-time setup
      boutique: 'Admin',
    }),
  }
);
```

### When User Logs In - Role is Fetched from Database

**File:** [src/App.tsx](src/App.tsx#L87)
```typescript
// When user logs in, fetch role from database (not from user_metadata)
const currentUser = userData.users?.find((u: any) => u.id === session.user.id);
```

**File:** [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx#L100-L150)

**Critical:** After login, role is ALWAYS fetched from `public.users` table:
```typescript
const response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  }
);

if (response.ok) {
  const data = await response.json();
  const currentUser = data.users?.find((u: any) => u.email === session.user?.email);

  if (currentUser) {
    // IMPORTANT: never default to admin.
    // If role is missing, treat as "user" so permissions are not bypassed.
    const role = currentUser.role || 'user';  // ← Role from database, defaults to 'user'
    setUserRole(role);
    setUserPermissions(currentUser.permissions || []);
  }
}
```

---

## 3. AUTH-RELATED FILES & USER/SESSION MANAGEMENT CODE

### Key Authentication Files

| File | Purpose |
|------|---------|
| [src/App.tsx](src/App.tsx) | Main app - retrieves session, monitors auth state |
| [src/components/LoginScreen.tsx](src/components/LoginScreen.tsx) | Login form - uses `supabase.auth.signInWithPassword()` |
| [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx) | After login - fetches role from database |
| [src/components/FirstTimeSetup.tsx](src/components/FirstTimeSetup.tsx) | Initial admin creation - sets `role: 'admin'` |
| [src/supabase/functions/server/index.tsx](src/supabase/functions/server/index.tsx) | Signup/Auth endpoints |
| [supabase/functions/super-handler/index.ts](supabase/functions/super-handler/index.ts) | Backend role verification |
| [scripts/create-admin-user.mjs](scripts/create-admin-user.mjs) | CLI tool to create admin users |

### Database Table Structure

**Table: `public.users`**
```sql
- id (UUID) - matches auth.users.id
- email (TEXT)
- role (TEXT) - 'admin', 'manager', 'magasin_manager', or 'user'
- store_id (UUID)
- permissions (JSONB array)
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
```

---

## 4. HOW ADMIN USERS ARE IDENTIFIED

### Key Discovery: Role Values in Application

The backend defines three official role types:

**File:** [supabase/functions/super-handler/index.ts](supabase/functions/super-handler/index.ts#L23)
```typescript
type AppRole = "admin" | "manager" | "user";

function normalizeRole(role: any): AppRole {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "manager" || r === "user") return r;
  return "user";
}
```

### Admin Role Checks - Multiple Locations

#### 1. **Frontend - Using user_metadata.role** (⚠️ Security Risk)

**File:** [src/components/SupplierDetailsPage.tsx](src/components/SupplierDetailsPage.tsx#L93-L95)
```typescript
// WARNING: Uses user_metadata which can be spoofed!
const isAdminLike = useMemo(() => {
  const role = String(session?.user?.user_metadata?.role || '').toLowerCase();
  return role === 'admin';
}, [session]);
```

#### 2. **Frontend - Using database role** (Correct approach)

**File:** [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx#L176-L182)
```typescript
// Correct: Uses role fetched from database via /users endpoint
const hasPermission = (permission: string): boolean => {
  if (userRole === 'admin') return true;  // ← Trusts database role
  return userPermissions.includes(permission);
};

const isMagasinManager = userRole === 'magasin_manager' || userRole === 'manager';
```

**File:** [src/components/CashManagementPage.tsx](src/components/CashManagementPage.tsx#L114-L125)
```typescript
const hasPermission = (permission: string) => {
  if (userRole === 'admin') return true;  // ← Fetched from /users API endpoint
  return userPermissions.includes(permission);
};

const canExportCaisse = 
  hasPermission('Exporter Caisse (CSV)') ||
  hasPermission('Exporter Caisse') ||
  hasPermission('Exporter Caisse (Excel)') ||
  hasPermission('Exporter Caisse (PDF)');
```

#### 3. **Backend - Role Verification** (Most Secure)

**File:** [supabase/functions/super-handler/index.ts](supabase/functions/super-handler/index.ts#L3618-3650)

The `/users` endpoint returns filtered data based on role:
```typescript
if (path === "/users" && method === "GET") {
  const currentUser = await getCurrentUserWithRole(req);
  if (!currentUser) return jsonResponse({ error: "Unauthorized" }, 401);

  const role = String(currentUser.role || "").toLowerCase();

  // Admin can fetch everything
  if (role === "admin") {
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    return jsonResponse({ users: users || [] });
  }

  // Non-admin: return minimal list (self + all admins)
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role, store_id, permissions")
    .or(`id.eq.${currentUser.id},role.eq.admin,role.ilike.admin`)  // ← Admin check
    .order("created_at", { ascending: false });

  return jsonResponse({ users: users || [] });
}
```

#### 4. **Backend - Endpoint Authorization**

Various endpoints check role before processing:

```typescript
// Check 1: Simple role comparison
if (role !== 'admin') return jsonResponse({ error: 'Unauthorized' }, 403);

// Check 2: Multiple roles allowed
if (role !== 'admin' && role !== 'manager' && role !== 'magasin_manager') {
  return jsonResponse({ error: 'Unauthorized' }, 403);
}

// Check 3: Admin user validation (ensure they have role=admin)
if (String(adminRow.role || '').toLowerCase() !== 'admin') {
  return jsonResponse({ error: 'admin_user_id must be a user with role=admin' }, 400);
}
```

---

## 5. ROLE VALUES ACTUALLY USED IN APPLICATION

### Official Role Values (from backend)
```
'admin'           - Full system access, all permissions
'manager'         - Manager-level access
'magasin_manager' - Store/Magasin specific manager
'user'            - Regular user, limited permissions
```

### Example: Admin User Creation

**File:** [scripts/create-admin-user.mjs](scripts/create-admin-user.mjs#L245)
```typescript
const payload = {
  id: userId,
  email,
  role: 'admin',              // ← Explicit 'admin' role
  store_id: storeId,
  is_active: true,
  permissions: allPermissions,  // All permissions granted
  updated_at: new Date().toISOString(),
};

await supabase
  .from('users')
  .upsert(payload, { onConflict: 'id' });
```

### Permission System (Based on Role)

**File:** [supabase/functions/super-handler/index.ts](supabase/functions/super-handler/index.ts#L25-145)

```typescript
function buildRoleBasedPermissions(role: AppRole): string[] {
  const allPermissions: string[] = [
    // Dashboard
    "Voir le Tableau de Bord",
    "Voir les Rapports",
    
    // Products
    "Voir les Produits",
    "Ajouter un Produit",
    "Modifier un Produit",
    "Supprimer un Produit",
    
    // Sales
    "Voir les Ventes",
    "Créer une Vente",
    "Modifier une Vente",
    "Supprimer une Vente",
    
    // ... many more permissions
  ];

  // Admin gets all permissions
  if (role === "admin") return allPermissions;

  // Manager gets a subset
  if (role === "manager") {
    return allPermissions.filter(p => 
      !p.includes("Gérer") && !p.includes("Supprimer")
    );
  }

  // Regular users get minimal permissions
  return allPermissions.filter(p => 
    p.includes("Voir")
  );
}
```

---

## 6. CONCRETE EXAMPLES: WHERE ROLES ARE SET AND CHECKED

### Example 1: Admin Can View All Stores

**Frontend Check:**
```typescript
// From CashManagementPage.tsx - Admin default scope
applyDefaultStoreFilter(currentUser.role || 'user', currentUser.store_id);
```

**Backend Response:**
```typescript
// From super-handler/index.ts
const effectiveStoreId = (role === 'admin') 
  ? (requestedStoreId || null)  // Admin can filter to any store or see all
  : (requestedStoreId || myStoreId);  // Non-admin limited to their store
```

### Example 2: Only Admin Can Export Cash Management

**File:** [src/components/CashManagementPage.tsx](src/components/CashManagementPage.tsx#L121-L125)
```typescript
const canExportCaisse = 
  hasPermission('Exporter Caisse (CSV)') ||
  hasPermission('Exporter Caisse') ||
  hasPermission('Exporter Caisse (Excel)') ||
  hasPermission('Exporter Caisse (PDF)');

// hasPermission returns true ONLY if:
// 1. userRole === 'admin', OR
// 2. Permission string is in userPermissions array
```

### Example 3: Admin User Validation

**File:** [supabase/functions/super-handler/index.ts](supabase/functions/super-handler/index.ts#L948-961)
```typescript
// When assigning a store to an admin:
const { data: adminRow, error } = await supabase
  .from('users')
  .select('role')
  .eq('id', adminUserId)
  .single();

// Validate admin user has role=admin
if (String(adminRow.role || '').toLowerCase() !== 'admin') {
  return jsonResponse(
    { error: 'admin_user_id must be a user with role=admin' }, 
    400
  );
}
```

---

## 7. SECURITY NOTES

### ⚠️ IDENTIFIED ISSUE: Dual Role Sources

The application has **two sources of truth for roles**, which can cause inconsistency:

1. **`session.user.user_metadata.role`** - Set during signup, can be outdated/stale
2. **`public.users.role`** - Database source of truth, always current

**Risk:** Some components check `user_metadata` (like SupplierDetailsPage) which could be spoofed:
```typescript
// ⚠️ VULNERABLE: Trusts user_metadata
const role = String(session?.user?.user_metadata?.role || '').toLowerCase();
return role === 'admin';  // ← Can be out of sync with database
```

**Correct approach:** Always fetch from database via API:
```typescript
// ✓ CORRECT: Trusts database
const currentUser = userData.users?.find((u: any) => u.email === session.user?.email);
const role = currentUser.role || 'user';  // ← Always fresh from DB
```

### Safety Defaults

From [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx#L107-108):
```typescript
// IMPORTANT: never default to admin.
// If role is missing, treat as "user" so permissions are not bypassed.
const role = currentUser.role || 'user';
```

---

## Summary Table

| Aspect | Location | Value | Security |
|--------|----------|-------|----------|
| **Session Created** | [src/App.tsx](src/App.tsx#L115) | `supabase.auth.getSession()` | ✓ Secure |
| **Initial Role Set** | [src/components/FirstTimeSetup.tsx](src/components/FirstTimeSetup.tsx#L43) | `role: 'admin'` | ⚠️ In user_metadata |
| **Role Retrieved** | [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx#L100) | Via `/users` API | ✓ From DB |
| **Admin Check (Frontend)** | [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx#L177) | `userRole === 'admin'` | ✓ Secure |
| **Admin Check (Backend)** | [supabase/functions/super-handler](supabase/functions/super-handler/index.ts#L3648) | `role === 'admin'` | ✓ Secure |
| **Role values** | Backend | `'admin'` \| `'manager'` \| `'magasin_manager'` \| `'user'` | ✓ Defined |
