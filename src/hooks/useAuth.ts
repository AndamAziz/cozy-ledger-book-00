import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { normalizeBrandText } from '@/lib/brand';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let resolved = false;
    const finish = () => {
      resolved = true;
      setIsLoading(false);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        finish();
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      finish();
    }).catch((error) => {
      console.error('getSession failed:', error);
      finish();
    });

    // Safety fallback: if getSession hangs silently (e.g. network/storage stall),
    // stop loading after 8s so the user is never stuck on the splash screen.
    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        console.warn('Auth session check timed out — falling back.');
        setIsLoading(false);
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; errorKey?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { success: false, errorKey: 'invalidCredentials' };
        }
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, errorKey: 'errorOccurred' };
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, companyName: string): Promise<{ success: boolean; error?: string; errorKey?: string }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          return { success: false, errorKey: 'emailAlreadyRegistered' };
        }
        return { success: false, error: error.message };
      }

      // Update company name in user_approvals after signup
      if (data.user) {
        // Use setTimeout to defer the Supabase call
        setTimeout(async () => {
          await supabase
            .from('user_approvals')
            .update({ company_name: normalizeBrandText(companyName) })
            .eq('user_id', data.user!.id);
        }, 100);
      }

      return { success: true };
    } catch (err) {
      return { success: false, errorKey: 'errorOccurred' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clear local state first
      setSession(null);
      setUser(null);
      
      // Then sign out from Supabase
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if signOut fails
      setSession(null);
      setUser(null);
    }
  }, []);

  return { 
    user,
    session,
    isAuthenticated: !!session, 
    isLoading, 
    login, 
    signup,
    logout 
  };
}
