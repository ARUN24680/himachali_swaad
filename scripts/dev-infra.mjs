// npm/pnpm run dev must start the infrastructure selected by .env, not silently wait on dead Redis.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`${command} failed. Check Docker Desktop and the database settings in .env, then retry.`);
    process.exit(result.status || 1);
  }
}

try {
  const env = { ...parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')), ...process.env };
  const database = new URL(env.DATABASE_URL);
  const redis = new URL(env.REDIS_URL);
  const local = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local(database) && local(redis)) {
    const fullDocker = database.port === '5435' && redis.port === '6381';
    const localDocker = database.port === '5433' && redis.port === '6380';
    if (fullDocker || localDocker) {
      const file = fullDocker ? 'docker-compose.prod.yml' : 'docker-compose.yml';
      console.log(`Starting PostgreSQL and Redis from ${file} (existing volumes preserved).`);
      run('docker', ['compose', '-f', file, 'up', '-d', '--wait', '--wait-timeout', '60', 'postgres', 'redis']);
    }
  }
  run('pnpm', ['db:up']);
} catch {
  console.error('Cannot read database configuration. Copy .env.example to .env and set DATABASE_URL / REDIS_URL.');
  process.exit(1);
}
