import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Initialize Supabase client for auth
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify user authentication
async function verifyAuth(c: any, next: any) {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401);
  }

  c.set('userId', user.id);
  c.set('userEmail', user.email);
  await next();
}

// Health check endpoint
app.get("/super-handler/health", (c) => {
  return c.json({ status: "ok" });
});

// ==================== AUTH ROUTES ====================

// Sign up new user
app.post("/super-handler/auth/signup", async (c) => {
  try {
    const { email, password, name, role = 'user', boutique } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400);
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server isn't configured
      user_metadata: { name, role, boutique }
    });

    if (error) {
      console.log('Error creating user in Supabase Auth:', error);
      return c.json({ error: `Failed to create user: ${error.message}` }, 400);
    }

    // Store user details in KV store
    const userId = data.user.id;
    await kv.set(`user:${userId}`, {
      id: userId,
      email,
      name,
      role,
      boutique,
      active: true,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log('Error in signup route:', error);
    return c.json({ error: `Signup failed: ${error.message}` }, 500);
  }
});

// ==================== PRODUCT/STOCK ROUTES ====================

// Get all products
app.get("/super-handler/products", verifyAuth, async (c) => {
  try {
    const products = await kv.getByPrefix('product:');
    return c.json({ products: products || [] });
  } catch (error) {
    console.log('Error fetching products:', error);
    return c.json({ error: `Failed to fetch products: ${error.message}` }, 500);
  }
});

// Add product
app.post("/super-handler/products", verifyAuth, async (c) => {
  try {
    const productData = await c.req.json();
    const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const product = {
      id: productId,
      ...productData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await kv.set(`product:${productId}`, product);
    
    // Log stock movement
    await kv.set(`stock_movement:${Date.now()}`, {
      productId,
      type: 'initial',
      quantity: productData.quantity,
      date: new Date().toISOString(),
      userId: c.get('userId')
    });

    return c.json({ success: true, product });
  } catch (error) {
    console.log('Error adding product:', error);
    return c.json({ error: `Failed to add product: ${error.message}` }, 500);
  }
});

// Update product
app.put("/super-handler/products/:id", verifyAuth, async (c) => {
  try {
    const productId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`product:${productId}`);
    if (!existing) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const product = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`product:${productId}`, product);
    return c.json({ success: true, product });
  } catch (error) {
    console.log('Error updating product:', error);
    return c.json({ error: `Failed to update product: ${error.message}` }, 500);
  }
});

