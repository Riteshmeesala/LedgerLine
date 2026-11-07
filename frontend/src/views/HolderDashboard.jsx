import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR, parseINRToMinorUnits } from '../utils/money';
import { generateIdempotencyKey } from '../utils/idempotency';
import { 
  Wallet, Plus, ArrowUpRight, ArrowDownLeft, Send, RefreshCw, 
  CheckCircle2, AlertTriangle, Clock, ShieldCheck, Copy, Check,
  Cpu, Sparkles, TrendingUp
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

  // Live Ledger Tape entries
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

  // Compute total liquidity across active accounts
  const totalBalance = accounts.reduce((acc, curr) => acc + (BigInt(curr.balance) || 0n), 0n);

  if (loading) {
    return (
      <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8rem', color: 'var(--neon-cyan)' }}>
          <RefreshCw size={24} className="spin-animation" style={{ animation: 'spin 1.5s linear infinite' }} />
          <span style={{ fontSize: '1.1rem', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
            INITIALIZING LEDGER ENGINE...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Top Futuristic Hero HUD Card */}
      <div className="hud-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.8rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">SYSTEM ONLINE // NODE: IN-MUM-1</span>
              <span className="hud-tag emerald">STRICT DOUBLE-ENTRY (PAISE)</span>
            </div>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Account <span className="glow-text-cyan">Portfolio</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
              Pessimistic-mutex protected ledger accounts settled in minor units with cryptographic idempotency.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button onClick={() => openActionModal('CREATE_ACCOUNT')} className="btn btn-primary">
              <Plus size={18} /> Open New Account
            </button>
          </div>
        </div>

        {/* Portfolio Stats Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="stat-tile">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>
              TOTAL PORTFOLIO LIQUIDITY
            </div>
            <div className="tabular-nums glow-text-cyan" style={{ fontSize: '1.9rem', fontWeight: 800 }}>
              {formatINR(totalBalance)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Raw minor units: <code className="mono">{totalBalance.toString()} paise</code>
            </div>
          </div>

          <div className="stat-tile">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>
              MANAGED ACCOUNTS
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {accounts.length} <span style={{ fontSize: '1rem', color: 'var(--neon-emerald)', fontWeight: 600 }}>Active Nodes</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Selected: <code className="mono">{selectedAccount ? selectedAccount.name : 'None'}</code>
            </div>
          </div>

          <div className="stat-tile">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.3rem' }}>
              MUTEX & CONCURRENCY MODE
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--neon-violet)', marginTop: '0.2rem' }}>
              Pessimistic Lock Order
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
              UUID ascending deadlock-free acquisition
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Account Cards Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Wallet size={20} style={{ color: 'var(--neon-cyan)' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            Active Accounts
          </h2>
          <span className="hud-tag">{accounts.length} Connected</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Click an account card to bind the Live Ledger Tape
        </span>
      </div>

      {/* Account Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        {accounts.map((acc) => {
          const isSelected = selectedAccount?.id === acc.id;
          return (
            <div
              key={acc.id}
              className="glass-panel"
              style={{
                padding: '1.6rem',
                cursor: 'pointer',
                border: isSelected ? '1px solid var(--neon-cyan)' : '1px solid var(--border-subtle)',
                boxShadow: isSelected ? '0 0 25px rgba(0, 245, 255, 0.2), inset 0 1px 0 rgba(0, 245, 255, 0.3)' : undefined,
                background: isSelected ? 'linear-gradient(135deg, rgba(16, 32, 60, 0.85) 0%, rgba(10, 20, 40, 0.95) 100%)' : undefined
              }}
              onClick={() => setSelectedAccount(acc)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: isSelected ? 'rgba(0, 245, 255, 0.15)' : 'rgba(148, 163, 184, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: isSelected ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid var(--border-subtle)' }}>
                    <Wallet size={18} style={{ color: isSelected ? 'var(--neon-cyan)' : 'var(--text-secondary)' }} />
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', display: 'block' }}>{acc.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{acc.type} ACCOUNT</span>
                  </div>
                </div>

                <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`}>
                  {acc.status}
                </span>
              </div>

              {/* Balance Display */}
              <div style={{ marginBottom: '1.2rem', padding: '1rem', background: 'rgba(5, 10, 20, 0.5)', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.2rem' }}>
                  SETTLED BALANCE
                </div>
                <div className="tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {formatINR(acc.balance)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--neon-cyan)', marginTop: '0.2rem' }}>
                  paise: <code className="mono">{acc.balance}</code>
                </div>
              </div>

              {/* Account ID with copy */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '1.3rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>UUID: {acc.id.slice(0, 8)}...{acc.id.slice(-4)}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(acc.id, acc.id); }}
                  style={{ background: 'transparent', border: 'none', color: copiedId === acc.id ? 'var(--neon-emerald)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem' }}
                  title="Copy full UUID"
                >
                  {copiedId === acc.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('DEPOSIT', acc); }}
                  disabled={acc.status === 'FROZEN'}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '0.5rem 0.4rem', fontSize: '0.82rem' }}
                >
                  <ArrowDownLeft size={15} style={{ color: 'var(--neon-emerald)' }} /> Deposit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('WITHDRAW', acc); }}
                  disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '0.5rem 0.4rem', fontSize: '0.82rem' }}
                >
                  <ArrowUpRight size={15} style={{ color: 'var(--neon-crimson)' }} /> Withdraw
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openActionModal('TRANSFER', acc); }}
                  disabled={acc.status === 'FROZEN' || acc.balance <= 0}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '0.5rem 0.4rem', fontSize: '0.82rem' }}
                >
                  <Send size={15} style={{ color: 'var(--neon-cyan)' }} /> Transfer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Ledger Tape */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="live-beacon" />
            <Clock size={20} style={{ color: 'var(--neon-cyan)' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              Live Ledger Tape
            </h2>
            <span className="hud-tag cyan">STREAMING // AUTO-POLL (5S)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Bound to: <strong style={{ color: 'var(--neon-cyan)' }}>{selectedAccount ? selectedAccount.name : 'All'}</strong>
            </span>
            <button onClick={fetchTapeEntries} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {tapeEntries.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.95rem', background: 'rgba(10, 16, 30, 0.4)', borderRadius: '12px' }}>
            No recent ledger entries found on this account.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.8rem 1rem' }}>Seq #</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Timestamp</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Direction</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Balance After</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Transfer UUID</th>
                </tr>
              </thead>
              <tbody>
                {tapeEntries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)', transition: 'background 0.15s ease' }}>
                    <td className="mono" style={{ padding: '0.85rem 1rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>
                      #{entry.id}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`}>
                        {entry.direction === 'CREDIT' ? '↑ CREDIT' : '↓ DEBIT'}
                      </span>
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.95rem', color: entry.amount > 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                      {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                    </td>
                    <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatINR(entry.balanceAfter)}
                    </td>
                    <td className="mono" style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
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
          <div className="hud-card modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={20} style={{ color: 'var(--neon-cyan)' }} />
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {actionType === 'CREATE_ACCOUNT' && 'Open New Account'}
                  {actionType === 'DEPOSIT' && `Deposit Funds: ${selectedAccount?.name}`}
                  {actionType === 'WITHDRAW' && `Withdraw Funds: ${selectedAccount?.name}`}
                  {actionType === 'TRANSFER' && `Transfer Funds: ${selectedAccount?.name}`}
                </h2>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '1.6rem' }}>
              All money movements execute atomically with bilateral double-entry conservation and idempotency protection.
            </p>

            {/* Error Message */}
            {actionError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', padding: '0.9rem 1.1rem', marginBottom: '1.4rem', color: '#fca5a5', fontSize: '0.88rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Success Confirmation Screen (Shown only after server confirms) */}
            {actionSuccess ? (
              <div>
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 30, 20, 0.4) 100%)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '1.6rem', marginBottom: '1.5rem', textAlign: 'center', boxShadow: '0 0 25px rgba(16, 185, 129, 0.15)' }}>
                  <CheckCircle2 size={42} style={{ color: 'var(--neon-emerald)', margin: '0 auto 0.8rem' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399', marginBottom: '0.3rem' }}>
                    Transaction Confirmed by Server
                  </h3>
                  <div className="tabular-nums glow-text-emerald" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.6rem 0' }}>
                    {formatINR(actionSuccess.amountMinor)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0, 0, 0, 0.3)', padding: '0.3rem 0.7rem', borderRadius: '6px' }}>
                    Transfer UUID: <code className="mono">{actionSuccess.transferId}</code>
                  </div>
                </div>

                {/* Idempotent Replay Indicator */}
                {actionSuccess.isReplayed && (
                  <div className="badge-replay" style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1.4rem', display: 'flex', gap: '0.8rem', alignItems: 'center', fontSize: '0.86rem' }}>
                    <RefreshCw size={20} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Replayed, no double charge:</strong> The server returned the stored response for this idempotency key without re-debiting.
                    </div>
                  </div>
                )}

                <div style={{ background: 'rgba(10, 16, 30, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.6rem', fontSize: '0.78rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Idempotency-Key Header Bound:</div>
                  <code className="mono" style={{ color: 'var(--neon-cyan)', wordBreak: 'break-all' }}>{actionSuccess.keyUsed}</code>
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
                <div style={{ marginBottom: '1.4rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                    Account Display Name
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Investment Vault, High-Yield Checking"
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="btn btn-primary">
                    {actionLoading ? 'Provisioning...' : 'Confirm Account'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {actionType === 'TRANSFER' && (
                  <div style={{ marginBottom: '1.2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
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

                <div style={{ marginBottom: '1.4rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <span className="hud-tag emerald">
                      CONVERTED PAISE: {parseINRToMinorUnits(amountRupees).toString()}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'rgba(10, 16, 30, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.6rem', fontSize: '0.78rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Assigned Intent Idempotency-Key:</div>
                  <code className="mono" style={{ color: 'var(--neon-cyan)', wordBreak: 'break-all' }}>{currentIdempotencyKey}</code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button
                    type="button"
                    onClick={() => executeAction()}
                    disabled={actionLoading}
                    className="btn btn-primary"
                  >
                    {actionLoading ? 'Processing Mutex...' : `Confirm ${actionType}`}
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
