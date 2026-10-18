import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../migrations');
export const TEMPLATE_DB = 'pk_payment_template';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDb: string;
  }
}

let pg: StartedPostgreSqlContainer | undefined;

async function dbmate(url: string, ...args: string[]): Promise<void> {
  const require = createRequire(import.meta.url);
  const { resolveBinary } = require('dbmate') as { resolveBinary: () => string };
  await run(resolveBinary(), ['--url', url, '--migrations-dir', migrationsDir, '--no-dump-schema', ...args]);
}

export default async function setup(project: TestProject) {
  pg = await new PostgreSqlContainer('postgres:17-alpine').withDatabase('postgres').start();
  const adminUrl = pg.getConnectionUri();
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  templateUrl.searchParams.set('sslmode', 'disable');
  await dbmate(templateUrl.toString(), 'create');
  await dbmate(templateUrl.toString(), 'up');
  // Prove the down migration works too, then re-apply (up → down → up)
  await dbmate(templateUrl.toString(), 'down');
  await dbmate(templateUrl.toString(), 'up');

  project.provide('pgAdminUrl', adminUrl);
  project.provide('pgTemplateDb', TEMPLATE_DB);
  return async () => {
    await pg?.stop();
  };
}
