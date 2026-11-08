import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogOut, FileText, Activity, Users, Wallet, Menu, X } from 'lucide-react';

/**
 * Navigation Bar Component.
 *
 * Tailored for all 3 stakeholders:
 * 1. Customer (Account Holder) -> /dashboard, /statements
 * 2. Inspector (Compliance Auditor) -> /auditor
 * 3. Operator (System Administrator) -> /admin, /auditor, /dashboard
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  const isActive = (path) => location.pathname === path;
  const closeMenu = () => setMobileMenuOpen(false);

  const homePath = user.role === 'AUDITOR' ? '/auditor' : user.role === 'ADMIN' ? '/admin' : '/dashboard';

  const roleLabel = user.role === 'ADMIN' 
    ? 'Operator (Admin)' 
    : user.role === 'AUDITOR' 
    ? 'Inspector (Auditor)' 
    : 'Customer';

  return (
    <header
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
      }}
    >
      <nav
        style={{
          maxWidth: '1240px',
          margin: '0 auto',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        {/* Brand Logo */}
        <Link
          to={homePath}
          onClick={closeMenu}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            textDecoration: 'none',
            color: 'var(--text-primary)'
          }}
        >
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.15rem',
                letterSpacing: '-0.02em',
                color: '#0f172a',
                lineHeight: 1.1
              }}
            >
              LedgerLine
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Secure Ledger
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="desktop-only" style={{ alignItems: 'center', gap: '0.4rem' }}>
          {(user.role === 'HOLDER' || user.role === 'ADMIN') && (
            <Link
              to="/dashboard"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: isActive('/dashboard') ? '#1d4ed8' : '#475569',
                background: isActive('/dashboard') ? '#eff6ff' : 'transparent',
                border: isActive('/dashboard') ? '1px solid #bfdbfe' : '1px solid transparent',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Wallet size={16} /> My Accounts
            </Link>
          )}

          {(user.role === 'HOLDER' || user.role === 'ADMIN') && (
            <Link
              to="/statements"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: isActive('/statements') ? '#1d4ed8' : '#475569',
                background: isActive('/statements') ? '#eff6ff' : 'transparent',
                border: isActive('/statements') ? '1px solid #bfdbfe' : '1px solid transparent',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={16} /> Statements
            </Link>
          )}

          {(user.role === 'AUDITOR' || user.role === 'ADMIN') && (
            <Link
              to="/auditor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: isActive('/auditor') ? '#0284c7' : '#475569',
                background: isActive('/auditor') ? '#f0f9ff' : 'transparent',
                border: isActive('/auditor') ? '1px solid #bae6fd' : '1px solid transparent',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={16} /> Inspector (Audit & Conservation)
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
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={16} /> Operator (Admin Console)
            </Link>
          )}
        </div>

        {/* Desktop User Info & Sign Out */}
        <div className="desktop-only" style={{ alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.25rem 0.65rem',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '999px',
              fontSize: '0.72rem',
              color: '#047857',
              fontWeight: 700
            }}
          >
            <span className="live-beacon"></span>
            <span>ACTIVE</span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600 }}>
              {user.email}
            </div>
            <span className={`badge ${user.role === 'ADMIN' ? 'badge-violet' : user.role === 'AUDITOR' ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: '0.7rem' }}>
              {roleLabel}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            title="Sign out"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="mobile-only" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${user.role === 'ADMIN' ? 'badge-violet' : user.role === 'AUDITOR' ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: '0.72rem' }}>
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f172a',
              cursor: 'pointer'
            }}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div
          className="mobile-only"
          style={{
            flexDirection: 'column',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '1rem 1.25rem 1.25rem',
            gap: '0.6rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08)'
          }}
        >
          {/* User Email & Active Tag on Mobile */}
          <div
            style={{
              padding: '0.65rem 0.85rem',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Role: <strong>{roleLabel}</strong></div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>
                {user.email}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.5rem',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '999px',
                fontSize: '0.68rem',
                color: '#047857',
                fontWeight: 700
              }}
            >
              <span className="live-beacon"></span>
              <span>LIVE</span>
            </div>
          </div>

          {(user.role === 'HOLDER' || user.role === 'ADMIN') && (
            <Link
              to="/dashboard"
              onClick={closeMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: isActive('/dashboard') ? '#1d4ed8' : '#334155',
                background: isActive('/dashboard') ? '#eff6ff' : '#ffffff',
                border: isActive('/dashboard') ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 600
              }}
            >
              <Wallet size={18} style={{ color: '#2563eb' }} /> My Accounts
            </Link>
          )}

          {(user.role === 'HOLDER' || user.role === 'ADMIN') && (
            <Link
              to="/statements"
              onClick={closeMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: isActive('/statements') ? '#1d4ed8' : '#334155',
                background: isActive('/statements') ? '#eff6ff' : '#ffffff',
                border: isActive('/statements') ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 600
              }}
            >
              <FileText size={18} style={{ color: '#2563eb' }} /> Statements & History
            </Link>
          )}

          {(user.role === 'AUDITOR' || user.role === 'ADMIN') && (
            <Link
              to="/auditor"
              onClick={closeMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: isActive('/auditor') ? '#0284c7' : '#334155',
                background: isActive('/auditor') ? '#f0f9ff' : '#ffffff',
                border: isActive('/auditor') ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 600
              }}
            >
              <Activity size={18} style={{ color: '#0284c7' }} /> Inspector (Audit & Conservation)
            </Link>
          )}

          {user.role === 'ADMIN' && (
            <Link
              to="/admin"
              onClick={closeMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: isActive('/admin') ? '#6d28d9' : '#334155',
                background: isActive('/admin') ? '#f5f3ff' : '#ffffff',
                border: isActive('/admin') ? '1px solid #ddd6fe' : '1px solid #e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 600
              }}
            >
              <Users size={18} style={{ color: '#7c3aed' }} /> Operator (Admin Console)
            </Link>
          )}

          <button
            onClick={() => { closeMenu(); handleLogout(); }}
            className="btn btn-secondary mobile-full-width"
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              color: '#dc2626',
              fontWeight: 600
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
