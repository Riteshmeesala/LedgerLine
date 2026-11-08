import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function RegisterView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.detail || err.message || 'Registration failed.');
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
        padding: '1.5rem 1rem',
        position: 'relative'
      }}
    >
      <div className="auth-card">
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
            <UserPlus size={36} />
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
            Create Customer Account
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
            Open a personal double-entry ledger account
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontWeight: 600 }}>
              Role: Account Holder
            </span>
            <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600 }}>
              Encrypted Credentials
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
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
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
              Confirm Password
            </label>
            <input
              type="password"
              required
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type your password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.3rem', fontSize: '0.98rem' }}
          >
            <UserPlus size={18} />
            {loading ? 'Creating Account...' : 'Open Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.8rem', textAlign: 'center', fontSize: '0.9rem', color: '#64748b' }}>
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: 700
            }}
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
