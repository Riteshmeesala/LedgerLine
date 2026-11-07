import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogOut, FileText, Activity, Users, Wallet } from 'lucide-react';

/**
 * Navigation Bar Component.
 *
 * Clean, modern light theme with simple understandable navigation.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  const isActive = (path) => location.pathname === path;

  return (
    <nav
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0.85rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        <Link
          to="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textDecoration: 'none',
            color: 'var(--text-primary)'
          }}
        >
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                color: '#0f172a'
              }}
            >
              LedgerLine
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Secure Double-Entry Ledger
            </div>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: isActive('/dashboard') ? '#1d4ed8' : '#475569',
              background: isActive('/dashboard') ? '#eff6ff' : 'transparent',
              border: isActive('/dashboard') ? '1px solid #bfdbfe' : '1px solid transparent',
              padding: '0.5rem 0.9rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.15s ease'
            }}
          >
            <Wallet size={16} /> My Accounts
          </Link>

          <Link
            to="/statements"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: isActive('/statements') ? '#1d4ed8' : '#475569',
              background: isActive('/statements') ? '#eff6ff' : 'transparent',
              border: isActive('/statements') ? '1px solid #bfdbfe' : '1px solid transparent',
              padding: '0.5rem 0.9rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={16} /> Statements
          </Link>

          {(user.role === 'AUDITOR' || user.role === 'ADMIN') && (
            <Link
              to="/auditor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: isActive('/auditor') ? '#1d4ed8' : '#475569',
                background: isActive('/auditor') ? '#eff6ff' : 'transparent',
                border: isActive('/auditor') ? '1px solid #bfdbfe' : '1px solid transparent',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.88rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={16} /> Audit & Integrity
            </Link>
          )}

          {user.role === 'ADMIN' && (
            <Link
              to="/admin"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: isActive('/admin') ? '#6d28d9' : '#475569',
                background: isActive('/admin') ? '#f5f3ff' : 'transparent',
                border: isActive('/admin') ? '1px solid #ddd6fe' : '1px solid transparent',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.88rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={16} /> Admin Panel
            </Link>
          )}
        </div>
      </div>

      {/* Right Controls & Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '999px',
            fontSize: '0.74rem',
            color: '#047857',
            fontWeight: 700
          }}
        >
          <span className="live-beacon"></span>
          <span>SYSTEM ACTIVE</span>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
          <div style={{ fontSize: '0.86rem', color: '#0f172a', fontWeight: 600 }}>
            {user.email}
          </div>
          <span className={`badge ${user.role === 'ADMIN' ? 'badge-violet' : user.role === 'AUDITOR' ? 'badge-cyan' : 'badge-emerald'}`}>
            {user.role === 'HOLDER' ? 'Customer' : user.role}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          title="Sign out"
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
