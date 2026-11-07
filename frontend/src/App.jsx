import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import HolderDashboard from './views/HolderDashboard';
import StatementView from './views/StatementView';
import AuditorDashboard from './views/AuditorDashboard';
import AdminPanel from './views/AdminPanel';

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/login" element={<LoginView />} />
              <Route path="/register" element={<RegisterView />} />
              
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <HolderDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/statements"
                element={
                  <ProtectedRoute>
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

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}
