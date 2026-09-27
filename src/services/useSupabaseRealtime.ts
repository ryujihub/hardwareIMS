import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type RealtimeTopic = 'products' | 'orders';

// Subscribes to Postgres changes for the given tables while mounted.
// Returns a monotonically increasing counter that increments on every
// change — screens watch it as a signal to refetch.
export function useSupabaseRealtime(topics: RealtimeTopic[]): number {
  const [changeCount, setChangeCount] = useState(0);
  const key = topics.join('-');

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () =>
        setChangeCount((c) => c + 1)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
        setChangeCount((c) => c + 1)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key]);

  return changeCount;
}
