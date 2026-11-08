import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, LogIn, Lock, ShieldAlert, CheckCircle2, 
  Users, Activity, Wallet, ArrowRight, Sparkles, Key
} from 'lucide-react';

// Live Seeded Stakeholders
const DEMO_PERSONAS = [
  {
    role: 'ADMIN',
    name: 'System Operator (Admin)',
    tag: 'Operator',
    desc: 'User provisioning & account freeze/unfreeze controls',
    email: 'admin@ledgerline.local',
    password: 'vy92gTVe8SwXZkKHXhd8',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    badge: 'badge-violet',
    target: '/admin',
    icon: Users
  },
  {
    role: 'AUDITOR',
    name: 'Compliance Inspector (Auditor)',
    tag: 'Inspector',
    desc: 'SHA-256 hash visualizer & zero-sum conservation audit',
    email: 'auditor@ledgerline.local',
    password: 'rrEqyGnA3bkCakTbc%x7',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    badge: 'badge-cyan',
    target: '/auditor',
    icon: Activity
  },
  {
    role: 'HOLDER',
    name: 'Account Holder (Customer)',
    tag: 'Customer',
    desc: 'Digital card, deposits, withdrawals & P2P transfers',
    email: 'holder1@ledgerline.local',
    password: 'hG#5b!hL6!md9N-8e9YP',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    badge: 'badge-emerald',
    target: '/dashboard',
    icon: Wallet
  }
];

export default function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activePersonaRole, setActivePersonaRole] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (loginEmail, loginPass, targetPath = null) => {
    setError(null);
    setLoading(true);

    try {
      const res = await login(loginEmail, loginPass);
      if (targetPath) {
        navigate(targetPath);
      } else if (res.role === 'AUDITOR') {
        navigate('/auditor');
      } else if (res.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.detail || err.message || 'Login failed.');
    } finally {
      setLoading(false);
      setActivePersonaRole(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLoginSubmit(email, password);
  };

  const handlePersonaClick = (persona) => {
    setEmail(persona.email);
    setPassword(persona.password);
    setActivePersonaRole(persona.role);
    handleLoginSubmit(persona.email, persona.password, persona.target);
  };

  return (
    <div
      style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem 1rem',
        position: 'relative'
      }}
    >
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '0.8rem',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              marginBottom: '0.75rem',
              color: '#2563eb',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.12)'
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h1
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '0.25rem',
              color: '#0f172a'
            }}
          >
            Sign In to LedgerLine
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>
            High-integrity double-entry ledger platform
          </p>
        </div>

        {/* 1-CLICK STAKEHOLDER DEMO SELECTOR */}
        <div style={{ marginBottom: '1.6rem', background: '#f8fafc', padding: '1rem', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Sparkles size={16} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Instant 1-Click Role Logins
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {DEMO_PERSONAS.map((p) => {
              const IconComp = p.icon;
              const isSelected = activePersonaRole === p.role;
              return (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => handlePersonaClick(p)}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    border: `1px solid ${p.border}`,
                    background: p.bg,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)' }}>
                      <IconComp size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{p.name}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {p.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ color: p.color, display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem', fontWeight: 700 }}>
                    <span>{isSelected ? 'Loading...' : 'Sign In'}</span>
                    <ArrowRight size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.4rem' }}>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
            Or Enter Credentials Manually
          </span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>

        {error && (
          <div
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              padding: '0.8rem 1rem',
              marginBottom: '1.2rem',
              display: 'flex',
              gap: '0.7rem',
              alignItems: 'center',
              color: '#be123c',
              fontSize: '0.86rem'
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                color: '#334155',
                marginBottom: '0.35rem',
                fontWeight: 600
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              required
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. holder1@ledgerline.local"
              autoComplete="username"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                color: '#334155',
                marginBottom: '0.35rem',
                fontWeight: 600
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.8rem',
              fontSize: '0.92rem',
              fontWeight: 700,
              marginTop: '0.2rem'
            }}
          >
            {loading ? 'Authenticating...' : 'Log In to LedgerLine'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.4rem', fontSize: '0.84rem', color: '#64748b' }}>
          Don't have an account?{' '}
          <Link
            to="/register"
            style={{
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: 700
            }}
          >
            Create Customer Account
          </Link>
        </div>
      </div>
    </div>
  );
}