// Delete product
app.delete("/super-handler/products/:id", verifyAuth, async (c) => {
  try {
    const productId = c.req.param('id');
    await kv.del(`product:${productId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting product:', error);
    return c.json({ error: `Failed to delete product: ${error.message}` }, 500);
  }
});

// ==================== SALES ROUTES ====================

// Get all sales
app.get("/super-handler/sales", verifyAuth, async (c) => {
  try {
    const sales = await kv.getByPrefix('sale:');
    return c.json({ sales: sales || [] });
  } catch (error) {
    console.log('Error fetching sales:', error);
    return c.json({ error: `Failed to fetch sales: ${error.message}` }, 500);
  }
});

// Create sale
app.post("/super-handler/sales", verifyAuth, async (c) => {
  try {
    const saleData = await c.req.json();
    const saleId = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sale = {
      id: saleId,
      ...saleData,
      createdBy: c.get('userId'),
      createdAt: new Date().toISOString()
    };

    await kv.set(`sale:${saleId}`, sale);

    // Update product stock
    if (saleData.items) {
      for (const item of saleData.items) {
        const product = await kv.get(`product:${item.productId}`);
        if (product) {
          product.quantity = (product.quantity || 0) - item.quantity;
          await kv.set(`product:${item.productId}`, product);
          
          // Log stock movement
          await kv.set(`stock_movement:${Date.now()}_${item.productId}`, {
            productId: item.productId,
            type: 'sale',
            quantity: -item.quantity,
            saleId,
            date: new Date().toISOString(),
            userId: c.get('userId')
          });
        }
      }
    }

    return c.json({ success: true, sale });
  } catch (error) {
    console.log('Error creating sale:', error);
    return c.json({ error: `Failed to create sale: ${error.message}` }, 500);
  }
});

// ==================== CLIENT ROUTES ====================

// Get all clients
app.get("/super-handler/clients", verifyAuth, async (c) => {
  try {
    const clients = await kv.getByPrefix('client:');
    return c.json({ clients: clients || [] });
  } catch (error) {
    console.log('Error fetching clients:', error);
    return c.json({ error: `Failed to fetch clients: ${error.message}` }, 500);
  }
});

// Add client
app.post("/super-handler/clients", verifyAuth, async (c) => {
  try {
    const clientData = await c.req.json();
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const client = {
      id: clientId,
      ...clientData,
      balance: clientData.balance || 0,
      createdAt: new Date().toISOString()
    };

    await kv.set(`client:${clientId}`, client);
    return c.json({ success: true, client });
  } catch (error) {
    console.log('Error adding client:', error);
    return c.json({ error: `Failed to add client: ${error.message}` }, 500);
  }
});

// Update client
app.put("/super-handler/clients/:id", verifyAuth, async (c) => {
  try {
    const clientId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`client:${clientId}`);
    if (!existing) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const client = { ...existing, ...updates };
    await kv.set(`client:${clientId}`, client);
    return c.json({ success: true, client });
  } catch (error) {
    console.log('Error updating client:', error);
    return c.json({ error: `Failed to update client: ${error.message}` }, 500);
  }
});

// Delete client
app.delete("/super-handler/clients/:id", verifyAuth, async (c) => {
  try {
    const clientId = c.req.param('id');
    await kv.del(`client:${clientId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting client:', error);
    return c.json({ error: `Failed to delete client: ${error.message}` }, 500);
  }
});

// ==================== SUPPLIER ROUTES ====================

// Get all suppliers
app.get("/super-handler/suppliers", verifyAuth, async (c) => {
  try {
    const suppliers = await kv.getByPrefix('supplier:');
    return c.json({ suppliers: suppliers || [] });
  } catch (error) {
    console.log('Error fetching suppliers:', error);
    return c.json({ error: `Failed to fetch suppliers: ${error.message}` }, 500);
  }
});

// Add supplier
app.post("/super-handler/suppliers", verifyAuth, async (c) => {
  try {
    const supplierData = await c.req.json();
    const supplierId = `supplier_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const supplier = {
      id: supplierId,
      ...supplierData,
      balance: supplierData.balance || 0,
      createdAt: new Date().toISOString()
    };

    await kv.set(`supplier:${supplierId}`, supplier);
    return c.json({ success: true, supplier });
  } catch (error) {
    console.log('Error adding supplier:', error);
    return c.json({ error: `Failed to add supplier: ${error.message}` }, 500);
  }
});

// Update supplier
app.put("/super-handler/suppliers/:id", verifyAuth, async (c) => {
  try {
    const supplierId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`supplier:${supplierId}`);
    if (!existing) {
      return c.json({ error: 'Supplier not found' }, 404);
    }

    const supplier = { ...existing, ...updates };
    await kv.set(`supplier:${supplierId}`, supplier);
    return c.json({ success: true, supplier });
  } catch (error) {
    console.log('Error updating supplier:', error);
    return c.json({ error: `Failed to update supplier: ${error.message}` }, 500);
  }
});

// Delete supplier
app.delete("/super-handler/suppliers/:id", verifyAuth, async (c) => {
  try {
    const supplierId = c.req.param('id');
    await kv.del(`supplier:${supplierId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting supplier:', error);
    return c.json({ error: `Failed to delete supplier: ${error.message}` }, 500);
  }
});

// ==================== CHECKS ROUTES ====================

// Get all checks
app.get("/super-handler/checks", verifyAuth, async (c) => {
  try {
    const checks = await kv.getByPrefix('check:');
    return c.json({ checks: checks || [] });
  } catch (error) {
    console.log('Error fetching checks:', error);
    return c.json({ error: `Failed to fetch checks: ${error.message}` }, 500);
  }
});

// Add check
app.post("/super-handler/checks", verifyAuth, async (c) => {
  try {
    const checkData = await c.req.json();
    const checkId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const check = {
      id: checkId,
      ...checkData,
      status: 'pending',
      createdBy: c.get('userId'),
      createdAt: new Date().toISOString()
    };

    await kv.set(`check:${checkId}`, check);
    return c.json({ success: true, check });
  } catch (error) {
    console.log('Error adding check:', error);
    return c.json({ error: `Failed to add check: ${error.message}` }, 500);
  }
});

// Update check status
app.put("/super-handler/checks/:id", verifyAuth, async (c) => {
  try {
    const checkId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`check:${checkId}`);
    if (!existing) {
      return c.json({ error: 'Check not found' }, 404);
    }

    const check = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`check:${checkId}`, check);
    return c.json({ success: true, check });
  } catch (error) {
    console.log('Error updating check:', error);
    return c.json({ error: `Failed to update check: ${error.message}` }, 500);
  }
});

// ==================== TRANSFER ROUTES ====================

// Get all transfers
app.get("/super-handler/transfers", verifyAuth, async (c) => {
  try {
    const transfers = await kv.getByPrefix('transfer:');
    return c.json({ transfers: transfers || [] });
  } catch (error) {
    console.log('Error fetching transfers:', error);
    return c.json({ error: `Failed to fetch transfers: ${error.message}` }, 500);
  }
});

// Create transfer
app.post("/super-handler/transfers", verifyAuth, async (c) => {
  try {
    const transferData = await c.req.json();
    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transfer = {
      id: transferId,
      ...transferData,
      status: 'pending',
      createdBy: c.get('userId'),
      createdAt: new Date().toISOString()
    };

    await kv.set(`transfer:${transferId}`, transfer);
    return c.json({ success: true, transfer });
  } catch (error) {
    console.log('Error creating transfer:', error);
    return c.json({ error: `Failed to create transfer: ${error.message}` }, 500);
  }
});

// Validate transfer (Admin only)
app.put("/super-handler/transfers/:id/validate", verifyAuth, async (c) => {
  try {
    const transferId = c.req.param('id');
    const { status, remarks } = await c.req.json();
    
    const existing = await kv.get(`transfer:${transferId}`);
    if (!existing) {
      return c.json({ error: 'Transfer not found' }, 404);
    }

    const transfer = {
      ...existing,
      status,
      remarks,
      validatedBy: c.get('userId'),
      validatedAt: new Date().toISOString()
    };

    await kv.set(`transfer:${transferId}`, transfer);
    return c.json({ success: true, transfer });
  } catch (error) {
    console.log('Error validating transfer:', error);
    return c.json({ error: `Failed to validate transfer: ${error.message}` }, 500);
  }
});

// ==================== ORDER ROUTES ====================

// Get all orders
app.get("/super-handler/orders", verifyAuth, async (c) => {
  try {
    const orders = await kv.getByPrefix('order:');
    return c.json({ orders: orders || [] });
  } catch (error) {
    console.log('Error fetching orders:', error);
    return c.json({ error: `Failed to fetch orders: ${error.message}` }, 500);
  }
});

// Create order
app.post("/super-handler/orders", verifyAuth, async (c) => {
  try {
    const orderData = await c.req.json();
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const order = {
      id: orderId,
      ...orderData,
      status: 'pending',
      paymentStatus: 'unpaid',
      createdBy: c.get('userId'),
      createdAt: new Date().toISOString()
    };

    await kv.set(`order:${orderId}`, order);
    return c.json({ success: true, order });
  } catch (error) {
    console.log('Error creating order:', error);
    return c.json({ error: `Failed to create order: ${error.message}` }, 500);
  }
});

// Update order
app.put("/super-handler/orders/:id", verifyAuth, async (c) => {
  try {
    const orderId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`order:${orderId}`);
    if (!existing) {
      return c.json({ error: 'Order not found' }, 404);
    }

    const order = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`order:${orderId}`, order);
    return c.json({ success: true, order });
  } catch (error) {
    console.log('Error updating order:', error);
    return c.json({ error: `Failed to update order: ${error.message}` }, 500);
  }
});

