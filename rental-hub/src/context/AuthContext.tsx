/**
 * AuthContext — cookie session auth for RentalHub's single-landlord mode.
 * The HttpOnly session cookie remains server-controlled; app startup restores
 * user state from GET /api/v1/auth/me/ without storing credentials in JS storage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, apiFetch, getCsrfToken } from '../services/api';
import { AuthContext } from './authContextState';

export interface AuthUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /** Restores the server-side session after a browser refresh. */
  const validateSession = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/`, { credentials: 'include' });
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

  /** On mount: restore the landlord session after a browser refresh. */
  useEffect(() => {
    let active = true;
    validateSession().then((validUser) => {
      if (active) {
        setUser(validUser);
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, [validateSession]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    await getCsrfToken(true);
    const res = await apiFetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed. Please check your credentials.');
    }

    const userData = data;
    try {
      sessionStorage.removeItem('rentalhub_selected_month');
    } catch {
      // ignore
    }
    await getCsrfToken(true);
    setUser({
      username: userData.username,
      email: userData.email || '',
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
    });
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      try {
        await apiFetch('/auth/logout/', { method: 'POST', body: JSON.stringify({}) });
      } catch {
        // Clear local UI state even if the session endpoint is unavailable.
      }
    }
    try {
      sessionStorage.removeItem('rentalhub_selected_month');
    } catch {
      // ignore
    }
    setUser(null);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        isLoading,
        user,
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

