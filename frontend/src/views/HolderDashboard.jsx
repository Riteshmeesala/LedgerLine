import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR, parseINRToMinorUnits } from '../utils/money';
import { generateIdempotencyKey } from '../utils/idempotency';
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, Send, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

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

  // Live Ledger Tape entries
  const [tapeEntries, setTapeEntries] = useState([]);

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
      // Fetch latest statement entries for the selected or first account
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

  // Poll live tape every 5 seconds
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

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading ledger accounts...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>
            Account Portfolio
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Double-entry accounts settled in minor units (paise).
          </p>
        </div>
        <button onClick={() => openActionModal('CREATE_ACCOUNT')} className="btn btn-primary">
          <Plus size={18} /> Open New Account
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Account Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="glass-panel"
            style={{
              padding: '1.5rem',
              cursor: 'pointer',
              border: selectedAccount?.id === acc.id ? '1px solid var(--neon-cyan)' : '1px solid var(--border-subtle)'
            }}
            onClick={() => setSelectedAccount(acc)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Wallet size={20} style={{ color: 'var(--neon-cyan)' }} />
                <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{acc.name}</span>
              </div>
              <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                {acc.status}
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>AVAILABLE BALANCE</div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatINR(acc.balance)}
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
              ID: <code className="mono">{acc.id}</code>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={(e) => { e.stopPropagation(); openActionModal('DEPOSIT', acc); }}
                disabled={acc.status === 'FROZEN'}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
              >
                <ArrowDownLeft size={14} style={{ color: 'var(--neon-emerald)' }} /> Deposit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openActionModal('WITHDRAW', acc); }}
                disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
              >
                <ArrowUpRight size={14} style={{ color: 'var(--neon-crimson)' }} /> Withdraw
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openActionModal('TRANSFER', acc); }}
                disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
              >
                <Send size={14} style={{ color: 'var(--neon-cyan)' }} /> Transfer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live Ledger Tape */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Clock size={18} style={{ color: 'var(--neon-cyan)' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Live Ledger Tape</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Auto-polling selected account)</span>
          </div>
          <button onClick={fetchTapeEntries} className="btn btn-secondary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {tapeEntries.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No recent ledger entries found on this account.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Seq #</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Timestamp</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Direction</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Amount</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Balance After</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Transfer ID</th>
                </tr>
              </thead>
              <tbody>
                {tapeEntries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                    <td className="mono" style={{ padding: '0.7rem 0.8rem', color: 'var(--text-muted)' }}>#{entry.id}</td>
                    <td style={{ padding: '0.7rem 0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem' }}>
                      <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`}>
                        {entry.direction}
                      </span>
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.7rem 0.8rem', fontWeight: 600, color: entry.amount > 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                      {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.7rem 0.8rem', fontWeight: 500 }}>
                      {formatINR(entry.balanceAfter)}
                    </td>
                    <td className="mono" style={{ padding: '0.7rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {entry.transferId ? `${entry.transferId.slice(0, 8)}...` : '-'}
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
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.4rem' }}>
              {actionType === 'CREATE_ACCOUNT' && 'Open New Account'}
              {actionType === 'DEPOSIT' && `Deposit Funds into ${selectedAccount?.name}`}
              {actionType === 'WITHDRAW' && `Withdraw Funds from ${selectedAccount?.name}`}
              {actionType === 'TRANSFER' && `Transfer Funds from ${selectedAccount?.name}`}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              All money movements execute atomically with double-entry conservation and idempotency protection.
            </p>

            {/* Error Message */}
            {actionError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.2rem', color: '#fca5a5', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Success Confirmation Screen (Shown only after server confirms) */}
            {actionSuccess ? (
              <div>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '8px', padding: '1.2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                  <CheckCircle2 size={36} style={{ color: 'var(--neon-emerald)', margin: '0 auto 0.6rem' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#34d399', marginBottom: '0.3rem' }}>
                    Transaction Confirmed by Server
                  </h3>
                  <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.5rem 0' }}>
                    {formatINR(actionSuccess.amountMinor)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Transfer ID: <code className="mono">{actionSuccess.transferId}</code>
                  </div>
                </div>

                {/* Idempotent Replay Indicator */}
                {actionSuccess.isReplayed && (
                  <div style={{ background: 'rgba(0, 245, 255, 0.1)', border: '1px solid rgba(0, 245, 255, 0.3)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.2rem', display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.82rem', color: 'var(--neon-cyan)' }}>
                    <RefreshCw size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Replayed, no double charge:</strong> The server returned the stored response for this idempotency key without re-debiting.
                    </div>
                  </div>
                )}

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <div>Idempotency-Key:</div>
                  <code className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{actionSuccess.keyUsed}</code>
                </div>

                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    onClick={() => executeAction(actionSuccess.keyUsed)}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    title="Resends request using the exact same Idempotency-Key"
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
                <div style={{ marginBottom: '1.2rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Account Display Name
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Investment Vault, Daily Checking"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="btn btn-primary">
                    {actionLoading ? 'Creating...' : 'Confirm Account'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {actionType === 'TRANSFER' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                      Destination Account UUID
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

                <div style={{ marginBottom: '1.2rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Amount (in Rupees)
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Converted strictly to minor units (paise): <code className="mono">{parseINRToMinorUnits(amountRupees).toString()} paise</code>
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <div>Assigned Intent Idempotency-Key:</div>
                  <code className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{currentIdempotencyKey}</code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button
                    type="button"
                    onClick={() => executeAction()}
                    disabled={actionLoading}
                    className="btn btn-primary"
                  >
                    {actionLoading ? 'Processing...' : `Confirm ${actionType}`}
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
