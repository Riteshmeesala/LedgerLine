import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  Users, UserPlus, Shield, Snowflake, Sun, AlertTriangle, 
  CheckCircle2, Key, Lock, RefreshCw, Search, Copy, Check,
  Activity, ShieldCheck, Wallet, Database, X
} from 'lucide-react';

/**
 * Admin Panel View.
 *
 * Administrative user provisioning, portfolio oversight, and account freeze/unfreeze controls restricted to ROLE_ADMIN.
 */
export default function AdminPanel() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  // Feature 4: Freeze/Unfreeze Reason Modal State
  const [freezeModal, setFreezeModal] = useState({
    open: false,
    accountId: null,
    currentStatus: null,
    accountName: '',
    reason: '',
    loading: false,
    error: null
  });

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

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

  const handleOpenFreezeModal = (acc) => {
    setFreezeModal({
      open: true,
      accountId: acc.id,
      currentStatus: acc.status,
      accountName: acc.name,
      reason: '',
      loading: false,
      error: null
    });
  };

  const handleConfirmFreeze = async (e) => {
    if (e) e.preventDefault();
    const trimmedReason = freezeModal.reason.trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 200) {
      setFreezeModal(prev => ({ ...prev, error: 'Reason must be between 3 and 200 characters.' }));
      return;
    }

    setFreezeModal(prev => ({ ...prev, loading: true, error: null }));
    const endpoint = freezeModal.currentStatus === 'ACTIVE'
      ? `/api/admin/accounts/${freezeModal.accountId}/freeze`
      : `/api/admin/accounts/${freezeModal.accountId}/unfreeze`;

    try {
      await apiClient(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reason: trimmedReason })
      });
      const newStatus = freezeModal.currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
      setSuccessMsg(`Account status updated to ${newStatus}. Reason recorded in audit log.`);
      setFreezeModal({ open: false, accountId: null, currentStatus: null, accountName: '', reason: '', loading: false, error: null });
      fetchAccounts();
    } catch (err) {
      setFreezeModal(prev => ({
        ...prev,
        loading: false,
        error: err.detail || err.message || 'Failed to update account status.'
      }));
    }
  };

  // Metrics
  const activeCount = accounts.filter(a => a.status === 'ACTIVE').length;
  const frozenCount = accounts.filter(a => a.status === 'FROZEN').length;
  const customerFloat = accounts
    .filter(a => a.type === 'CUSTOMER' && a.balance > 0)
    .reduce((sum, a) => sum + a.balance, 0);

  // Filtered accounts
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          acc.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = statusFilter === 'ALL' || acc.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="view-container">
      {/* Top Header */}
      <div className="glass-panel" style={{ marginBottom: '1.8rem', padding: '1.8rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="live-beacon" />
              <span className="hud-tag violet">System Operator</span>
              <span className="hud-tag emerald">Governance Active</span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              System Operator Governance Console
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: '0.2rem' }}>
              Provision verified identities, monitor platform accounts, and execute emergency asset freeze controls.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button onClick={fetchAccounts} className="btn btn-secondary">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>

        {/* System Summary KPI Tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid #f1f5f9' }}>
          <div className="stat-tile" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <span>Total Accounts</span>
              <Users size={16} style={{ color: '#7c3aed' }} />
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
              {accounts.length}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '0.2rem', fontWeight: 600 }}>
              {activeCount} Active • {frozenCount} Frozen
            </div>
          </div>

          <div className="stat-tile" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <span>Customer Liquidity</span>
              <Wallet size={16} style={{ color: '#059669' }} />
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {formatINR(customerFloat)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              Backed 1:1 by CASH_IN_OUT node
            </div>
          </div>

          <div className="stat-tile" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <span>Safety Controls</span>
              <ShieldCheck size={16} style={{ color: '#2563eb' }} />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e40af', marginTop: '0.5rem' }}>
              Zero-Loss Enforced
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              Idempotent mutexes active
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '0.85rem 1.1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{error}</span>
          </div>
          <button
            onClick={() => { setError(null); fetchAccounts(); }}
            className="btn btn-secondary btn-sm"
            style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#ffffff', padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.8rem', color: '#166534', display: 'flex', gap: '0.8rem', alignItems: 'center', fontWeight: 500 }}>
          <CheckCircle2 size={20} /> <span>{successMsg}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Create User Form */}
        <div className="glass-panel" style={{ padding: '1.8rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
              <UserPlus size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Provision New Stakeholder
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Create customer, auditor, or operator accounts
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', marginBottom: '0.35rem', fontWeight: 600 }}>
                Email Address
              </label>
              <input
                type="email"
                required
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="newuser@ledgerline.local"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', marginBottom: '0.35rem', fontWeight: 600 }}>
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
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.3rem' }}>
                Encrypted with BCrypt (10 rounds) before persistence.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', marginBottom: '0.35rem', fontWeight: 600 }}>
                Stakeholder Persona & Access Role
              </label>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="HOLDER">Customer (Banking, deposits, withdrawals & P2P)</option>
                <option value="AUDITOR">Compliance Inspector (Read-only SHA-256 chain)</option>
                <option value="ADMIN">System Operator (Account governance & freezing)</option>
              </select>
            </div>

            <button type="submit" disabled={userLoading} className="btn btn-primary" style={{ marginTop: '0.4rem', padding: '0.75rem' }}>
              <UserPlus size={16} /> {userLoading ? 'Provisioning...' : 'Provision Account'}
            </button>
          </form>
        </div>

        {/* Account Status Administration */}
        <div className="glass-panel" style={{ padding: '1.8rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <Users size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  Account Controls
                </h2>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Emergency freeze/unfreeze switches
                </span>
              </div>
            </div>
            <span className="badge badge-cyan">{filteredAccounts.length} / {accounts.length}</span>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search account name or ID..."
                className="form-input"
                style={{ paddingLeft: '2.2rem', fontSize: '0.82rem', padding: '0.5rem 0.5rem 0.5rem 2.2rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="form-input"
              style={{ width: 'auto', fontSize: '0.82rem', padding: '0.5rem 0.75rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="FROZEN">Frozen Only</option>
            </select>
          </div>

          {loading ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>
              Loading accounts...
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '10px' }}>
              No matching accounts found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="stat-tile"
                  style={{
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.8rem',
                    flexWrap: 'wrap',
                    background: acc.status === 'FROZEN' ? '#fff1f2' : '#ffffff',
                    border: acc.status === 'FROZEN' ? '1px solid #fecdd3' : '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ minWidth: '180px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{acc.name}</span>
                      <span className={`badge ${acc.type === 'SYSTEM' ? 'badge-violet' : 'badge-emerald'}`} style={{ fontSize: '0.65rem' }}>
                        {acc.type}
                      </span>
                    </div>
                    <div className="tabular-nums" style={{ fontSize: '1.08rem', fontWeight: 800, color: acc.balance < 0 ? '#64748b' : '#059669', marginTop: '0.15rem' }}>
                      {formatINR(acc.balance)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <code className="mono" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {acc.id.slice(0, 8)}...{acc.id.slice(-4)}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyId(acc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === acc.id ? '#059669' : '#94a3b8', padding: '0' }}
                        title="Copy full UUID"
                      >
                        {copiedId === acc.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                      {acc.status}
                    </span>
                    {acc.type === 'CUSTOMER' && (
                      <button
                        onClick={() => handleOpenFreezeModal(acc)}
                        className={`btn ${acc.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      >
                        {acc.status === 'ACTIVE' ? (
                          <><Snowflake size={13} /> Freeze</>
                        ) : (
                          <><Sun size={13} /> Unfreeze</>
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

      {/* Feature 4: Reason Mandated Freeze/Unfreeze Modal */}
      {freezeModal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {freezeModal.currentStatus === 'ACTIVE' ? (
                  <Snowflake size={20} style={{ color: '#e11d48' }} />
                ) : (
                  <Sun size={20} style={{ color: '#059669' }} />
                )}
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {freezeModal.currentStatus === 'ACTIVE' ? 'Freeze Account' : 'Unfreeze Account'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFreezeModal({ open: false, accountId: null, currentStatus: null, accountName: '', reason: '', loading: false, error: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
              Administrative policy requires a justification reason (3 to 200 characters) which will be cryptographically chained to the audit trail.
            </p>

            {freezeModal.error && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '0.65rem 0.85rem', color: '#be123c', fontSize: '0.82rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{freezeModal.error}</span>
              </div>
            )}

            <form onSubmit={handleConfirmFreeze}>
              <div style={{ marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                    Reason / Justification
                  </label>
                  <span style={{ fontSize: '0.74rem', color: freezeModal.reason.trim().length < 3 || freezeModal.reason.length > 200 ? '#ef4444' : '#64748b' }}>
                    {freezeModal.reason.length}/200 chars (min 3)
                  </span>
                </div>
                <textarea
                  required
                  rows={3}
                  value={freezeModal.reason}
                  onChange={(e) => setFreezeModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={freezeModal.currentStatus === 'ACTIVE' 
                    ? "e.g., Suspected fraudulent activity reported by risk engine..." 
                    : "e.g., Compliance KYC review completed and cleared..."}
                  className="input-field"
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', padding: '0.65rem 0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setFreezeModal({ open: false, accountId: null, currentStatus: null, accountName: '', reason: '', loading: false, error: null })}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={freezeModal.loading || freezeModal.reason.trim().length < 3 || freezeModal.reason.length > 200}
                  className={`btn ${freezeModal.currentStatus === 'ACTIVE' ? 'btn-danger' : 'btn-primary'}`}
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  {freezeModal.loading ? 'Updating...' : `Confirm ${freezeModal.currentStatus === 'ACTIVE' ? 'Freeze' : 'Unfreeze'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
