import { supabase } from '@/integrations/supabase/client';

export interface AccountProviderInfo {
  exists: boolean;
  providers: string[];
  hasPassword: boolean;
  /** Account exists, was created with Google, and has no email/password set yet. */
  isGoogleOnly: boolean;
  /** Account has a linked Google identity (regardless of password). */
  hasGoogle: boolean;
}

const EMPTY: AccountProviderInfo = {
  exists: false,
  providers: [],
  hasPassword: false,
  isGoogleOnly: false,
  hasGoogle: false,
};

/**
 * Looks up how an email address can sign in (Google OAuth, email/password, ...).
 * Uses a secure edge function backed by a service-role-only DB function that
 * reads Supabase's auth.users / auth.identities tables.
 *
 * Fails open (returns EMPTY) so the calling flow can continue normally if the
 * lookup is unavailable — it only enhances messaging, it never blocks auth.
 */
export async function getAccountProviderInfo(email: string): Promise<AccountProviderInfo> {
  try {
    const { data, error } = await supabase.functions.invoke('account-provider-check', {
      body: { email: email.trim().toLowerCase() },
    });
    if (error || !data) return EMPTY;
    return {
      exists: !!data.exists,
      providers: Array.isArray(data.providers) ? data.providers : [],
      hasPassword: !!data.hasPassword,
      isGoogleOnly: !!data.isGoogleOnly,
      hasGoogle: !!data.hasGoogle,
    };
  } catch {
    return EMPTY;
  }
}
