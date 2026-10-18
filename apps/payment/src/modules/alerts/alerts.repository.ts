import type { Queryable } from '../../config/db';

export type AlertSource = 'EMAIL' | 'ANDROID' | 'DEV' | 'ADMIN';
export type AlertStatus = 'MATCHED' | 'LINKED' | 'UNMATCHED' | 'DUPLICATE' | 'REJECTED' | 'DISMISSED';

export interface AlertRow {
  id: number;
  source: AlertSource;
  external_id: string;
  utr: string | null;
  amount_paise: number | null;
  credited_at: Date;
  sender: string | null;
  status: AlertStatus;
  reason: string | null;
  order_id: string | null;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
}

export interface DeviceRow {
  id: string;
  label: string;
  secret_ciphertext: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
}

/** null = this external id was already stored (redelivery). */
export async function insertAlert(
  q: Queryable,
  a: {
    source: AlertSource;
    externalId: string;
    utr: string | null;
    amountPaise: number | null;
    creditedAt: Date;
    sender: string | null;
    status: AlertStatus;
    reason: string | null;
    orderId: string | null;
  },
): Promise<AlertRow | null> {
  const r = await q.query<AlertRow>(
    `INSERT INTO upi_credit_alerts (source, external_id, utr, amount_paise, credited_at, sender, status, reason, order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (external_id) DO NOTHING RETURNING *`,
    [a.source, a.externalId, a.utr, a.amountPaise, a.creditedAt, a.sender, a.status, a.reason, a.orderId],
  );
  return r.rows[0] ?? null;
}

export async function findAlert(q: Queryable, id: number, lock = false): Promise<AlertRow | null> {
  const r = await q.query<AlertRow>(`SELECT * FROM upi_credit_alerts WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return r.rows[0] ?? null;
}

export async function alertExists(q: Queryable, externalId: string): Promise<boolean> {
  const r = await q.query(`SELECT 1 FROM upi_credit_alerts WHERE external_id = $1`, [externalId]);
  return (r.rowCount ?? 0) > 0;
}

/** An earlier alert for the same bank transfer (another channel, or a re-sent SMS). */
export async function utrSeen(q: Queryable, utr: string): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 FROM upi_credit_alerts WHERE utr = $1 AND status IN ('MATCHED', 'LINKED', 'UNMATCHED', 'DISMISSED')
     UNION ALL SELECT 1 FROM upi_payments WHERE utr = $1 LIMIT 1`,
    [utr],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Serialises everything about one bank transfer (e-mail + SMS for the same UTR arrive together). */
export async function lockUtr(q: Queryable, utr: string): Promise<void> {
  await q.query(`SELECT pg_advisory_xact_lock(hashtextextended('upi-utr:' || $1, 0))`, [utr]);
}

export async function resolveAlert(
  q: Queryable,
  id: number,
  r: { status: 'LINKED' | 'DISMISSED'; orderId: string | null; reason: string | null; by: string },
): Promise<void> {
  await q.query(
    `UPDATE upi_credit_alerts SET status = $2, order_id = COALESCE($3, order_id), reason = COALESCE($4, reason),
            resolved_at = NOW(), resolved_by = $5
      WHERE id = $1`,
    [id, r.status, r.orderId, r.reason, r.by],
  );
}

export async function listForReview(q: Queryable, limit: number): Promise<AlertRow[]> {
  const r = await q.query<AlertRow>(
    `SELECT * FROM upi_credit_alerts WHERE status IN ('UNMATCHED', 'REJECTED') ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function insertDevice(q: Queryable, label: string, secretCiphertext: string): Promise<DeviceRow> {
  const r = await q.query<DeviceRow>(
    `INSERT INTO upi_observer_devices (label, secret_ciphertext) VALUES ($1, $2) RETURNING *`,
    [label, secretCiphertext],
  );
  return r.rows[0]!;
}

export async function findActiveDevice(q: Queryable, id: string): Promise<DeviceRow | null> {
  const r = await q.query<DeviceRow>(`SELECT * FROM upi_observer_devices WHERE id = $1::uuid AND revoked_at IS NULL`, [
    id,
  ]);
  return r.rows[0] ?? null;
}

export async function listDevices(q: Queryable): Promise<Omit<DeviceRow, 'secret_ciphertext'>[]> {
  const r = await q.query<Omit<DeviceRow, 'secret_ciphertext'>>(
    `SELECT id, label, created_at, last_seen_at, revoked_at FROM upi_observer_devices ORDER BY created_at`,
  );
  return r.rows;
}

export async function revokeDevice(q: Queryable, id: string): Promise<boolean> {
  const r = await q.query(
    `UPDATE upi_observer_devices SET revoked_at = NOW() WHERE id = $1::uuid AND revoked_at IS NULL`,
    [id],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function touchDevice(q: Queryable, id: string): Promise<void> {
  await q.query(`UPDATE upi_observer_devices SET last_seen_at = NOW() WHERE id = $1::uuid`, [id]);
}

/** false = nonce already used by this device (replay). */
export async function useNonce(q: Queryable, deviceId: string, nonce: string): Promise<boolean> {
  const r = await q.query(
    `INSERT INTO upi_observer_nonces (device_id, nonce) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
    [deviceId, nonce],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function sweepNonces(q: Queryable, olderThanSec: number): Promise<void> {
  await q.query(`DELETE FROM upi_observer_nonces WHERE seen_at < NOW() - make_interval(secs => $1::int)`, [
    olderThanSec,
  ]);
}

/** Devices that have not checked in for `sec` (heartbeat watchdog). */
export async function silentDevices(q: Queryable, sec: number): Promise<{ id: string; label: string }[]> {
  const r = await q.query<{ id: string; label: string }>(
    `SELECT id, label FROM upi_observer_devices
      WHERE revoked_at IS NULL AND COALESCE(last_seen_at, created_at) < NOW() - make_interval(secs => $1::int)`,
    [sec],
  );
  return r.rows;
}
