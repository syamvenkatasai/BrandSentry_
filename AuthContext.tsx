import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { apiClient } from '@/api/client';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'brand_market_admin'
  | 'brand_market_user'
  | 'trademark_admin'
  | 'trademark_user'
  | 'business_team'
  | 'trademark_team';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Role helpers
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isBrandMarketingAdmin: boolean;
  isBrandMarketingUser: boolean;
  isTrademarkAdmin: boolean;
  isTrademarkUser: boolean;
  canAccessDashboard: boolean;
  canAccessReports: boolean;
  canAccessUserManagement: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Wipe all per-user UI caches (generated names, analysis, compare, last query…)
// so one user's session never carries over to the next on the same browser.
// Was previously clearing sessionStorage, but every actual write across this
// app (pharma_gen_form, pharma_gen_results, pharma_last_query,
// pharma_active_case_id, pharma_compare_names, pharma_brand_suggestions) uses
// localStorage — sessionStorage is never written to anywhere, so this was a
// silent no-op. pharma_token/pharma_user are excluded since login()/logout()
// manage those explicitly themselves, immediately before/after this call.
function clearUserCache() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('pharma_') && k !== 'pharma_token' && k !== 'pharma_user')
      .forEach(k => localStorage.removeItem(k));
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('pharma_token');
    const savedUser = localStorage.getItem('pharma_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('pharma_token');
        localStorage.removeItem('pharma_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Defensive: clear any leftover cache before establishing the new session.
    clearUserCache();
    const result = await apiClient.login(email, password);
    setToken(result.access_token);
    setUser(result.user);
    localStorage.setItem('pharma_token', result.access_token);
    localStorage.setItem('pharma_user', JSON.stringify(result.user));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('pharma_token');
    localStorage.removeItem('pharma_user');
    clearUserCache();
  }, []);

  // Compute granular role flags matching BRD V1.2
  const isSuperAdmin = !!user?.is_superuser || user?.role === 'super_admin';
  const isAdmin = isSuperAdmin || user?.role === 'admin';
  const isBrandMarketingAdmin = user?.role === 'brand_market_admin';
  const isBrandMarketingUser = user?.role === 'brand_market_user' || user?.role === 'business_team';
  const isTrademarkAdmin = user?.role === 'trademark_admin';
  const isTrademarkUser = user?.role === 'trademark_user' || user?.role === 'trademark_team';

  // Page access capabilities
  const canAccessDashboard = isSuperAdmin || isAdmin || isBrandMarketingAdmin || isTrademarkAdmin;
  const canAccessReports = isSuperAdmin || isAdmin || isBrandMarketingAdmin || isTrademarkAdmin;
  const canAccessUserManagement = isSuperAdmin;

  return (
    <AuthContext.Provider value={{
      user, token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login, logout,
      isSuperAdmin,
      isAdmin,
      isBrandMarketingAdmin,
      isBrandMarketingUser,
      isTrademarkAdmin,
      isTrademarkUser,
      canAccessDashboard,
      canAccessReports,
      canAccessUserManagement,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
