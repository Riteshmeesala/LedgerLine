import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import * as AuthContext from '../context/AuthContext';

describe('Role-Based ProtectedRoute & Navigation', () => {
  it('redirects unauthenticated users to login', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('allows authorized roles and renders protected view', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'auditor@test.local', role: 'AUDITOR' },
      isAuthenticated: true
    });

    render(
      <MemoryRouter initialEntries={['/auditor']}>
        <Routes>
          <Route
            path="/auditor"
            element={
              <ProtectedRoute allowedRoles={['AUDITOR', 'ADMIN']}>
                <div>Auditor Inspection Console</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Auditor Inspection Console')).toBeInTheDocument();
  });

  it('redirects unauthorized roles (e.g. HOLDER accessing /admin)', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'user-2', email: 'holder@test.local', role: 'HOLDER' },
      isAuthenticated: true
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/dashboard" element={<div>Holder Dashboard Fallback</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Admin Secret Panel</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Holder Dashboard Fallback')).toBeInTheDocument();
    expect(screen.queryByText('Admin Secret Panel')).not.toBeInTheDocument();
  });

  it('redirects ADMIN to /admin when accessing HOLDER /dashboard', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' },
      isAuthenticated: true
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/admin" element={<div>Admin Console Fallback</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['HOLDER']}>
                <div>Holder Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Console Fallback')).toBeInTheDocument();
    expect(screen.queryByText('Holder Dashboard')).not.toBeInTheDocument();
  });
});

