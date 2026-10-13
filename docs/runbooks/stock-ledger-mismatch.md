# Stock ledger mismatch

**Symptoms:** alert `LEDGER_MISMATCH` (daily `LEDGER_CHECK` at 03:30 IST) + Sentry error
"Stock ledger mismatch on N batch(es)".

Invariant (doc 07, invariant 2): for every batch,
`available_stock = SUM(inventory_movements.quantity_delta)`. Drift means something changed stock
without a movement — a bug or a manual SQL edit. **Never "fix" it by editing `available_stock`.**

## Check (read-only)
```sql
SELECT b.id, b.batch_code, b.available_stock,
       COALESCE(SUM(m.quantity_delta), 0) AS ledger_sum,
       b.available_stock - COALESCE(SUM(m.quantity_delta), 0) AS drift
  FROM inventory_batches b
  LEFT JOIN inventory_movements m ON m.batch_id = b.id
 GROUP BY b.id HAVING b.available_stock <> COALESCE(SUM(m.quantity_delta), 0);
```
Then for each batch: last movements (`SELECT * FROM inventory_movements WHERE batch_id = $1 ORDER BY
created_at DESC LIMIT 20`) and Admin → **Audit log** for `inventory_batch` around that time. Was anyone
running SQL? Did a deploy happen?

## Fix
1. **Pause sales of that product** (Admin → Products → product → **Unpublish**) if `available_stock` > physical
   jars — overselling is worse than a lost sale.
2. Count the physical jars of that batch at the kitchen.
3. Record the truth with **Inventory → batch → Adjust stock** (creates an `ADJUSTMENT` movement + audit row).
   If the drift is in `available_stock` itself (no movement), the fix needs a code change or a
   reviewed one-off migration that inserts the missing movement — open an issue, do not edit.
4. Find the root cause (bug / manual edit) before re-publishing.

## Verify
`LEDGER_CHECK` next run (or the query above) returns 0 rows; product re-published.
