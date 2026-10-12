# Customer data deletion request (DPDP Act 2023)

**Trigger:** customer writes to the Grievance Officer / support asking to delete their data.
Respond within the time promised in the Privacy Policy; log the request (date, channel, phone).

## What must be kept
GST law requires invoices and the order/payment records behind them to be kept (8 years). So we
**anonymise** personal data instead of deleting orders. Payments/refunds keep only gateway ids and
amounts (no card/UPI data is stored by us).

## Steps
1. Verify identity: OTP login on the phone number, or reply from the e-mail on the order.
2. Check no order is in flight (`CONFIRMED` … `OUT_FOR_DELIVERY`, open refunds). If there is one,
   finish it first and tell the customer.
3. Run in **one transaction** (replace `$1` with the E.164 phone, `$2` with a request id):
   ```sql
   BEGIN;
   -- saved addresses + account
   DELETE FROM addresses WHERE user_id = (SELECT id FROM users WHERE phone = $1);
   UPDATE users SET phone = NULL, email = 'deleted+' || $2 || '@invalid', full_name = NULL,
          is_active = false
    WHERE phone = $1 AND role = 'CUSTOMER';
   DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = 'deleted+' || $2 || '@invalid');
   -- orders: keep amounts/items (GST), drop who/where
   UPDATE orders SET customer_name = 'Deleted customer', customer_email = NULL,
          shipping_address = jsonb_build_object('pincode', shipping_address->>'pincode',
                                                'state', shipping_address->>'state', 'deleted', true)
    WHERE customer_phone = $1;
   -- message log: drop the recipient phone / e-mail + template variables (names, addresses)
   UPDATE notifications_log SET recipient = 'deleted', variables = '{}'::jsonb
    WHERE recipient = $1 OR order_id IN (SELECT id FROM orders WHERE customer_phone = $1);
   COMMIT;
   ```
   Check the column names against `architecture/01-database-schema-models.md` before running —
   the schema is the source of truth. `orders.customer_phone` must stay (CHECK constraint +
   invoices); it is the one identifier we keep under the GST retention obligation — say so in the reply.
4. Ask Shiprocket support to delete the consignee data for the customer's AWBs (they are a
   processor), and remove the chat from WhatsApp Business.
5. Reply to the customer: what was deleted, what is kept and why (GST invoice retention), date.
6. Record the request + completion in the DPDP register (spreadsheet), not in the app.

Later improvement (v2 backlog): an admin action that does step 3 with an audit row.