// ==================== USER MANAGEMENT ROUTES ====================

// Get all users
app.get("/super-handler/users", verifyAuth, async (c) => {
  try {
    // Fetch users from the actual Supabase public.users table
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.log('Error fetching users from database:', error);
      return c.json({ error: `Failed to fetch users: ${error.message}` }, 500);
    }
    
    return c.json({ users: data || [] });
  } catch (error) {
    console.log('Error fetching users:', error);
    return c.json({ error: `Failed to fetch users: ${error.message}` }, 500);
  }
});

// Update user
app.put("/super-handler/users/:id", verifyAuth, async (c) => {
  try {
    const userId = c.req.param('id');
    const updates = await c.req.json();
    
    const existing = await kv.get(`user:${userId}`);
    if (!existing) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = { ...existing, ...updates };
    await kv.set(`user:${userId}`, user);
    return c.json({ success: true, user });
  } catch (error) {
    console.log('Error updating user:', error);
    return c.json({ error: `Failed to update user: ${error.message}` }, 500);
  }
});

// ==================== PAYMENT ROUTES ====================

// Get all payments
app.get("/super-handler/payments", verifyAuth, async (c) => {
  try {
    const payments = await kv.getByPrefix('payment:');
    return c.json({ payments: payments || [] });
  } catch (error) {
    console.log('Error fetching payments:', error);
    return c.json({ error: `Failed to fetch payments: ${error.message}` }, 500);
  }
});

