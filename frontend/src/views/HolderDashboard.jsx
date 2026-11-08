import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import { formatINR, parseINRToMinorUnits } from '../utils/money';
import { generateIdempotencyKey } from '../utils/idempotency';
import { 
  Wallet, Plus, ArrowUpRight, ArrowDownLeft, Send, RefreshCw, 
  CheckCircle2, AlertTriangle, Clock, Copy, Check, ShieldCheck,
  Eye, EyeOff, Download, Share2, CreditCard, Sparkles, Filter, Search
} from 'lucide-react';

export default function HolderDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [actionType, setActionType] = useState(null); // 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'CREATE_ACCOUNT' | 'SHARE_ID' | 'TX_DETAILS'
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [accountName, setAccountName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);

  // Eye toggle for privacy
  const [showBalance, setShowBalance] = useState(true);

  // Search & Filter for transactions
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL'); // 'ALL' | 'CREDIT' | 'DEBIT'

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
      } else if (data.length > 0 && selectedAccount) {
        // sync currently selected account balance
        const updated = data.find(a => a.id === selectedAccount.id);
        if (updated) setSelectedAccount(updated);
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
      const statement = await apiClient(`/api/accounts/${accId}/statement?page=0&size=20`);
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
    setSelectedAccount(acc || selectedAccount || accounts[0]);
    setAmountRupees('');
    setTargetAccountId('');
    setAccountName('');
    setActionError(null);
    setActionSuccess(null);
    setCurrentIdempotencyKey(generateIdempotencyKey());
  };

  const closeModal = () => {
    setActionType(null);
    setActionError(null);
    setActionSuccess(null);
    setSelectedTx(null);
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

  // Export transactions to CSV
  const exportToCSV = () => {
    if (tapeEntries.length === 0) return;
    const headers = ['Entry ID', 'Date Time UTC', 'Direction', 'Amount (Paise)', 'Balance After (Paise)', 'Transfer UUID'];
    const rows = tapeEntries.map(e => [
      e.id,
      new Date(e.createdAt).toISOString(),
      e.direction,
      e.amount,
      e.balanceAfter,
      e.transferId || ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ledgerline-statement-${selectedAccount?.name || 'account'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered transactions
  const filteredEntries = useMemo(() => {
    return tapeEntries.filter(entry => {
      const matchesFilter = activityFilter === 'ALL' || entry.direction === activityFilter;
      const matchesSearch = !searchQuery || 
        entry.id.toString().includes(searchQuery) ||
        (entry.transferId && entry.transferId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        entry.amount.toString().includes(searchQuery);
      return matchesFilter && matchesSearch;
    });
  }, [tapeEntries, activityFilter, searchQuery]);

  // Total balance across accounts
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

  const currentAcc = selectedAccount || accounts[0];

  return (
    <div className="view-container">
      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.5rem', color: '#be123c', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Account Switcher Header / Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', maxWidth: '100%' }}>
          {accounts.map(acc => {
            const isSel = currentAcc?.id === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccount(acc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '999px',
                  border: isSel ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: isSel ? '#eff6ff' : '#ffffff',
                  color: isSel ? '#1d4ed8' : '#475569',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: isSel ? '0 1px 3px rgba(37, 99, 235, 0.15)' : 'none'
                }}
              >
                <Wallet size={14} style={{ color: isSel ? '#2563eb' : '#64748b' }} />
                <span>{acc.name}</span>
                <span className={`badge ${acc.status === 'ACTIVE' ? 'badge-emerald' : 'badge-crimson'}`} style={{ padding: '0.1rem 0.4rem', fontSize: '0.68rem' }}>
                  {acc.status}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => openActionModal('CREATE_ACCOUNT')}
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
        >
          <Plus size={15} /> Add Account
        </button>
      </div>

      {/* Modern Fintech Neo-Card */}
      {currentAcc && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e293b 70%, #0f172a 100%)',
            borderRadius: '20px',
            padding: '1.75rem 1.6rem',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            marginBottom: '1.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Subtle Decorative Specular Gradient */}
          <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(96, 165, 250, 0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Top Row: Account Name & Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={18} style={{ color: '#93c5fd' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                  {currentAcc.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Double-Entry Checking
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16, 185, 129, 0.2)', padding: '0.3rem 0.65rem', borderRadius: '999px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
              <span className="live-beacon" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6ee7b7' }}>ACTIVE & SAFE</span>
            </div>
          </div>

          {/* Middle: Available Balance */}
          <div style={{ marginBottom: '1.4rem', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Available Balance
              </span>
              <button
                type="button"
                onClick={() => setShowBalance(!showBalance)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            <div className="tabular-nums" style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {showBalance ? formatINR(currentAcc.balance) : '₹ • • • • • •'}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#93c5fd', marginTop: '0.3rem' }}>
              Exact minor units: <code className="mono">{currentAcc.balance} paise</code>
            </div>
          </div>

          {/* Bottom Row: Account Number & Copy Action */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '0.9rem', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
              <span>AC: {currentAcc.id.slice(0, 8)} •••• {currentAcc.id.slice(-4)}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(currentAcc.id, 'card-acc')}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: copiedId === 'card-acc' ? '#34d399' : '#ffffff',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                {copiedId === 'card-acc' ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy ID</>}
              </button>

              <button
                type="button"
                onClick={() => openActionModal('SHARE_ID', currentAcc)}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <Share2 size={13} /> Share Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Circles / Buttons */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.8rem',
          marginBottom: '2rem'
        }}
      >
        <button
          onClick={() => openActionModal('DEPOSIT', currentAcc)}
          disabled={currentAcc?.status === 'FROZEN'}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', border: '1px solid #a7f3d0' }}>
            <ArrowDownLeft size={20} />
          </div>
          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>Deposit</span>
        </button>

        <button
          onClick={() => openActionModal('WITHDRAW', currentAcc)}
          disabled={currentAcc?.status === 'FROZEN' || (currentAcc && currentAcc.balance <= 0)}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48', border: '1px solid #fecdd3' }}>
            <ArrowUpRight size={20} />
          </div>
          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>Withdraw</span>
        </button>

        <button
          onClick={() => openActionModal('TRANSFER', currentAcc)}
          disabled={currentAcc?.status === 'FROZEN' || (currentAcc && currentAcc.balance <= 0)}
          style={{
            background: '#ffffff',
            border: '1px solid #bfdbfe',
            borderRadius: '16px',
            padding: '1rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)' }}>
            <Send size={18} />
          </div>
          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1d4ed8' }}>Transfer</span>
        </button>
      </div>

      {/* Modern Transaction Feed Section */}
      <div className="hud-card" style={{ padding: '1.5rem', background: '#ffffff', marginBottom: '2rem' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              Transaction Activity
            </h2>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Instant settlement on {currentAcc?.name || 'account'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={exportToCSV}
              disabled={tapeEntries.length === 0}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              title="Download CSV Statement"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={fetchTapeEntries}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              title="Refresh transaction feed"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          {/* Pills */}
          <div style={{ display: 'flex', gap: '0.35rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
            {['ALL', 'CREDIT', 'DEBIT'].map(mode => (
              <button
                key={mode}
                onClick={() => setActivityFilter(mode)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activityFilter === mode ? '#ffffff' : 'transparent',
                  color: activityFilter === mode ? '#0f172a' : '#64748b',
                  boxShadow: activityFilter === mode ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                }}
              >
                {mode === 'ALL' ? 'All' : mode === 'CREDIT' ? 'Money In' : 'Money Out'}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: 'min(100%, 200px)' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search amount or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.4rem 0.75rem 0.4rem 2.2rem',
                fontSize: '0.82rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#f8fafc',
                color: '#0f172a'
              }}
            />
          </div>
        </div>

        {/* Transaction List (Modern Feed View) */}
        {filteredEntries.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem', color: '#334155' }}>
              No transactions found
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              {searchQuery ? 'Try clearing your search query.' : 'Use the Deposit button above to fund your account.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {filteredEntries.map((entry) => {
              const isCredit = entry.direction === 'CREDIT';
              return (
                <div
                  key={entry.id}
                  onClick={() => { setSelectedTx(entry); setActionType('TX_DETAILS'); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid #f1f5f9',
                    background: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#f1f5f9'}
                >
                  {/* Left: Icon & Description */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isCredit ? '#ecfdf5' : '#fff1f2',
                        color: isCredit ? '#059669' : '#e11d48',
                        border: isCredit ? '1px solid #a7f3d0' : '1px solid #fecdd3',
                        flexShrink: 0
                      }}
                    >
                      {isCredit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                        {isCredit ? 'Deposit Received' : 'Withdrawal / Transfer Out'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>#{entry.id}</span>
                        <span>•</span>
                        <span>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Balance After */}
                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="tabular-nums"
                      style={{
                        fontWeight: 800,
                        fontSize: '1.05rem',
                        color: isCredit ? '#059669' : '#0f172a'
                      }}
                    >
                      {isCredit ? `+${formatINR(entry.amount)}` : `-${formatINR(Math.abs(entry.amount))}`}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      Bal: {formatINR(entry.balanceAfter)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: SHARE ACCOUNT DETAILS */}
      {actionType === 'SHARE_ID' && currentAcc && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                <Share2 size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Account Details
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Share your Account ID with anyone to receive transfers instantly.
              </p>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Account Name
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
                {currentAcc.name}
              </div>

              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Full Account UUID
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: '#0f172a', wordBreak: 'break-all' }}>
                {currentAcc.id}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => copyToClipboard(currentAcc.id, 'modal-acc')}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {copiedId === 'modal-acc' ? <><Check size={16} /> Copied to Clipboard</> : <><Copy size={16} /> Copy Account ID</>}
              </button>
              <button onClick={closeModal} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRANSACTION DETAILS */}
      {actionType === 'TX_DETAILS' && selectedTx && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: selectedTx.direction === 'CREDIT' ? '#ecfdf5' : '#fff1f2', color: selectedTx.direction === 'CREDIT' ? '#059669' : '#e11d48', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                {selectedTx.direction === 'CREDIT' ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Transaction Receipt
              </h3>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 800, color: selectedTx.direction === 'CREDIT' ? '#059669' : '#0f172a', marginTop: '0.3rem' }}>
                {selectedTx.direction === 'CREDIT' ? `+${formatINR(selectedTx.amount)}` : `-${formatINR(Math.abs(selectedTx.amount))}`}
              </div>
              <span className={`badge ${selectedTx.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`} style={{ marginTop: '0.4rem' }}>
                Settled & Verified
              </span>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Sequence ID</span>
                <span className="mono" style={{ fontWeight: 600 }}>#{selectedTx.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Timestamp (UTC)</span>
                <span style={{ color: '#0f172a' }}>{new Date(selectedTx.createdAt).toUTCString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Balance After</span>
                <span className="tabular-nums" style={{ fontWeight: 700, color: '#0f172a' }}>{formatINR(selectedTx.balanceAfter)}</span>
              </div>
              {selectedTx.transferId && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.74rem', marginBottom: '0.2rem' }}>Transfer UUID:</div>
                  <div className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all', color: '#2563eb' }}>
                    {selectedTx.transferId}
                  </div>
                </div>
              )}
            </div>

            <button onClick={closeModal} className="btn btn-primary" style={{ width: '100%' }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL: DEPOSIT / WITHDRAW / TRANSFER / CREATE ACCOUNT */}
      {(actionType === 'DEPOSIT' || actionType === 'WITHDRAW' || actionType === 'TRANSFER' || actionType === 'CREATE_ACCOUNT') && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.4rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: actionType === 'DEPOSIT' ? '#ecfdf5' : actionType === 'WITHDRAW' ? '#fff1f2' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: actionType === 'DEPOSIT' ? '#059669' : actionType === 'WITHDRAW' ? '#e11d48' : '#2563eb' }}>
                {actionType === 'DEPOSIT' && <ArrowDownLeft size={20} />}
                {actionType === 'WITHDRAW' && <ArrowUpRight size={20} />}
                {actionType === 'TRANSFER' && <Send size={18} />}
                {actionType === 'CREATE_ACCOUNT' && <Plus size={20} />}
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                {actionType === 'DEPOSIT' && 'Deposit Funds'}
                {actionType === 'WITHDRAW' && 'Withdraw Funds'}
                {actionType === 'TRANSFER' && 'Transfer Money'}
                {actionType === 'CREATE_ACCOUNT' && 'Open New Account'}
              </h2>
            </div>

            <p style={{ color: '#64748b', fontSize: '0.86rem', marginBottom: '1.2rem' }}>
              {actionType === 'DEPOSIT' && `Add money instantly into ${currentAcc?.name}.`}
              {actionType === 'WITHDRAW' && `Withdraw funds from ${currentAcc?.name}.`}
              {actionType === 'TRANSFER' && `Send funds to another customer's Account ID.`}
              {actionType === 'CREATE_ACCOUNT' && 'Create a separate savings or checking ledger account.'}
            </p>

            {actionError && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '0.8rem 1rem', marginBottom: '1.2rem', color: '#be123c', fontSize: '0.86rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess ? (
              <div>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                  <CheckCircle2 size={40} style={{ color: '#059669', margin: '0 auto 0.5rem' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#065f46' }}>
                    Transaction Successful!
                  </h3>
                  <div className="tabular-nums" style={{ fontSize: '1.9rem', fontWeight: 800, color: '#047857', margin: '0.4rem 0' }}>
                    {formatINR(actionSuccess.amountMinor)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', background: '#ffffff', padding: '0.35rem 0.75rem', borderRadius: '6px', display: 'inline-block', border: '1px solid #e2e8f0' }}>
                    Ref: <code className="mono">{actionSuccess.transferId?.slice(0, 8)}...</code>
                  </div>
                </div>

                {actionSuccess.isReplayed && (
                  <div className="badge-replay" style={{ padding: '0.8rem', borderRadius: '10px', marginBottom: '1.2rem', display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.84rem' }}>
                    <RefreshCw size={16} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Protected from double-charge:</strong> Response replayed safely.
                    </div>
                  </div>
                )}

                <button onClick={closeModal} className="btn btn-primary" style={{ width: '100%' }}>
                  Done
                </button>
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
                    placeholder="e.g. Vacation Fund, Savings"
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
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#334155', marginBottom: '0.4rem', fontWeight: 600 }}>
                      Destination Account ID (UUID)
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input mono"
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      placeholder="e.g. 1531c8d2-b26e-41bd-886d-bd7294e640aa"
                    />
                  </div>
                )}

                <div style={{ marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.84rem', color: '#334155', fontWeight: 600 }}>
                      Amount (in ₹ Rupees)
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Avail: {formatINR(currentAcc?.balance || 0)}
                    </span>
                  </div>

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

                  {/* Quick Preset Buttons */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    {['100', '500', '1000', '5000'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmountRupees(preset)}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#334155'
                        }}
                      >
                        +₹{preset}
                      </button>
                    ))}
                    {(actionType === 'WITHDRAW' || actionType === 'TRANSFER') && currentAcc && currentAcc.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmountRupees((Number(currentAcc.balance) / 100).toFixed(2))}
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          color: '#1d4ed8'
                        }}
                      >
                        Max Balance
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.8rem', marginBottom: '1.4rem', fontSize: '0.74rem' }}>
                  <div style={{ color: '#64748b', marginBottom: '0.15rem' }}>Duplicate Protection Key:</div>
                  <code className="mono" style={{ color: '#2563eb', wordBreak: 'break-all' }}>{currentIdempotencyKey}</code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button
                    type="button"
                    onClick={() => executeAction()}
                    disabled={actionLoading || !amountRupees || Number(amountRupees) <= 0}
                    className="btn btn-primary"
                  >
                    {actionLoading ? 'Processing...' : `Confirm ${actionType === 'DEPOSIT' ? 'Deposit' : actionType === 'WITHDRAW' ? 'Withdrawal' : 'Transfer'}`}
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
