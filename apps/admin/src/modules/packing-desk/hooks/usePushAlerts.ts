import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  currentSubscription,
  hasWorker,
  pushSupport,
  PushPermissionError,
  subscribePush,
  unsubscribePush,
} from '@/pwa/push';
import { queryKeys } from '@/services/api/query-keys';
import { packingDeskApi } from '../api/packingDeskApi';

export type PushStatus =
  | 'loading'
  | 'error'
  | 'not-configured' // server has no VAPID keys → WhatsApp alerts
  | 'unsupported'
  | 'ios-install'
  | 'no-worker'
  | 'denied'
  | 'on'
  | 'off';

interface DeviceState {
  worker: boolean;
  subscribed: boolean;
  permission: NotificationPermission | 'unsupported';
}

async function readDevice(): Promise<DeviceState> {
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  if (pushSupport() !== 'supported') return { worker: false, subscribed: false, permission };
  const worker = await hasWorker();
  return { worker, subscribed: worker && (await currentSubscription()) !== null, permission };
}

/** New-order alerts on this phone (D-16, Phase 7 §7.3): permission → PushManager → POST subscription. */
export function usePushAlerts() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: queryKeys.partner.push,
    queryFn: ({ signal }) => packingDeskApi.pushConfig(signal),
  });
  const [device, setDevice] = useState<DeviceState | null>(null);

  useEffect(() => {
    let alive = true;
    void readDevice().then((d) => alive && setDevice(d));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = async () => {
    setDevice(await readDevice());
    await qc.invalidateQueries({ queryKey: queryKeys.partner.push });
  };

  const enable = useMutation({
    mutationFn: async () => {
      const key = config.data?.vapidPublicKey;
      if (!key) throw new Error('Push not configured');
      await packingDeskApi.subscribePush(await subscribePush(key));
    },
    onSettled: refresh,
  });

  const disable = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribePush();
      if (endpoint) await packingDeskApi.unsubscribePush(endpoint);
    },
    onSettled: refresh,
  });

  const support = pushSupport();
  const status: PushStatus = (() => {
    if (config.isPending || device === null) return 'loading';
    if (config.isError) return 'error';
    if (!config.data.vapidPublicKey) return 'not-configured';
    if (support === 'ios-needs-install') return 'ios-install';
    if (support !== 'supported') return 'unsupported';
    if (!device.worker) return 'no-worker';
    if (device.permission === 'denied' || enable.error instanceof PushPermissionError) return 'denied';
    return device.subscribed ? 'on' : 'off';
  })();

  return { status, config, enable, disable };
}