// Create payment
app.post("/super-handler/payments", verifyAuth, async (c) => {
  try {
    const paymentData = await c.req.json();
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payment = {
      id: paymentId,
      ...paymentData,
      createdBy: c.get('userId'),
      createdAt: new Date().toISOString()
    };

    await kv.set(`payment:${paymentId}`, payment);

    // Update client or supplier balance
    if (paymentData.clientId) {
      const client = await kv.get(`client:${paymentData.clientId}`);
      if (client) {
        client.balance = (client.balance || 0) - paymentData.amount;
        await kv.set(`client:${paymentData.clientId}`, client);
      }
    } else if (paymentData.supplierId) {
      const supplier = await kv.get(`supplier:${paymentData.supplierId}`);
      if (supplier) {
        supplier.balance = (supplier.balance || 0) - paymentData.amount;
        await kv.set(`supplier:${paymentData.supplierId}`, supplier);
      }
    }

    return c.json({ success: true, payment });
  } catch (error) {
    console.log('Error creating payment:', error);
    return c.json({ error: `Failed to create payment: ${error.message}` }, 500);
  }
});

// ==================== DASHBOARD/STATS ROUTES ====================

// Get dashboard stats
app.get("/super-handler/stats", verifyAuth, async (c) => {
  try {
    const [products, sales, clients, suppliers, orders, transfers, checks] = await Promise.all([
      kv.getByPrefix('product:'),
      kv.getByPrefix('sale:'),
      kv.getByPrefix('client:'),
      kv.getByPrefix('supplier:'),
      kv.getByPrefix('order:'),
      kv.getByPrefix('transfer:'),
      kv.getByPrefix('check:')
    ]);

    const totalProducts = products?.length || 0;
    const totalSales = sales?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const totalClients = clients?.length || 0;
    const totalSuppliers = suppliers?.length || 0;
    const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;
    const pendingTransfers = transfers?.filter(t => t.status === 'pending').length || 0;
    const pendingChecks = checks?.filter(ch => ch.status === 'pending').length || 0;

    return c.json({
      stats: {
        totalProducts,
        totalSales,
        totalClients,
        totalSuppliers,
        pendingOrders,
        pendingTransfers,
        pendingChecks
      }
    });
  } catch (error) {
    console.log('Error fetching stats:', error);
    return c.json({ error: `Failed to fetch stats: ${error.message}` }, 500);
  }
});

Deno.serve(app.fetch);
