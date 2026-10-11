import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import type { FastifyInstance } from 'fastify';
import { rolesFor } from '@pk/shared';
import type { BullJobQueue } from '../jobs/queues';
import type { AuthGuards } from '../middleware/auth';

export const QUEUE_DASHBOARD_PATH = '/api/v1/admin/queues';

/** bull-board (D-09): queue + dead-letter visibility, ADMIN only, read/retry jobs from the browser. */
export async function registerQueueDashboard(app: FastifyInstance, jobs: BullJobQueue, guards: AuthGuards) {
  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [...jobs.queues.values()].map((q) => new BullMQAdapter(q)),
    serverAdapter,
    options: { uiConfig: { boardTitle: 'Pahadi Khatki jobs' } },
  });
  serverAdapter.setBasePath(QUEUE_DASHBOARD_PATH);
  await app.register(async (scoped) => {
    scoped.addHook('preHandler', guards.requireAuth);
    scoped.addHook('preHandler', guards.requireRole(rolesFor('queues:view')));
    await scoped.register(serverAdapter.registerPlugin(), { prefix: QUEUE_DASHBOARD_PATH });
  });
}
