import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const roleHome = user.role === 'ADMIN' ? '/admin' : user.role === 'AUDITOR' ? '/auditor' : '/dashboard';
    return <Navigate to={roleHome} replace />;
  }

  return children;
}

