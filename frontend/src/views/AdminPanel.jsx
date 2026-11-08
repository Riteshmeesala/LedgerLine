import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  Users, UserPlus, Shield, Snowflake, Sun, AlertTriangle, 
  CheckCircle2, Key, Lock, RefreshCw
} from 'lucide-react';

/**
 * Admin Panel View.
 *
 * Administrative user provisioning and account freeze/unfreeze controls restricted to ROLE_ADMIN.
 */
export default function AdminPanel() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // New User Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('HOLDER');
  const [userLoading, setUserLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      const data = await apiClient('/api/accounts');
      setAccounts(data);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setUserLoading(true);

    try {
      const created = await apiClient('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, role })
      });
      setSuccessMsg(`User ${created.email} successfully created with role ${created.role}.`);
      setEmail('');
      setPassword('');
      setRole('HOLDER');
    } catch (err) {
      setError(err.detail || err.message || 'Failed to create user.');
    } finally {
      setUserLoading(false);
    }
  };

  const handleToggleFreeze = async (accountId, currentStatus) => {
    setError(null);
    setSuccessMsg(null);
    const endpoint = currentStatus === 'ACTIVE'
      ? `/api/admin/accounts/${accountId}/freeze`
      : `/api/admin/accounts/${accountId}/unfreeze`;

    try {
      await apiClient(endpoint, { method: 'POST' });
      setSuccessMsg(`Account status updated to ${currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'}.`);
      fetchAccounts();
    } catch (err) {
      setError(err.detail || err.message || 'Failed to update account status.');
    }
  };

  return (
    <div className="view-container">
      {/* Top Header */}
      <div className="hud-card" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span className="live-beacon" />
              <span className="hud-tag violet">Administration</span>
              <span className="hud-tag cyan">Role: Admin</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#0f172a' }}>
              System <span className="glow-text-violet">Administration</span>
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: '0.3rem' }}>
              Create system users, manage access roles, and monitor or freeze customer accounts.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button onClick={fetchAccounts} className="btn btn-secondary">
              <RefreshCw size={16} /> Refresh Accounts
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#dc2626', display: 'flex', gap: '0.8rem', alignItems: 'center', fontWeight: 500 }}>
          <AlertTriangle size={20} /> <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#166534', display: 'flex', gap: '0.8rem', alignItems: 'center', fontWeight: 500 }}>
          <CheckCircle2 size={20} /> <span>{successMsg}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Create User Form */}
        <div className="hud-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem' }}>
            <UserPlus size={20} style={{ color: 'var(--brand-primary)' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Create New User
            </h2>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '0.4rem', fontWeight: 600 }}>
                Email Address
              </label>
              <input
                type="email"
                required
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '0.4rem', fontWeight: 600 }}>
                Temporary Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                Securely encrypted with industry-standard BCrypt before saving.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '0.4rem', fontWeight: 600 }}>
                Permission Role
              </label>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="HOLDER">Customer (Banking, deposits & transfers)</option>
                <option value="AUDITOR">Auditor (Read-only ledger & integrity logs)</option>
                <option value="ADMIN">Administrator (Full system management)</option>
              </select>
            </div>

            <button type="submit" disabled={userLoading} className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.8rem' }}>
              <UserPlus size={16} /> {userLoading ? 'Creating User...' : 'Create User'}
            </button>
          </form>
        </div>

        {/* Account Status Administration */}
        <div className="hud-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Users size={20} style={{ color: 'var(--brand-primary)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Account Controls
              </h2>
            </div>
            <span className="hud-tag cyan">{accounts.length} Accounts</span>
          </div>

          {loading ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>
              No accounts registered yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxHeight: '460px', overflowY: 'auto' }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="stat-tile"
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: '#ffffff'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{acc.name}</div>
                    <div className="tabular-nums glow-text-cyan" style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                      {formatINR(acc.balance)}
                    </div>
                    <div className="mono" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      ID: {acc.id.slice(0, 8)}...{acc.id.slice(-4)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                      {acc.status}
                    </span>
                    {acc.type === 'CUSTOMER' && (
                      <button
                        onClick={() => handleToggleFreeze(acc.id, acc.status)}
                        className={`btn ${acc.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                      >
                        {acc.status === 'ACTIVE' ? (
                          <><Snowflake size={14} /> Freeze</>
                        ) : (
                          <><Sun size={14} /> Unfreeze</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
