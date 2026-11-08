import React, { createContext, useContext, useState, useEffect } from 'react';
import { setToken, getToken, clearToken, onUnauthorized, apiClient } from '../api/client';

const AuthContext = createContext(null);

const USER_STORAGE_KEY = 'ledgerline_auth_user';

function getStoredUser() {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function saveStoredUser(userData) {
  try {
    if (userData) {
      const serialized = JSON.stringify(userData);
      localStorage.setItem(USER_STORAGE_KEY, serialized);
      sessionStorage.setItem(USER_STORAGE_KEY, serialized);
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
      sessionStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch (e) {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      saveStoredUser(null);
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
      const userData = {
        id: res.id || res.userId,
        email: res.email,
        role: res.role,
        enabled: true
      };
      setUser(userData);
      saveStoredUser(userData);
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
      const userData = {
        id: res.id || res.userId,
        email: res.email,
        role: res.role,
        enabled: true
      };
      setUser(userData);
      saveStoredUser(userData);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    saveStoredUser(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!getToken()) return null;
    try {
      const me = await apiClient('/api/me');
      setUser(me);
      saveStoredUser(me);
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

