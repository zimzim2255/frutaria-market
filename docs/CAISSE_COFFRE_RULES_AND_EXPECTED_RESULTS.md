# Caisse/Cash Register + Coffre/Safe + Cheques — Manual Test Steps + EXACT Expected Results

This document is a **hands-on checklist**: do the steps, then compare your screen numbers to the expected results.

> Assumptions for all tests
> - Use **one store**: `Store A`
> - Use **one safe**: `coffer_id = main`
> - Start with **no transactions** in the selected date range (or use a new date filter range).
> - All amounts below are in **MAD**.
> - When comparing results, apply standard rounding to **2 decimals** (e.g. 10 => 10.00).

---

## How to read results

You must check **these places in the UI** after each action:

1. **Caisse page → Payment Method cards**
   - 💵 Cash (Espèces)
   - 🏦 Cheques (Chèques)
   - 💳 Bank Transfers (Virements)

2. **Caisse page → Top cards**
   - Total Encaissé
   - Total Dépensé
   - Balance (Solde)
   - Total Cheques (absolute indicator)

3. **Caisse page → History table**
   - You must see a new line with the right sign (+ or -) and reason.

---

# TEST 0 — Baseline (clean state)

**Steps**
1. Go to **Caisse**.
2. Select Store A.
3. Set date filter to a range with no old data (or ensure you have no data).

**Expected results**
- 💵 Cash = 0.00
- 🏦 Cheques = 0.00
- 💳 Bank Transfers = 0.00
- Total Encaissé = 0.00
- Total Dépensé = 0.00
- Balance (Solde) = 0.00

---

# TEST 1 — Cash sale (cash increases)

**Action**: create a **Sale/BL** paid by **Cash**

**Steps**
1. Create a sale (BL or Vente) for Store A.
2. Payment method: **Cash**.
3. Amount paid now: **100**.
4. Save/confirm.
5. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **100.00**
- 🏦 Cheques = **0.00**
- 💳 Bank Transfers = **0.00**
- Total Encaissé = **+100.00**
- Total Dépensé = **0.00**
- Balance = **100.00**
- History: a **+100** line (Sale/BL) exists.

---

# TEST 2 — Normal expense (cash decreases)

**Action**: add **Le Charge** expense

**Steps**
1. Add a normal expense (Le Charge) in Store A.
2. Amount: **20**.
3. Save.
4. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **80.00** (100 - 20)
- 🏦 Cheques = **0.00**
- 💳 Bank Transfers = **0.00**
- Total Encaissé = **+100.00**
- Total Dépensé = **20.00**
- Balance = **80.00**
- History: a **-20** line (Dépense) exists.

---

# TEST 3 — Supplier Passage (cash decreases)

**Action**: record a **Supplier Passage**

**Steps**
1. Create a Supplier Passage in Store A.
2. Amount: **30**.
3. Save.
4. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **50.00** (80 - 30)
- 🏦 Cheques = **0.00**
- 💳 Bank Transfers = **0.00**
- Total Encaissé = **+100.00**
- Total Dépensé = **50.00** (20 + 30)
- Balance = **50.00**
- History: a Supplier Passage line exists (must reduce balance).

---

# TEST 4 — Deposit from Caisse → Safe (cash transfer to coffre)

**Action**: transfer cash from caisse to coffre

**Steps**
1. Go to the Safe/Coffre feature.
2. Do an operation **Deposit** (Caisse → Coffre).
3. Method: **Cash**.
4. Amount: **40**.
5. Confirm.
6. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **10.00** (50 - 40)
- 🏦 Cheques = **0.00**
- 💳 Bank Transfers = **0.00**
- Total Encaissé = **+60.00** (100 - 40) because the transfer is an OUT movement in history
- Total Dépensé = **50.00** (normal expense + supplier passage only)
- Balance = **10.00**
- History: a line with `caisse_out_cash` exists with **-40**.

---

# TEST 5 — Add a cheque (inventory) — caisse cheque must INCREASE

**Action**: add a cheque in inventory (not transferred to safe yet)

