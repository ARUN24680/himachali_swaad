import type { WebhookFailuresResponseSchema } from '@pk/shared';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { http } from '@/services/api/http';

export type WebhookFailure = z.infer<typeof WebhookFailuresResponseSchema>['events'][number];

/** Ops tooling (Phase 9 §9.11): webhook failures + replay; bull-board lives on the API origin. */
export const opsApi = {
  webhookFailures: (signal?: AbortSignal) => http<{ events: WebhookFailure[] }>('/admin/webhooks/failures', { signal }),
  replay: (id: number) =>
    http<{ ok: true; message?: string }>(`/admin/webhooks/${id}/replay`, { method: 'POST', body: {} }),
  bullBoardUrl: `${env.VITE_API_URL}/api/v1/admin/queues`,
};
