import { useState, useEffect, useCallback } from 'react';

const ADMIN_EMAIL = 'andam@outlook.com';
const ADMIN_PASSWORD = '12345678';
const AUTH_KEY = 'finance_auth';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem(AUTH_KEY);
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((email: string, password: string): { success: boolean; error?: string } => {
    if (email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'true');
      setIsAuthenticated(true);
      return { success: true };
    }
    return { success: false, error: 'ئیمەیڵ یان وشەی نهێنی هەڵەیە' };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoading, login, logout };
}
