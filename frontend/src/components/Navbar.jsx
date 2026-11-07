import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogOut, FileText, Activity, Users, Wallet } from 'lucide-react';

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="glass-panel" style={{ margin: '1rem 1.5rem', padding: '0.8rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
          <ShieldCheck style={{ color: 'var(--neon-cyan)' }} size={24} />
          <span style={{ fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #00f5ff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            LedgerLine
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            <Wallet size={16} /> Accounts
          </Link>
          <Link to="/statements" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            <FileText size={16} /> Statements
          </Link>

          {(user.role === 'AUDITOR' || user.role === 'ADMIN') && (
            <Link to="/auditor" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
              <Activity size={16} /> Audit & Integrity
            </Link>
          )}

          {user.role === 'ADMIN' && (
            <Link to="/admin" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
              <Users size={16} /> Admin Panel
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{user.email}</div>
          <span className={`badge ${user.role === 'ADMIN' ? 'badge-violet' : user.role === 'AUDITOR' ? 'badge-cyan' : 'badge-emerald'}`}>
            {user.role}
          </span>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} title="Log out">
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}

