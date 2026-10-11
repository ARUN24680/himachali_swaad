/**
 * pnpm db:seed:staff — first ADMIN + first KITCHEN_PARTNER + HP-KULLU-01 kitchen (Phase 2 §2.3).
 * Credentials come from env (SEED_*) or an interactive prompt — never from the repo.
 * Idempotent: existing users/locations are left untouched (passwords are never overwritten).
 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { NewPasswordSchema, PhoneSchema } from '@pk/shared';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createDb } from '../src/config/db';
import { createLogger } from '../src/config/logger';
import { BCRYPT_COST } from '../src/modules/auth/auth.service';

let muted = false;
const output = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });

async function ask(envKey: string, question: string, opts: { secret?: boolean; schema: z.ZodType<string> }) {
  const fromEnv = process.env[envKey];
  if (fromEnv) return opts.schema.parse(fromEnv);
  for (;;) {
    process.stdout.write(question);
    muted = Boolean(opts.secret);
    const answer = (await rl.question('')).trim();
    muted = false;
    if (opts.secret) process.stdout.write('\n');
    const parsed = opts.schema.safeParse(answer);
    if (parsed.success) return parsed.data;
    process.stdout.write(`  ✖ ${parsed.error.issues[0]?.message}\n`);
  }
}

const Email = z.email();
const Name = z.string().min(2).max(120);

async function main() {
  const databaseUrl = z.url().parse(process.env.DATABASE_URL);
  const db = createDb(
    {
      connectionString: databaseUrl,
      max: 2,
      slowQueryMs: 10_000,
      applicationName: 'pk-seed',
      ssl: process.env.NODE_ENV === 'production',
    },
    createLogger({ level: 'warn', name: 'pk-seed' }),
  );

  process.stdout.write('\nPahadi Khatki — seed first staff accounts\n\n');
  const admin = {
    name: await ask('SEED_ADMIN_NAME', 'Admin full name: ', { schema: Name }),
    email: await ask('SEED_ADMIN_EMAIL', 'Admin email: ', { schema: Email }),
    password: await ask('SEED_ADMIN_PASSWORD', 'Admin password (min 12 chars, hidden): ', {
      secret: true,
      schema: NewPasswordSchema,
    }),
  };
  const partner = {
    name: await ask('SEED_PARTNER_NAME', 'Kitchen partner full name: ', { schema: Name }),
    email: await ask('SEED_PARTNER_EMAIL', 'Kitchen partner email: ', { schema: Email }),
    phone: await ask('SEED_PARTNER_PHONE', 'Kitchen partner mobile (+91XXXXXXXXXX): ', { schema: PhoneSchema }),
    password: await ask('SEED_PARTNER_PASSWORD', 'Kitchen partner password (min 12 chars, hidden): ', {
      secret: true,
      schema: NewPasswordSchema,
    }),
  };
  rl.close();

  const result = await db.transaction(async (c) => {
    const insertStaff = async (u: { name: string; email: string; password: string; phone?: string }, role: string) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (email, phone, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [u.email, u.phone ?? null, u.name, role, await bcrypt.hash(u.password, BCRYPT_COST)],
      );
      if (rows[0]) return { id: rows[0].id, created: true };
      const existing = await c.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [u.email]);
      return { id: existing.rows[0]!.id, created: false };
    };

    const a = await insertStaff(admin, 'ADMIN');
    const p = await insertStaff(partner, 'KITCHEN_PARTNER');

    // Real address/FSSAI come from Phase 0 paperwork — placeholders are flagged for the admin to fix
    const loc = await c.query<{ id: string }>(
      `INSERT INTO pickup_locations (code, name, contact_name, contact_phone, address_line1, city, state, pincode)
       VALUES ('HP-KULLU-01', 'Kullu Kitchen', $1, $2, 'ADDRESS PENDING — update before Shiprocket setup', 'Kullu', 'Himachal Pradesh', '175101')
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code RETURNING id`,
      [partner.name, partner.phone],
    );
    const locationId = loc.rows[0]!.id;
    await c.query(
      'INSERT INTO user_pickup_locations (user_id, pickup_location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [p.id, locationId],
    );
    return { a, p, locationId };
  });

  await db.close();
  const status = (x: { created: boolean }) => (x.created ? 'created' : 'already existed — left unchanged');
  process.stdout.write(
    `\n✔ ADMIN ${admin.email}: ${status(result.a)}\n` +
      `✔ KITCHEN_PARTNER ${partner.email}: ${status(result.p)}\n` +
      `✔ Pickup location HP-KULLU-01 (${result.locationId}) mapped to the partner\n` +
      `  ⚠ Update the kitchen address before Phase 6 (Shiprocket pickup).\n\n`,
  );
}

main().catch((err) => {
  rl.close();
  process.stderr.write(`✖ Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
