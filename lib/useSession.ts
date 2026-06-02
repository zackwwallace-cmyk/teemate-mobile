import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registerForPushNotifications } from './notifications';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setLoading(false);
      if (nextSession?.user.id) registerForPushNotifications(nextSession.user.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (nextSession?.user.id) registerForPushNotifications(nextSession.user.id);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
