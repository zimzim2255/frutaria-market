# Frutaria Market - Web App Features & Options

## 🎯 Overview
**Frutaria Market** is an Inter-Store Trading System designed for managing products, sales, orders, suppliers, and more across multiple stores.

---

## 📋 Main Navigation Tabs

### 1. **Dashboard** 📊
- **Overview Statistics**
  - Total Products
  - Total Sales (MAD)
  - Total Clients/Stores
  - Total Suppliers
  - Pending Orders
  - Pending Transfers
  - Pending Checks
- **Real-time Stats Updates** (refreshes every 30 seconds)
- **Quick Access to Key Metrics**

---

### 2. **Products** 📦
**Shared Stock - Inter-Store Exchange**

#### Features:
- **View All Products**
  - Reference number
  - Product name
  - Stock quantity (color-coded: red/orange/green)
  - Sale price
  - Status indicators

- **Add New Product**
  - Product name *
  - Reference *
  - Quantity available *
  - Purchase price (MAD) *
  - Sale price (MAD) *
  - Supplier selection
  - Category
  - Number of boxes
  - Total net weight (kg)
  - Average weight per box (auto-calculated)

- **View Product Details** (Eye Icon)
  - Product name & reference
  - Product ID
  - Stock quantity (color-coded)
  - Sale price per unit
  - Purchase price
  - Profit margin %
  - Stock value (MAD)
  - **Supplier Information:**
    - Supplier name
    - Email
    - Phone
    - City
    - Contact person
    - Address
  - Seller/Store information
  - Weight information
  - Creation & modification dates

- **Edit Product** (Edit Icon)
  - Modify all product details
  - Update pricing
  - Change supplier
  - Update stock information

- **Delete Product** (Trash Icon)
  - Remove products from inventory

- **Buy Product** (Shopping Cart Icon)
  - Add to cart
  - Select quantity
  - View total price

- **Shopping Cart**
  - View all items in cart
  - Adjust quantities
  - Remove items
  - View cart total
  - Proceed to checkout

- **Checkout Process**
  - Customer name
  - Customer phone
  - Payment method (Cash/Check)
  - Additional notes
  - Confirm purchase

- **Stock Overview Cards**
  - Total Products count
  - Total items in stock
  - Total stock value
  - Low stock alerts

- **Search & Filter**
  - Search by product name
  - Search by reference
  - Search by category

---

### 3. **Stores** 🏪
**Clients/Stores Management**

#### Features:
- **View All Stores**
  - Store name
  - Email
  - Phone
  - Address
  - City
  - Postal code
  - Contact person
  - Balance
  - Status

- **Add New Store**
  - Store name *
  - Email
  - Phone
  - Address
  - City
  - Postal code
  - Contact person

- **Edit Store Information**
  - Update all store details
  - Modify contact information
  - Update address

- **Delete Store**
  - Remove store from system

- **Search & Filter**
  - Search by store name
  - Search by email
  - Search by city

---

### 4. **Sales** 🛒
**Sales Transactions Management**

#### Features:
- **View All Sales**
  - Sale number
  - Store/Customer information
  - Total amount (MAD)
  - Payment status (Paid/Unpaid)
  - Delivery status
  - Date created

- **Create New Sale**
  - Sale number (auto-generated)
  - Store selection
  - Total amount
  - Payment status
  - Delivery status
  - Notes

- **View Sale Details**
  - Sale items list
  - Product details
  - Quantities
  - Unit prices
  - Total prices
  - Store information
  - Payment information
  - Delivery status

- **Update Sale Status**
  - Change payment status (Paid/Unpaid)
  - Update delivery status (Preparing/Delivered)
  - Add payment notes
  - Mark as received

- **Delete Sale**
  - Remove sales records

- **Search & Filter**
  - Search by sale number
  - Filter by payment status
  - Filter by delivery status
  - Filter by date range

---

### 5. **Suppliers** 🚚
**Supplier Management**

#### Features:
- **View All Suppliers**
  - Supplier name
  - Email
  - Phone
  - Address
  - City
  - Postal code
  - Contact person
  - Payment terms
  - Balance
  - Status

- **Add New Supplier**
  - Supplier name *
  - Email
  - Phone
  - Address
  - City
  - Postal code
  - Contact person
  - Payment terms
  - Status

- **Edit Supplier Information**
  - Update all supplier details
  - Modify contact information
  - Update payment terms
  - Change status

- **Delete Supplier**
  - Remove supplier from system

- **Search & Filter**
  - Search by supplier name
  - Search by email
  - Search by city

---

### 6. **Checks** 📋
**Check Management System**

#### Features:
- **View All Checks**
  - Check number
  - Amount (MAD)
  - Issuer name
  - Bank name
  - Due date
  - Status (Pending/Cleared/Bounced)
  - Store information
  - Notes

- **Add New Check**
  - Check number *
  - Amount *
  - Issuer name
  - Bank name
  - Due date
  - Store selection
  - Notes

- **Update Check Status**
  - Change status (Pending/Cleared/Bounced)
  - Update check information
  - Add notes

- **Delete Check**
  - Remove check records

- **Search & Filter**
  - Search by check number
  - Filter by status
  - Filter by due date
  - Filter by store

---

### 7. **Orders** 📋
**Order Management**

#### Features:
- **View All Orders**
  - Order number
  - Store information
  - Total amount (MAD)
  - Status (Pending/Confirmed/Delivered)
  - Payment status
  - Payment method
  - Delivery date
  - Notes

