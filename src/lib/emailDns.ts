import { supabase } from '@/integrations/supabase/client';

export interface EmailDnsStatus {
  domain: string;
  nsDelegated: boolean;
  mxPresent: boolean;
  spfPresent: boolean;
  active: boolean;
  records: { ns: string[]; mx: string[]; txt: string[] };
  checkedAt: string;
}

/**
 * Checks whether the password-reset sender domain (notify.andam.uk)
 * is verified/active by inspecting its live DNS records via an edge function.
 */
export async function fetchEmailDnsStatus(): Promise<EmailDnsStatus> {
  const { data, error } = await supabase.functions.invoke('email-dns-status');
  if (error) throw error;
  return data as EmailDnsStatus;
}

/**
 * Lightweight guard used by password-reset flows. Returns true only when the
 * sender domain is confirmed active. Fails closed (false) on any error.
 */
export async function isResetEmailAvailable(): Promise<boolean> {
  try {
    const status = await fetchEmailDnsStatus();
    return status.active === true;
  } catch {
    return false;
  }
}
