import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../../../packages/database/migrations');

export const TEMPLATE_DB = 'pk_template';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDb: string;
    redisUrl: string;
  }
}

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

async function dbmate(url: string, ...args: string[]): Promise<void> {
  const require = createRequire(import.meta.url);
  const { resolveBinary } = require('dbmate') as { resolveBinary: () => string };
  await run(resolveBinary(), ['--url', url, '--migrations-dir', migrationsDir, '--no-dump-schema', ...args]);
}

export default async function setup(project: TestProject) {
  [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').withDatabase('postgres').start(),
    new RedisContainer('redis:7.4-alpine').start(),
  ]);

  const adminUrl = pg.getConnectionUri();
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  templateUrl.searchParams.set('sslmode', 'disable');

  // Every test file clones this template → isolated DB per file, migrations applied once
  await dbmate(templateUrl.toString(), 'create');
  await dbmate(templateUrl.toString(), 'up');

  project.provide('pgAdminUrl', adminUrl);
  project.provide('pgTemplateDb', TEMPLATE_DB);
  project.provide('redisUrl', redis.getConnectionUrl());

  return async () => {
    await Promise.all([pg?.stop(), redis?.stop()]);
  };
}
