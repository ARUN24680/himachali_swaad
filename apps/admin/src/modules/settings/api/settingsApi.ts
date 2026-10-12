import type { SettingsListResponse } from '@pk/shared';
import { http } from '@/services/api/http';

type SettingRow = SettingsListResponse['settings'][number];

/** Business settings (Phase 9 §9.7): per-key Zod validation server-side, every change audited. */
export const settingsApi = {
  list: (signal?: AbortSignal) => http<SettingsListResponse>('/admin/settings', { signal }),
  update: (key: string, value: unknown) =>
    http<{ setting: SettingRow }>('/admin/settings', { method: 'PATCH', body: { key, value } }),
};