**Steps**
1. Open Cheque Inventory.
2. Add a cheque amount **200**.
3. Save it (do NOT transfer to safe).
4. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **10.00** (unchanged)
- 🏦 Cheques = **200.00** (must increase by 200)
- 💳 Bank Transfers = **0.00**
- Balance stays **10.00** if Balance is cash-only; otherwise it increases by 200 if Balance includes cheques.

---

# TEST 6 — Transfer cheque to safe — cheque bucket must DECREASE back

**Action**: transfer/confirm the cheque to the safe

**Steps**
1. From cheque inventory, confirm/transfer the cheque (200) to the safe (coffer main).
2. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💵 Cash = **10.00** (unchanged)
- 🏦 Cheques goes from **200.00 → 0.00** (decrease by exactly 200)
  - The key rule: the ONLY decrease must be caused by the cheque becoming "transferred" (e.g. `coffer_id` set / status updated) and/or a `caisse_out_check` movement.
- 💳 Bank Transfers = **0.00**
- Balance stays **10.00** if Balance is cash-only; otherwise it decreases by 200 if Balance includes cheques.
- History: you must see the transfer event represented (either explicit `caisse_out_check` movement or inventory state change).

---

# TEST 7 — Bank transfer in (increase virement)

**Action**: create an incoming payment by bank transfer

**Steps**
1. Create a client payment or sale paid by **Bank Transfer**.
2. Amount: **300**.
3. Save.
4. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💳 Bank Transfers = **300.00**
- 💵 Cash unchanged
- 🏦 Cheques unchanged
- History: +300 virement line exists.

---

# TEST 8 — Transfer bank transfer to safe — ONLY transfer bucket decreases

**Action**: do a deposit from caisse to safe using **bank transfer**

**Steps**
1. Go to Safe/Coffre.
2. Operation Deposit (Caisse → Coffre).
3. Method: **Bank Transfer**.
4. Amount: **100**.
5. Confirm.
6. Go back to **Caisse**.

**Expected results (exact numbers)**
- 💳 Bank Transfers = **200.00** (300 - 100)
- 💵 Cash unchanged
- 🏦 Cheques unchanged
- History: `caisse_out_bank_transfer` line exists with **-100**.

---

# TEST 9 — Supplier advance paid by Cash — must decrease Coffre (not Caisse)

**Scope**: **Normal supplier only** (not *passager*)

**Action**: create a supplier payment/advance (Créer une Avance Fournisseur) paid by **Cash**

**Steps**
1. Create a supplier payment/advance for a **normal supplier** (not passager).
2. Method: **Cash**.
3. Amount: **50**.
4. Save.
5. Go to **Coffre** → **Mouvements du Coffre**.

**Expected results**
- 💵 **Coffre Cash decreases by 50**
- Caisse totals/cards should **not** be impacted by this operation
- History (Coffre): a supplier advance/payment movement exists and is **negative**

---

# TEST 10 — Supplier payment by cheque — must NOT change cash

**Action**: supplier payment/advance paid by **cheque**

**Steps**
1. Create a supplier payment/advance.
2. Method: **Cheque**.
3. Amount: **70**.
4. Save.
5. Go back to **Caisse**.

**Expected results**
- 💵 Cash unchanged
- 🏦 Cheques unchanged (except if you also transfer cheques to safe)
- The payment must impact the **safe/cheque usage**, not caisse.

---

# TEST 11 — Anti double-counting (Global client payment vs Invoice/BL)

**Action**: one payment must be counted once

**Steps**
1. Create an invoice: total **100**, reference **FAC-TEST-1**.
2. Create a **Global Client Payment** amount **100** that clearly references **FAC-TEST-1** (in reference/notes).
3. Open **Caisse**.

**Expected results**
- The 100 must appear **only once** in totals.
- You must not see:
  - +100 from global payment
  - AND another +100 from the invoice paid amount

---

## Technical Notes (what to check if a test fails)

- Transfers to safe must create `expenses` rows with:
  - `expense_type = caisse_out_cash | caisse_out_check | caisse_out_bank_transfer`
  - and those rows must be **negative** amounts.

- Supplier passage must create `expenses` row with:
  - `expense_type = supplier_passage`

- Supplier advances/payments:
  - If method is cash/bank_transfer, it must be a **negative** movement in caisse.
  - If method is cheque, it must not reduce caisse.
