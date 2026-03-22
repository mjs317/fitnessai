'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SessionRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Proactively refresh session on mount so the JWT stays fresh
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) supabase.auth.refreshSession();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
      if (event === 'TOKEN_REFRESHED') router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
