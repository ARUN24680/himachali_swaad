import type { PushSubscriptionRequest } from '@pk/shared';
import { isIos, isStandalone } from './platform';

/** Web Push helpers (D-16, Phase 7 §7.3). The SW shows the notification; the API stores the subscription. */

export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApis) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  return 'supported';
}

/** VAPID public key (base64url) → the bytes PushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

export async function hasWorker(): Promise<boolean> {
  return (await registration()) !== null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export class PushPermissionError extends Error {
  constructor(readonly permission: NotificationPermission) {
    super(`Notification permission ${permission}`);
    this.name = 'PushPermissionError';
  }
}

/** Ask permission (must run from a tap) → subscribe with the server's VAPID key → body for POST. */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscriptionRequest> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionError(permission);
  const reg = await registration();
  if (!reg) throw new Error('No service worker');
  const ready = await navigator.serviceWorker.ready;
  const existing = await ready.pushManager.getSubscription();
  const sub =
    existing ??
    (await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('Incomplete push subscription');
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/** Unsubscribe this device; returns the endpoint to DELETE on the server (null if none). */
export async function unsubscribePush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
