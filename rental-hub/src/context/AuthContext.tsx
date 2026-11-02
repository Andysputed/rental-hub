/**
 * AuthContext — simple token-based auth for RentalHub's single-landlord mode.
 *
 * Stores the token in localStorage and attaches it to every API request via
 * the Authorization header. On app startup, validates a stored token against
 * GET /api/v1/auth/me/ to confirm it is still valid.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../services/api';

export interface AuthUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'rentalhub_auth_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /** Validates a stored token by calling /auth/me/ */
  const validateToken = useCallback(async (t: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/`, {
        headers: { Authorization: `Token ${t}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        username: data.username,
        email: data.email || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
      };
    } catch {
      return null;
    }
  }, []);

  /** On mount: validate any token already stored in localStorage */
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    validateToken(stored).then((validUser) => {
      if (validUser) {
        setToken(stored);
        setUser(validUser);
      } else {
        // Token is expired or invalid — clear it
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
      }
      setIsLoading(false);
    });
  }, [validateToken]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const res = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed. Please check your credentials.');
    }

    const { token: newToken, ...userData } = data;
    try {
      sessionStorage.removeItem('rentalhub_selected_month');
    } catch {
      // ignore
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser({
      username: userData.username,
      email: userData.email || '',
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
    });
  }, []);

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (currentToken) {
      // Best-effort server-side logout; don't block on failure
      try {
        await fetch(`${API_BASE_URL}/auth/logout/`, {
          method: 'POST',
          headers: { Authorization: `Token ${currentToken}` },
        });
      } catch {
        // Network error — clear local state regardless
      }
    }
    try {
      sessionStorage.removeItem('rentalhub_selected_month');
    } catch {
      // ignore
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token && !!user,
        isLoading,
        user,
        token,
        login,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

