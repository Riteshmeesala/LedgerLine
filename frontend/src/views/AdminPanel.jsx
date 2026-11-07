import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  Users, UserPlus, Shield, Snowflake, Sun, AlertTriangle, 
  CheckCircle2, Key, Lock, RefreshCw, Cpu
} from 'lucide-react';

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
      setSuccessMsg(`User ${created.email} successfully provisioned with role ${created.role}.`);
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
      setSuccessMsg(`Account ${accountId.slice(0, 8)}... status updated to ${currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'}.`);
      fetchAccounts();
    } catch (err) {
      setError(err.detail || err.message || 'Failed to update account status.');
    }
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Top Header */}
      <div className="hud-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="live-beacon" />
              <span className="hud-tag violet">ADMINISTRATIVE OPERATIONS CONSOLE</span>
              <span className="hud-tag cyan">ROLE: ROLE_ADMIN</span>
            </div>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              System <span className="glow-text-violet">Administration</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
              Provision enterprise users, assign access roles, and manage high-integrity account freeze controls.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button onClick={fetchAccounts} className="btn btn-secondary">
              <RefreshCw size={16} /> Refresh State
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#fca5a5', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <AlertTriangle size={20} /> <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#34d399', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <CheckCircle2 size={20} /> <span>{successMsg}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {/* Create User Form */}
        <div className="hud-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem' }}>
            <UserPlus size={20} style={{ color: 'var(--neon-violet)' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              Provision New User
            </h2>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
                Email Address
              </label>
              <input
                type="email"
                required
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@ledgerline.local"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
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
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Hashed with BCrypt (12 rounds) before persistence.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
                Assigned Role
              </label>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="HOLDER" style={{ background: '#0a101e' }}>HOLDER (Customer Account & Money Movements)</option>
                <option value="AUDITOR" style={{ background: '#0a101e' }}>AUDITOR (Read-Only Cryptographic Audit Inspection)</option>
                <option value="ADMIN" style={{ background: '#0a101e' }}>ADMIN (Full Administration & Account Control)</option>
              </select>
            </div>

            <button type="submit" disabled={userLoading} className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.8rem' }}>
              <UserPlus size={16} /> {userLoading ? 'Provisioning...' : 'Provision User Credentials'}
            </button>
          </form>
        </div>

        {/* Account Status Administration */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Users size={20} style={{ color: 'var(--neon-cyan)' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Account Status Management
              </h2>
            </div>
            <span className="hud-tag cyan">{accounts.length} Nodes</span>
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
              Loading account registry...
            </div>
          ) : accounts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
              No accounts registered in system.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxHeight: '460px', overflowY: 'auto' }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="stat-tile"
                  style={{
                    padding: '1rem 1.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{acc.name}</div>
                    <div className="tabular-nums glow-text-cyan" style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                      {formatINR(acc.balance)}
                    </div>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      UUID: {acc.id.slice(0, 8)}...{acc.id.slice(-4)}
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
