import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogIn, Lock, KeyRound, ShieldAlert, Cpu, CheckCircle } from 'lucide-react';

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
        className="hud-card"
        style={{
          maxWidth: '440px',
          width: '100%',
          padding: '2.5rem 2.2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 35px rgba(0, 245, 255, 0.1)'
        }}
      >
        {/* Terminal Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(0, 245, 255, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
              marginBottom: '1.2rem',
              border: '1px solid rgba(0, 245, 255, 0.35)',
              boxShadow: '0 0 25px rgba(0, 245, 255, 0.25)'
            }}
          >
            <ShieldCheck size={36} style={{ color: 'var(--neon-cyan)' }} />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '0.4rem',
              background: 'linear-gradient(90deg, #f8fafc 0%, #cbd5e1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            LedgerLine Access
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Zero-Loss Double-Entry Financial Engine
          </p>

          {/* Security Features Pills */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(0, 245, 255, 0.08)', border: '1px solid rgba(0, 245, 255, 0.25)', color: 'var(--neon-cyan)', fontWeight: 600 }}>
              256-BIT HMAC
            </span>
            <span style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', color: '#c084fc', fontWeight: 600 }}>
              PESSIMISTIC MUTEX
            </span>
            <span style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399', fontWeight: 600 }}>
              IMMUTABLE TRIGGERS
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '10px',
              padding: '0.9rem 1rem',
              marginBottom: '1.4rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              color: '#fda4af',
              fontSize: '0.88rem',
              boxShadow: '0 0 15px rgba(244, 63, 94, 0.15)'
            }}
          >
            <ShieldAlert size={20} style={{ flexShrink: 0, color: 'var(--neon-crimson)' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.45rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              Account Email
            </label>
            <input
              type="email"
              required
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="holder1@ledgerline.local"
              autoComplete="username"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.45rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              Master Password
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
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.22)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.78rem',
              color: '#fcd34d',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center'
            }}
          >
            <Lock size={14} style={{ flexShrink: 0 }} />
            <span>Anti-Enumeration: 5 consecutive failed attempts lock account for 15 minutes.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.4rem', fontSize: '0.95rem' }}
          >
            <LogIn size={18} />
            {loading ? 'Authenticating...' : 'Authorize Session'}
          </button>
        </form>

        <div style={{ marginTop: '1.8rem', textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Don't have a ledger account?{' '}
          <Link
            to="/register"
            style={{
              color: 'var(--neon-cyan)',
              textDecoration: 'none',
              fontWeight: 700,
              textShadow: '0 0 10px rgba(0, 245, 255, 0.4)'
            }}
          >
            Create Customer Account
          </Link>
        </div>
      </div>
    </div>
  );
}
