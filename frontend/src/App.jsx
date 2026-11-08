import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import InactivityWatchdog from './components/InactivityWatchdog';
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import HolderDashboard from './views/HolderDashboard';
import StatementView from './views/StatementView';
import AuditorDashboard from './views/AuditorDashboard';
import AdminPanel from './views/AdminPanel';

function InactivityWatchdogContainer() {
  const { user, logout } = useAuth();
  return <InactivityWatchdog user={user} onLogout={logout} />;
}

function RootRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  if (user.role === 'AUDITOR') {
    return <Navigate to="/auditor" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Navbar />
          <InactivityWatchdogContainer />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/login" element={<LoginView />} />
              <Route path="/register" element={<RegisterView />} />
              
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['HOLDER']}>
                    <HolderDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/statements"
                element={
                  <ProtectedRoute allowedRoles={['HOLDER']}>
                    <StatementView />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/auditor"
                element={
                  <ProtectedRoute allowedRoles={['AUDITOR', 'ADMIN']}>
                    <AuditorDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}
