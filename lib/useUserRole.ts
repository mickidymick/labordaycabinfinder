import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase, type Profile, type UserRole } from './supabase';

/**
 * Session + profile + role, refreshed on every auth event.
 * Anyone not on the allowlist lands in `pending` and RLS hides everything from
 * them, so the UI just shows a "waiting for approval" state.
 */
export function useUserRole() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setUserId(null);
      setEmail(null);
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setEmail(user.email ?? null);

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => load());
    return () => listener.subscription.unsubscribe();
  }, [load]);

  const role: UserRole | null = profile?.role ?? null;

  return {
    profile,
    role,
    userId,
    email,
    loading,
    isSignedIn: Boolean(userId),
    isMember: role === 'member' || role === 'admin',
    isAdmin: role === 'admin',
    isPending: Boolean(userId) && role === 'pending',
    refresh: load,
  };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
