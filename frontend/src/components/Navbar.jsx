import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogOut, FileText, Activity, Users, Wallet, Radio } from 'lucide-react';

/**
 * Navigation Bar Component.
 *
 * SECURITY NOTE:
 * Conditional rendering of navigation links based on user role is strictly COSMETIC
 * for user convenience. Client-side navigation or hidden UI controls never constitute
 * a security boundary. All API endpoints strictly enforce role authorization independently.
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
      className="glass-panel"
      style={{
        margin: '1rem 1.5rem',
        padding: '0.85rem 1.6rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px solid rgba(0, 245, 255, 0.2)',
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 245, 255, 0.06)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        <Link
          to="/dashboard"
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
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(0, 245, 255, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
              border: '1px solid rgba(0, 245, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(0, 245, 255, 0.3)'
            }}
          >
            <ShieldCheck style={{ color: 'var(--neon-cyan)' }} size={22} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                background: 'linear-gradient(90deg, #00f5ff 0%, #a855f7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              LedgerLine
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Double-Entry Mutex
            </div>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: isActive('/dashboard') ? 'var(--neon-cyan)' : 'var(--text-secondary)',
              background: isActive('/dashboard') ? 'rgba(0, 245, 255, 0.1)' : 'transparent',
              border: isActive('/dashboard') ? '1px solid rgba(0, 245, 255, 0.3)' : '1px solid transparent',
              boxShadow: isActive('/dashboard') ? '0 0 15px rgba(0, 245, 255, 0.15)' : 'none',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            <Wallet size={16} /> Accounts
          </Link>

          <Link
            to="/statements"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: isActive('/statements') ? 'var(--neon-cyan)' : 'var(--text-secondary)',
              background: isActive('/statements') ? 'rgba(0, 245, 255, 0.1)' : 'transparent',
              border: isActive('/statements') ? '1px solid rgba(0, 245, 255, 0.3)' : '1px solid transparent',
              boxShadow: isActive('/statements') ? '0 0 15px rgba(0, 245, 255, 0.15)' : 'none',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
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
                color: isActive('/auditor') ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                background: isActive('/auditor') ? 'rgba(0, 245, 255, 0.1)' : 'transparent',
                border: isActive('/auditor') ? '1px solid rgba(0, 245, 255, 0.3)' : '1px solid transparent',
                boxShadow: isActive('/auditor') ? '0 0 15px rgba(0, 245, 255, 0.15)' : 'none',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.88rem',
                fontWeight: 600,
                transition: 'all 0.2s ease'
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
                color: isActive('/admin') ? 'var(--neon-violet)' : 'var(--text-secondary)',
                background: isActive('/admin') ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                border: isActive('/admin') ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
                boxShadow: isActive('/admin') ? '0 0 15px rgba(168, 85, 247, 0.15)' : 'none',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.88rem',
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              <Users size={16} /> Admin Panel
            </Link>
          )}
        </div>
      </div>

      {/* Right Controls & Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* Futuristic Status Beacon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.3rem 0.75rem',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '999px',
            fontSize: '0.72rem',
            color: '#34d399',
            fontWeight: 700,
            letterSpacing: '0.05em'
          }}
        >
          <span className="live-beacon"></span>
          <span>CONSENSUS ACTIVE</span>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.01em' }}>
            {user.email}
          </div>
          <span className={`badge ${user.role === 'ADMIN' ? 'badge-violet' : user.role === 'AUDITOR' ? 'badge-cyan' : 'badge-emerald'}`}>
            {user.role}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          title="Sign out of session"
        >
          <LogOut size={16} />
          <span>Exit</span>
        </button>
      </div>
    </nav>
  );
}
