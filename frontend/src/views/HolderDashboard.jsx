import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR, parseINRToMinorUnits } from '../utils/money';
import { generateIdempotencyKey } from '../utils/idempotency';
import { 
  Wallet, Plus, ArrowUpRight, ArrowDownLeft, Send, RefreshCw, 
  CheckCircle2, AlertTriangle, Clock, Copy, Check, ShieldCheck
} from 'lucide-react';

export default function HolderDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [actionType, setActionType] = useState(null); // 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'CREATE_ACCOUNT'
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [accountName, setAccountName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Idempotency State per Intent
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Live Activity entries
  const [tapeEntries, setTapeEntries] = useState([]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchAccounts = async () => {
    try {
      const data = await apiClient('/api/accounts');
      setAccounts(data);
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(data[0]);
      }
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTapeEntries = async () => {
    if (accounts.length === 0) return;
    try {
      const accId = selectedAccount ? selectedAccount.id : accounts[0].id;
      const statement = await apiClient(`/api/accounts/${accId}/statement?page=0&size=10`);
      setTapeEntries(statement.entries || []);
    } catch (e) {
      // Ignore background ticker errors
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Auto-refresh activity every 5 seconds
  useEffect(() => {
    fetchTapeEntries();
    const interval = setInterval(fetchTapeEntries, 5000);
    return () => clearInterval(interval);
  }, [accounts, selectedAccount]);

  const openActionModal = (type, acc) => {
    setActionType(type);
    setSelectedAccount(acc || accounts[0]);
    setAmountRupees('');
    setTargetAccountId('');
    setAccountName('');
    setActionError(null);
    setActionSuccess(null);
    // Generate an Idempotency-Key ONCE per intent
    setCurrentIdempotencyKey(generateIdempotencyKey());
  };

  const closeModal = () => {
    setActionType(null);
    setActionError(null);
    setActionSuccess(null);
    fetchAccounts();
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: accountName.trim() || 'Savings Account' })
      });
      closeModal();
      fetchAccounts();
    } catch (err) {
      setActionError(err.detail || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const executeAction = async (retryKey = null) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    const keyToUse = retryKey || currentIdempotencyKey;
    const amountMinor = parseINRToMinorUnits(amountRupees);

    if (amountMinor <= 0n) {
      setActionError('Amount must be greater than zero.');
      setActionLoading(false);
      return;
    }

    try {
      let result;
      if (actionType === 'DEPOSIT') {
        result = await apiClient(`/api/accounts/${selectedAccount.id}/deposits`, {
          method: 'POST',
          headers: { 'Idempotency-Key': keyToUse },
          body: JSON.stringify({ amountMinor: Number(amountMinor) })
        });
      } else if (actionType === 'WITHDRAW') {
        result = await apiClient(`/api/accounts/${selectedAccount.id}/withdrawals`, {
          method: 'POST',
          headers: { 'Idempotency-Key': keyToUse },
          body: JSON.stringify({ amountMinor: Number(amountMinor) })
        });
      } else if (actionType === 'TRANSFER') {
        if (!targetAccountId) {
          setActionError('Please specify destination account ID.');
          setActionLoading(false);
          return;
        }
        result = await apiClient('/api/transfers', {
          method: 'POST',
          headers: { 'Idempotency-Key': keyToUse },
          body: JSON.stringify({
            fromAccountId: selectedAccount.id,
            toAccountId: targetAccountId.trim(),
            amountMinor: Number(amountMinor)
          })
        });
      }

      // Display success only after the server confirms
      setActionSuccess({
        transferId: result.id,
        amountMinor: result.amountMinor,
        isReplayed: result.isReplayed || false,
        keyUsed: keyToUse
      });

      fetchAccounts();
      fetchTapeEntries();
    } catch (err) {
      setActionError(err.detail || err.message || 'Operation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Compute total balance across accounts
  const totalBalance = accounts.reduce((acc, curr) => acc + (BigInt(curr.balance) || 0n), 0n);

  if (loading) {
    return (
      <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8rem', color: '#2563eb' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite' }} />
          <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>Loading your accounts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      {/* Hero Overview Card */}
      <div
        className="glass-panel"
        style={{
          marginBottom: '2rem',
          padding: '2rem',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.2rem', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="live-beacon" />
              <span className="hud-tag emerald">Verified & Protected</span>
              <span className="hud-tag cyan">Real-Time Sync</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              Account Portfolio
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: '0.2rem' }}>
              All transactions are settled instantly with double-entry precision and duplicate-charge protection.
            </p>
          </div>

          <button onClick={() => openActionModal('CREATE_ACCOUNT')} className="btn btn-primary" style={{ flexShrink: 0 }}>
            <Plus size={18} /> Open New Account
          </button>
        </div>

        {/* Portfolio Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', paddingTop: '1.2rem', borderTop: '1px solid #f1f5f9' }}>
          <div className="stat-tile">
            <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Total Portfolio Balance
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.9rem', fontWeight: 800, color: '#2563eb' }}>
              {formatINR(totalBalance)}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem' }}>
              Exact minor units: <code className="mono">{totalBalance.toString()} paise</code>
            </div>
          </div>

          <div className="stat-tile">
            <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Active Accounts
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a' }}>
              {accounts.length} <span style={{ fontSize: '1rem', color: '#059669', fontWeight: 600 }}>Active</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem' }}>
              Selected: <strong style={{ color: '#0f172a' }}>{selectedAccount ? selectedAccount.name : 'None'}</strong>
            </div>
          </div>

          <div className="stat-tile">
            <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Safety Guarantee
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#059669', marginTop: '0.2rem' }}>
              Zero-Loss Protected
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.4rem' }}>
              Automated lock ordering prevents race conditions
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.8rem', color: '#be123c', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Account Cards Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Wallet size={20} style={{ color: '#2563eb' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
            My Accounts ({accounts.length})
          </h2>
        </div>
        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
          Select an account to view transactions
        </span>
      </div>

      {/* Account Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {accounts.map((acc) => {
          const isSelected = selectedAccount?.id === acc.id;
          return (
            <div
              key={acc.id}
              className="glass-panel"
              style={{
                padding: '1.4rem',
                cursor: 'pointer',
                border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: '#ffffff',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)'
              }}
              onClick={() => setSelectedAccount(acc)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: isSelected ? '#eff6ff' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: isSelected ? '1px solid #bfdbfe' : '1px solid #e2e8f0', color: isSelected ? '#2563eb' : '#64748b' }}>
                    <Wallet size={18} />
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', display: 'block' }}>{acc.name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{acc.type} ACCOUNT</span>
                  </div>
                </div>

                <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                  {acc.status}
                </span>
              </div>

              {/* Balance Display */}
              <div style={{ marginBottom: '1rem', padding: '0.9rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                  Available Balance
                </div>
                <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
                  {formatINR(acc.balance)}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#2563eb', marginTop: '0.2rem' }}>
                  Raw balance: <code className="mono">{acc.balance} paise</code>
                </div>
              </div>

              {/* Account ID with copy */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748b', marginBottom: '1rem', background: '#f1f5f9', padding: '0.45rem 0.65rem', borderRadius: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>ID: {acc.id.slice(0, 8)}...{acc.id.slice(-4)}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(acc.id, acc.id); }}
                  style={{ background: 'transparent', border: 'none', color: copiedId === acc.id ? '#059669' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 600 }}
                  title="Copy account ID"
                >
                  {copiedId === acc.id ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy ID</>}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('DEPOSIT', acc); }}
                  disabled={acc.status === 'FROZEN'}
                  className="btn btn-secondary"
                  style={{ flex: '1 1 80px', padding: '0.5rem 0.35rem', fontSize: '0.82rem', justifyContent: 'center' }}
                >
                  <ArrowDownLeft size={14} style={{ color: '#059669' }} /> Deposit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('WITHDRAW', acc); }}
                  disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                  className="btn btn-secondary"
                  style={{ flex: '1 1 80px', padding: '0.5rem 0.35rem', fontSize: '0.82rem', justifyContent: 'center' }}
                >
                  <ArrowUpRight size={14} style={{ color: '#e11d48' }} /> Withdraw
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('TRANSFER', acc); }}
                  disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                  className="btn btn-primary"
                  style={{ flex: '1 1 80px', padding: '0.5rem 0.35rem', fontSize: '0.82rem', justifyContent: 'center' }}
                >
                  <Send size={14} /> Transfer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity Section */}
      <div className="glass-panel" style={{ padding: '1.8rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Clock size={20} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Recent Account Activity
            </h2>
            <span className="hud-tag cyan">Auto-Updated</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>
              Showing: <strong style={{ color: '#0f172a' }}>{selectedAccount ? selectedAccount.name : 'All Accounts'}</strong>
            </span>
            <button onClick={fetchTapeEntries} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {tapeEntries.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.95rem', background: '#f8fafc', borderRadius: '12px' }}>
            No recent activity recorded for this account.
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.8rem 1rem' }}>Entry #</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Time</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Balance After</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Reference ID</th>
                </tr>
              </thead>
              <tbody>
                {tapeEntries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="mono" style={{ padding: '0.85rem 1rem', color: '#2563eb', fontWeight: 600 }}>
                      #{entry.id}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#475569', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`}>
                        {entry.direction === 'CREDIT' ? '+ Deposit / Credit' : '- Withdrawal / Debit'}
                      </span>
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.95rem', color: entry.amount > 0 ? '#059669' : '#e11d48' }}>
                      {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {formatINR(entry.balanceAfter)}
                    </td>
                    <td className="mono" style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.78rem' }}>
                      {entry.transferId ? `${entry.transferId.slice(0, 8)}...${entry.transferId.slice(-4)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Dialog Modal */}
      {actionType && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                {actionType === 'CREATE_ACCOUNT' && 'Open New Account'}
                {actionType === 'DEPOSIT' && `Deposit Money to ${selectedAccount?.name}`}
                {actionType === 'WITHDRAW' && `Withdraw Money from ${selectedAccount?.name}`}
                {actionType === 'TRANSFER' && `Send Money from ${selectedAccount?.name}`}
              </h2>
            </div>

            <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
              Transactions execute instantly with dual-entry verification and duplicate-charge protection.
            </p>

            {/* Error Message */}
            {actionError && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.4rem', color: '#be123c', fontSize: '0.88rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Success Confirmation Screen */}
            {actionSuccess ? (
              <div>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '1.6rem', marginBottom: '1.4rem', textAlign: 'center' }}>
                  <CheckCircle2 size={42} style={{ color: '#059669', margin: '0 auto 0.6rem' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#065f46', marginBottom: '0.2rem' }}>
                    Transaction Successful!
                  </h3>
                  <div className="tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: '#047857', margin: '0.5rem 0' }}>
                    {formatINR(actionSuccess.amountMinor)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', background: '#ffffff', padding: '0.4rem 0.8rem', borderRadius: '6px', display: 'inline-block', border: '1px solid #e2e8f0' }}>
                    Reference ID: <code className="mono">{actionSuccess.transferId}</code>
                  </div>
                </div>

                {/* Idempotent Replay Indicator */}
                {actionSuccess.isReplayed && (
                  <div className="badge-replay" style={{ padding: '0.9rem', borderRadius: '10px', marginBottom: '1.4rem', display: 'flex', gap: '0.7rem', alignItems: 'center', fontSize: '0.86rem' }}>
                    <RefreshCw size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Protected from double-charge:</strong> The server recognized this request and returned the saved confirmation without charging again.
                    </div>
                  </div>
                )}

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.5rem', fontSize: '0.78rem' }}>
                  <div style={{ color: '#64748b', marginBottom: '0.2rem' }}>Idempotency Protection Key:</div>
                  <code className="mono" style={{ color: '#2563eb', wordBreak: 'break-all' }}>{actionSuccess.keyUsed}</code>
                </div>

                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    onClick={() => executeAction(actionSuccess.keyUsed)}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    title="Resends request with the exact same Idempotency Key"
                  >
                    <RefreshCw size={16} /> Retry same request
                  </button>
                  <button onClick={closeModal} className="btn btn-primary" style={{ flex: 1 }}>
                    Done
                  </button>
                </div>
              </div>
            ) : actionType === 'CREATE_ACCOUNT' ? (
              <form onSubmit={handleCreateAccount}>
                <div style={{ marginBottom: '1.4rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: 600 }}>
                    Account Name
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Savings Vault, Emergency Fund"
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="btn btn-primary">
                    {actionLoading ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {actionType === 'TRANSFER' && (
                  <div style={{ marginBottom: '1.2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: 600 }}>
                      Destination Account ID
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input mono"
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      placeholder="e.g. c0000000-0000-0000-0000-000000000002"
                    />
                  </div>
                )}

                <div style={{ marginBottom: '1.4rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: 600 }}>
                    Amount (in ₹ Rupees)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="form-input tabular-nums"
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.45rem' }}>
                    <span className="hud-tag emerald">
                      Exact paise: {parseINRToMinorUnits(amountRupees).toString()}
                    </span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.5rem', fontSize: '0.78rem' }}>
                  <div style={{ color: '#64748b', marginBottom: '0.2rem' }}>Duplicate Protection Key:</div>
                  <code className="mono" style={{ color: '#2563eb', wordBreak: 'break-all' }}>{currentIdempotencyKey}</code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button
                    type="button"
                    onClick={() => executeAction()}
                    disabled={actionLoading}
                    className="btn btn-primary"
                  >
                    {actionLoading ? 'Processing...' : `Confirm ${actionType === 'TRANSFER' ? 'Transfer' : actionType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