- **Create New Order**
  - Order number (auto-generated)
  - Store selection
  - Total amount
  - Status
  - Payment method
  - Delivery date
  - Notes

- **View Order Details**
  - Order items
  - Product information
  - Quantities
  - Prices
  - Store details
  - Supplier information
  - Payment details
  - Delivery information

- **Update Order Status**
  - Change order status
  - Update payment status
  - Confirm delivery
  - Add notes

- **Delete Order**
  - Remove order records

- **Search & Filter**
  - Search by order number
  - Filter by status
  - Filter by payment status
  - Filter by date range

---

### 8. **Users** 👥
**User Management**

#### Features:
- **View All Users**
  - User email
  - Name
  - Role (Admin/User)
  - Status (Active/Inactive)
  - Created date

- **Add New User**
  - Email *
  - Password *
  - Name
  - Role assignment
  - Status

- **Edit User Information**
  - Update name
  - Change role
  - Update status
  - Modify permissions

- **Delete User**
  - Remove user from system

- **Search & Filter**
  - Search by email
  - Search by name
  - Filter by role
  - Filter by status

---

## 🔍 Global Search Feature

**Search across entire system:**
- Products (by name, SKU)
- Sales (by sale number)
- Orders (by order number)
- Suppliers (by name, email)
- Stores/Clients (by name, email)

**Features:**
- Real-time search with debouncing (300ms)
- Quick navigation to results
- Shows up to 10 results
- Displays result type and details

---

## 🔐 Authentication & Security

- **Login Screen**
  - Email/Password authentication
  - Session management
  - Secure token handling

- **User Session**
  - Display current user email
  - Administrator role indicator
  - Logout functionality

---

## 📊 Data Management

### Supported Operations:
- ✅ Create (Add new records)
- ✅ Read (View all records)
- ✅ Update (Edit existing records)
- ✅ Delete (Remove records)
- ✅ Search (Global search across modules)
- ✅ Filter (By various criteria)
- ✅ Sort (By date, amount, status)

### Data Types:
- Products & Inventory
- Sales & Transactions
- Orders & Deliveries
- Suppliers & Contacts
- Stores/Clients
- Checks & Payments
- Users & Permissions

---

## 🎨 UI/UX Features

- **Responsive Design**
  - Works on desktop, tablet, mobile
  - Adaptive layouts

- **Color-Coded Status Indicators**
  - Stock levels (Red/Orange/Green)
  - Payment status
  - Delivery status
  - Order status

- **Real-time Updates**
  - Stats refresh every 30 seconds
  - Live data synchronization

- **Toast Notifications**
  - Success messages
  - Error alerts
  - Action confirmations

- **Tabbed Navigation**
  - Easy module switching
  - Visual indicators for active tab
  - Icon + text labels

---

## 💾 Backend Integration

**API Endpoints Available:**
- `/products` - Product management
- `/sales` - Sales transactions
- `/orders` - Order management
- `/suppliers` - Supplier data
- `/clients` (or `/stores`) - Store/Client data
- `/checks` - Check management
- `/users` - User management
- `/payments` - Payment tracking
- `/transfers` - Inter-store transfers
- `/stats` - Dashboard statistics
- `/purchases` - Purchase records

---

## 🚀 Key Workflows

### 1. **Product Purchase Workflow**
1. Browse Products
2. View Product Details
3. Add to Cart
4. Proceed to Checkout
5. Enter Customer Info
6. Select Payment Method
7. Confirm Purchase

### 2. **Supplier Management Workflow**
1. Add Supplier
2. Set Payment Terms
3. Link Products to Supplier
4. Track Supplier Balance
5. Manage Supplier Contacts

### 3. **Order Management Workflow**
1. Create Order
2. Select Store
3. Add Items
4. Set Delivery Date
5. Track Order Status
6. Confirm Delivery

### 4. **Sales Tracking Workflow**
1. View Sales
2. Check Payment Status
3. Update Delivery Status
4. Add Payment Notes
5. Confirm Receipt

---

## 📈 Statistics & Reporting

**Dashboard Shows:**
- Total number of products
- Total sales amount (MAD)
- Total number of clients/stores
- Total number of suppliers
- Pending orders count
- Pending transfers count
- Pending checks count

---

## ⚙️ System Features

- **Auto-Calculations**
  - Average weight per box (from total weight ÷ boxes)
  - Profit margin percentage
  - Stock value
  - Cart totals
  - Order totals

- **Data Validation**
  - Required field validation
  - Email format validation
  - Number format validation
  - Date validation

- **Error Handling**
  - User-friendly error messages
  - Validation feedback
  - Network error handling

---

## 🎯 Summary

**Total Modules: 8**
1. Dashboard
2. Products
3. Stores
4. Sales
5. Suppliers
6. Checks
7. Orders
8. Users

**Total Features: 100+**
- CRUD operations across all modules
- Advanced search & filtering
- Real-time statistics
- Payment tracking
- Inventory management
- Supplier management
- Order management
- User management
- Global search
- Authentication & security

---

**Version:** 2.0.0  
**Last Updated:** 2024  
**System:** Frutaria Market - Inter-Store Trading System
  page.drawText("LOGO", {
        x: margin + 3,
        y: y - logoSize + 6,
        size: 7,
        font: helvetica,
        color: GRAY,
      });

 the cleint is adding the product 

 when the user
 