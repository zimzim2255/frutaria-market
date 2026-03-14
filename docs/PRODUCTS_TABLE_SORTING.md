                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         # Products Table Sorting (A→Z / Z→A)

This document explains how the **Products page table sorting** works in this project.

File implemented in:
- `src/components/modules/ProductsModule.tsx`

## What was added

We added **click-to-sort** behavior on these columns:

- **Réf. Stock** (sort by `product.stock_reference`)
- **No Référence** (sort by `product.reference`)
- **Nom** (sort by `product.name`)
- **Ventes Totales** (sort by computed numeric total)

Clicking the column header toggles:

- `↕` = sortable but not active
- `▲` = sorted ascending
- `▼` = sorted descending

## How it works (logic)

### 1) Sort state

We store the current sort in a React state object:

- `key`: which column is active
- `direction`: `asc` or `desc`

```ts
const [sortConfig, setSortConfig] = useState<{
  key: 'stock_reference' | 'reference' | 'name' | 'total_sales' | null;
  direction: 'asc' | 'desc';
}>({ key: null, direction: 'asc' });
```

### 2) Visible products

The module already builds the products list in stages:

1. `groupedProducts`: merges products with same reference
2. `filteredProducts`: applies search + creator + store visibility
3. `visibleProducts`: adjusts stock quantities depending on role/store filter

Sorting is applied on top of **`visibleProducts`**, so it respects:
- Admin / non-admin visibility
- magasin filter

### 3) Sorted products

We create a derived array:

- if no sort key → return `visibleProducts`
- if sort key is `total_sales` → numeric sort based on `calculateProductStats(...).totalSales`
- otherwise → string sort

```ts
const sortedProducts = (() => {
  if (!sortConfig.key) return visibleProducts;

  const dir = sortConfig.direction === 'asc' ? 1 : -1;

  // Numeric sorting for Ventes Totales
  if (sortConfig.key === 'total_sales') {
    return [...visibleProducts].sort((a, b) => {
      const aSales = Number(calculateProductStats(a.id, a.name).totalSales ?? 0);
      const bSales = Number(calculateProductStats(b.id, b.name).totalSales ?? 0);
      return (aSales - bSales) * dir;
    });
  }

  // String sorting for reference/name/stock ref
  const getVal = (p: any) => {
    if (sortConfig.key === 'stock_reference') return String(p?.stock_reference ?? '');
    if (sortConfig.key === 'reference') return String(p?.reference ?? '');
    if (sortConfig.key === 'name') return String(p?.name ?? '');
    return '';
  };

  return [...visibleProducts].sort((a, b) => {
    const av = getVal(a).toLowerCase();
    const bv = getVal(b).toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
})();
```

### 4) Rendering

The table **renders `sortedProducts`** instead of `filteredProducts`.

That ensures the UI and export logic (PDF selection) match what the user sees.

## How the UI trigger works

Each sortable header is a `<button>` inside `<TableHead>`:

- When clicked, it updates `sortConfig`
- Clicking the same column toggles direction

Example for **Ventes Totales**:

```tsx
<TableHead>
  <button
    type="button"
    className="flex items-center gap-2 select-none"
    title="Trier 0→9 / 9→0"
    onClick={() => {
      setSortConfig(prev => ({
        key: 'total_sales',
        direction: prev.key === 'total_sales' && prev.direction === 'asc' ? 'desc' : 'asc',
      }));
    }}
  >
    Ventes Totales
    <span className="text-xs font-semibold text-blue-600">
      {sortConfig.key === 'total_sales'
        ? (sortConfig.direction === 'asc' ? '▲' : '▼')
        : '↕'}
    </span>
  </button>
</TableHead>
```

## Styling

We kept styling minimal and consistent with the existing table:

- Header content uses: `flex items-center gap-2`
- Prevents text selection on repeated clicks: `select-none`
- Arrow indicator: `text-xs font-semibold text-blue-600`

These styles are Tailwind classes already used in the app.

## Notes / Known limitations

- Sorting is **frontend only**; it does not change database order.
- Sorting `Ventes Totales` calls `calculateProductStats` during sorting, which can be heavier on very large lists. If performance becomes an issue, we can cache totals per product.
