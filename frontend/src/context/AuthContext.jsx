import React, { createContext, useContext, useState, useEffect } from 'react';
import { setToken, getToken, clearToken, onUnauthorized, apiClient } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await apiClient('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(res.token);
      setUser({
        id: res.id,
        email: res.email,
        role: res.role,
        enabled: true
      });
      return res;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password) => {
    setLoading(true);
    try {
      const res = await apiClient('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(res.token);
      setUser({
        id: res.id,
        email: res.email,
        role: res.role,
        enabled: true
      });
      return res;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const refreshUser = async () => {
    if (!getToken()) return null;
    try {
      const me = await apiClient('/api/me');
      setUser(me);
      return me;
    } catch (e) {
      logout();
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
