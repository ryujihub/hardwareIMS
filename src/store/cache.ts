import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueuedOrder } from '@/types';

// AsyncStorage keys for the offline-first layer
export const CACHE_KEYS = {
  products: 'cache.products',
  settings: 'cache.settings',
  queue: 'queue.orders',
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — offline cache is best-effort
  }
}

// ---------- Offline order queue ----------

export async function getQueue(): Promise<QueuedOrder[]> {
  return (await cacheGet<QueuedOrder[]>(CACHE_KEYS.queue)) ?? [];
}

export async function enqueueOrder(order: QueuedOrder): Promise<void> {
  const queue = await getQueue();
  queue.push(order);
  await cacheSet(CACHE_KEYS.queue, queue);
}

export async function removeQueuedOrder(localId: string): Promise<void> {
  const queue = await getQueue();
  await cacheSet(CACHE_KEYS.queue, queue.filter((q) => q.localId !== localId));
}

export async function replaceQueue(queue: QueuedOrder[]): Promise<void> {
  await cacheSet(CACHE_KEYS.queue, queue);
}
