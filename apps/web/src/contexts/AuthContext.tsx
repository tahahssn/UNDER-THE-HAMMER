'use client';

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { UserDTO } from '@/lib/types';
import { getAuthUser, setAuthToken, signIn as apiSignIn, signUp as apiSignUp } from '@/lib/api';

export interface AuthContextType {
  user: UserDTO | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  signOut: () => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getAuthUser();
      if (response.success && response.data?.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
      setError('Failed to check authentication');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiSignIn(email, password);
      if (response.success && response.data) {
        setAuthToken(response.data.token);
        setUser(response.data.user);
      } else {
        setError(response.error || 'Sign in failed');
        throw new Error(response.error || 'Sign in failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, firstName?: string, lastName?: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiSignUp(email, password, firstName, lastName);
        if (response.success && response.data) {
          setAuthToken(response.data.token);
          setUser(response.data.user);
        } else {
          setError(response.error || 'Sign up failed');
          throw new Error(response.error || 'Sign up failed');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign up failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const signOut = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    setError(null);
    // TODO: Call backend sign-out endpoint when available
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    signIn,
    signUp,
    signOut,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
