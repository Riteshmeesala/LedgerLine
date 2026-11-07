import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogIn, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.detail || err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        position: 'relative'
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '440px',
          width: '100%',
          padding: '2.5rem 2.2rem',
          boxShadow: 'var(--shadow-xl)',
          background: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '0.9rem',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              marginBottom: '1rem',
              color: '#2563eb',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.12)'
            }}
          >
            <ShieldCheck size={36} />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '0.35rem',
              color: '#0f172a'
            }}
          >
            Welcome to LedgerLine
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
            High-integrity double-entry financial platform
          </p>

          {/* Trust Badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontWeight: 600 }}>
              Zero-Loss Accounting
            </span>
            <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600 }}>
              Duplicate-Proof Replay
            </span>
            <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', fontWeight: 600 }}>
              Audit-Chained Trail
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              marginBottom: '1.4rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              color: '#be123c',
              fontSize: '0.88rem'
            }}
          >
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.84rem',
                color: '#334155',
                marginBottom: '0.4rem',
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
              placeholder="e.g. yourname@example.com"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.84rem',
                color: '#334155',
                marginBottom: '0.4rem',
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

          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.78rem',
              color: '#b45309',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center'
            }}
          >
            <Lock size={15} style={{ flexShrink: 0 }} />
            <span>Account Security: 5 failed attempts locks login for 15 minutes.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.3rem', fontSize: '0.98rem' }}
          >
            <LogIn size={18} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.8rem', textAlign: 'center', fontSize: '0.9rem', color: '#64748b' }}>
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
