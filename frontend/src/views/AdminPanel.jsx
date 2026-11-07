import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { Users, UserPlus, Shield, Snowflake, Sun, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Admin Panel View.
 *
 * SECURITY NOTE:
 * Administrative user provisioning and account freeze/unfreeze actions are restricted to ROLE_ADMIN.
 * The client hides this view from non-admin users as a UX affordance, but security is enforced
 * by the server via `@PreAuthorize("hasRole('ADMIN')")` on all `/api/admin/**` endpoints.
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
      setSuccessMsg(`User ${created.email} provisioned with role ${created.role}.`);
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
      setSuccessMsg(`Account ${accountId.slice(0, 8)}... status updated.`);
      fetchAccounts();
    } catch (err) {
      setError(err.detail || err.message || 'Failed to update account status.');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--neon-violet)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
          <Shield size={16} /> Administrative Operations
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>
          System Administration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Provision organizational users and manage account status.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', color: '#fca5a5', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <AlertTriangle size={18} /> <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', color: '#34d399', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <CheckCircle2 size={18} /> <span>{successMsg}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* Create User Form */}
        <div className="glass-panel" style={{ padding: '1.8rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={18} style={{ color: 'var(--neon-violet)' }} />
            Provision New User
          </h2>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                Email Address
              </label>
              <input
                type="email"
                required
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="auditor@ledgerline.local"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                Initial Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                System Role
              </label>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="HOLDER" style={{ background: '#0f172a' }}>HOLDER (Customer Account)</option>
                <option value="AUDITOR" style={{ background: '#0f172a' }}>AUDITOR (Read-Only Inspection)</option>
                <option value="ADMIN" style={{ background: '#0f172a' }}>ADMIN (Full Administration)</option>
              </select>
            </div>

            <button type="submit" disabled={userLoading} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              <UserPlus size={16} /> {userLoading ? 'Provisioning...' : 'Provision User'}
            </button>
          </form>
        </div>

        {/* Account Status Administration */}
        <div className="glass-panel" style={{ padding: '1.8rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} style={{ color: 'var(--neon-cyan)' }} />
            Account Status Management
          </h2>

          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No accounts registered.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '420px', overflowY: 'auto' }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '0.8rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</div>
                    <div className="tabular-nums" style={{ fontSize: '0.85rem', color: 'var(--neon-cyan)' }}>{formatINR(acc.balance)}</div>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{acc.id}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                      {acc.status}
                    </span>
                    {acc.type === 'CUSTOMER' && (
                      <button
                        onClick={() => handleToggleFreeze(acc.id, acc.status)}
                        className={`btn ${acc.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
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
