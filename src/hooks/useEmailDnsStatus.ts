import { useCallback, useEffect, useState } from 'react';
import { fetchEmailDnsStatus, type EmailDnsStatus } from '@/lib/emailDns';

interface UseEmailDnsStatus {
  status: EmailDnsStatus | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

export function useEmailDnsStatus(autoLoad = true): UseEmailDnsStatus {
  const [status, setStatus] = useState<EmailDnsStatus | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchEmailDnsStatus();
      setStatus(data);
    } catch {
      setError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) refresh();
  }, [autoLoad, refresh]);

  return { status, loading, error, refresh };
}
