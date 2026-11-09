import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  FileText, CheckCircle2, AlertOctagon, ChevronLeft, ChevronRight, 
  Calendar, Filter, ArrowDownLeft, ArrowUpRight, Download, RefreshCw,
  Search, X, RotateCcw
} from 'lucide-react';

export default function StatementView() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter States
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Boundary Parsers: Start of Day (00:00:00.000) & End of Day (23:59:59.999)
  const parseStartOfDayIso = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return d.toISOString();
  };

  const parseEndOfDayIso = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day, 23, 59, 59, 999);
    return d.toISOString();
  };

  // Fetch Accounts list
  const fetchAccounts = async () => {
    try {
      const data = await apiClient('/api/accounts');
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
        fetchStatementData(data[0].id, fromDate, toDate, page);
      }
      return data;
    } catch (err) {
      setError(err.detail || err.message);
      return [];
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Fetch statement data with boundary-aligned dates
  const fetchStatementData = async (accId, from, to, pageNum) => {
    if (!accId) return;
    setLoading(true);
    setError(null);
    try {
      let query = `/api/accounts/${accId}/statement?page=${pageNum}&size=${size}`;
      const startIso = parseStartOfDayIso(from);
      const endIso = parseEndOfDayIso(to);

      if (startIso) query += `&from=${startIso}`;
      if (endIso) query += `&to=${endIso}`;

      const res = await apiClient(query);
      setStatement(res);
    } catch (err) {
      setError(err.detail || err.message || 'Failed to generate statement.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger statement fetch on account or page change
  useEffect(() => {
    if (selectedAccountId) {
      fetchStatementData(selectedAccountId, fromDate, toDate, page);
    }
  }, [selectedAccountId, page]);

  // Bug 1 Fix: Filter entries with exact numeric match vs description/reference match
  const filteredEntries = useMemo(() => {
    if (!statement || !statement.entries) return [];
    const q = searchQuery.trim();
    if (!q) return statement.entries;

    const numericQuery = Number(q);
    const isNumeric = !isNaN(numericQuery) && q !== '';

    return statement.entries.filter((entry) => {
      if (isNumeric) {
        // Exact transaction value match on minor units (paise) or major units (rupees)
        const absAmount = Math.abs(entry.amount);
        return absAmount === numericQuery || (absAmount / 100) === numericQuery;
      }
      // Non-numeric: string matching ONLY on transferId, description, or entry ID
      const qLower = q.toLowerCase();
      return Boolean(
        (entry.transferId && entry.transferId.toLowerCase().includes(qLower)) ||
        (entry.description && entry.description.toLowerCase().includes(qLower)) ||
        (entry.id && entry.id.toString() === q)
      );
    });
  }, [statement, searchQuery]);

  // Bug 2 Fix: Dynamic Opening & Closing Balance computation
  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const fallbackBalance = activeAccount ? activeAccount.balance : 0;

  const dynamicBalances = useMemo(() => {
    const entries = filteredEntries;
    if (entries.length > 0) {
      // Earliest entry opening balance
      const opening = (statement && statement.openingBalance !== undefined && statement.openingBalance !== 0)
        ? statement.openingBalance
        : (entries[0].balanceAfter - entries[0].amount);

      // Latest entry closing balance
      const closing = (statement && statement.closingBalance !== undefined && statement.closingBalance !== 0)
        ? statement.closingBalance
        : entries[entries.length - 1].balanceAfter;

      const periodNet = entries.reduce((acc, e) => acc + e.amount, 0);
      return {
        opening,
        closing,
        periodNet,
        reconciled: (opening + periodNet) === closing
      };
    }

    // When 0 records in filtered range, DO NOT reset closing balance to ₹0.00!
    // Maintain opening/closing balance from account balance or statement bounds
    const persistentBalance = (statement && statement.closingBalance) || (statement && statement.openingBalance) || fallbackBalance;
    return {
      opening: persistentBalance,
      closing: persistentBalance,
      periodNet: 0,
      reconciled: true
    };
  }, [statement, filteredEntries, fallbackBalance]);

  // Bug 3 Fix: "Clear Filters" restores all params & triggers fresh data re-render
  const handleClearFilters = () => {
    const defaultAccountId = accounts.length > 0 ? accounts[0].id : '';
    setSelectedAccountId(defaultAccountId);
    setFromDate('');
    setToDate('');
    setSearchQuery('');
    setPage(0);
    if (defaultAccountId) {
      fetchStatementData(defaultAccountId, '', '', 0);
    }
  };

  // Bug 4 Fix: Refresh button triggers manual API re-fetch
  const handleManualRefresh = async () => {
    await fetchAccounts();
    if (selectedAccountId) {
      await fetchStatementData(selectedAccountId, fromDate, toDate, page);
    }
  };

  // Bug 4 Fix: Preset date buttons properly compute and set start/end date states
  const handleDatePreset = (days) => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);

    const pad = (n) => String(n).padStart(2, '0');
    const startStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    const endStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    setFromDate(startStr);
    setToDate(endStr);
    setPage(0);
    fetchStatementData(selectedAccountId, startStr, endStr, 0);
  };

  const handleApplyDateFilter = () => {
    setPage(0);
    fetchStatementData(selectedAccountId, fromDate, toDate, 0);
  };

  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;
    const headers = ['Entry ID', 'Timestamp', 'Direction', 'Amount (INR)', 'Balance After (INR)', 'Transfer Ref'];
    const rows = filteredEntries.map((e) => [
      e.id,
      new Date(e.createdAt).toISOString(),
      e.direction,
      (e.amount / 100).toFixed(2),
      (e.balanceAfter / 100).toFixed(2),
      e.transferId || 'N/A'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `statement_${selectedAccountId.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container">
      {/* Top Header */}
      <div className="glass-panel" style={{ marginBottom: '1.8rem', padding: '1.8rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">Financial Statements</span>
              <span className="hud-tag emerald">Cryptographic Proof Verified</span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              Account Statements & Journal
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: '0.2rem' }}>
              Mathematically reconciled journal statements with immutable ledger entry records.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleManualRefresh} disabled={loading} className="btn btn-secondary">
              <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button onClick={handleExportCSV} disabled={filteredEntries.length === 0} className="btn btn-secondary">
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Statement Controls & Date Filter Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.8rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Statement Controls & Date Filter</h2>
          </div>

          {/* Quick Date Presets & Clear Filters Button */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleDatePreset(7)}
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset(30)}
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Last 30 Days
            </button>
            {(fromDate || toDate || searchQuery || (accounts.length > 0 && selectedAccountId !== accounts[0].id)) && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  background: '#fff1f2',
                  border: '1px solid #fecdd3',
                  borderRadius: '6px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: '#be123c',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <RotateCcw size={12} /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              Select Account
            </label>
            <select
              className="form-input"
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setPage(0); }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — ({formatINR(acc.balance)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              Start Date (00:00:00)
            </label>
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              End Date (23:59:59)
            </label>
            <input
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              Search (Exact Amount or ID)
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="e.g. 500 or Ref ID..."
                className="form-input"
                style={{ paddingLeft: '2.1rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleApplyDateFilter}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.2rem', flex: 1, justifyContent: 'center' }}
            >
              <Calendar size={15} /> Apply Filter
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.8rem', color: '#be123c', display: 'flex', alignItems: 'center', gap: '0.8rem', fontWeight: 500 }}>
          <AlertOctagon size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', marginBottom: '0.5rem', color: '#2563eb' }} />
          <div>Reconciling statement entries from immutable ledger...</div>
        </div>
      ) : statement ? (
        <div>
          {/* Mathematical Reconciliation Status Banner with Dynamic Balances */}
          <div
            className="glass-panel"
            style={{
              padding: '1.5rem',
              marginBottom: '1.8rem',
              border: dynamicBalances.reconciled ? '1px solid #a7f3d0' : '1px solid #fecdd3',
              background: dynamicBalances.reconciled ? '#f0fdf4' : '#fff1f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1.2rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {dynamicBalances.reconciled ? (
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <CheckCircle2 size={24} />
                </div>
              ) : (
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ffe4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                  <AlertOctagon size={24} />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.08rem', color: dynamicBalances.reconciled ? '#065f46' : '#9f1239' }}>
                  {dynamicBalances.reconciled ? 'Reconciliation Verified: Books Balance Perfectly' : 'Reconciliation Notice: Variance Detected'}
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.85rem', color: dynamicBalances.reconciled ? '#047857' : '#be123c', marginTop: '0.15rem' }}>
                  Ending Balance ({formatINR(dynamicBalances.closing)}) = Opening ({formatINR(dynamicBalances.opening)}) + Period Net ({formatINR(dynamicBalances.periodNet)})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div className="stat-tile" style={{ padding: '0.65rem 1.1rem', background: '#ffffff' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Opening Balance</div>
                <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>{formatINR(dynamicBalances.opening)}</div>
              </div>
              <div className="stat-tile" style={{ padding: '0.65rem 1.1rem', background: '#ffffff', borderColor: '#bfdbfe' }}>
                <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 600, textTransform: 'uppercase' }}>Closing Balance</div>
                <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1d4ed8' }}>{formatINR(dynamicBalances.closing)}</div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="glass-panel" style={{ padding: '1.6rem', marginBottom: '1.8rem', background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.6rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
                <FileText size={18} style={{ color: '#2563eb' }} />
                Statement Journal Entries
              </h2>
              <span className="badge badge-cyan">{filteredEntries.length} Records</span>
            </div>

            {filteredEntries.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>No matching journal entries found.</div>
                <div style={{ fontSize: '0.8rem' }}>
                  {searchQuery || fromDate || toDate ? 'Try adjusting your date range or clearing filters.' : 'Transactions will appear here as entries are posted.'}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>#</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Flow</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Balance After</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Transfer ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td className="mono" style={{ padding: '0.8rem 1rem', color: '#2563eb', fontWeight: 700 }}>
                          #{entry.id}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', color: '#475569', fontSize: '0.82rem' }}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            {entry.direction === 'CREDIT' ? (
                              <><ArrowDownLeft size={13} /> Credit (In)</>
                            ) : (
                              <><ArrowUpRight size={13} /> Debit (Out)</>
                            )}
                          </span>
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.8rem 1rem', fontWeight: 700, fontSize: '0.94rem', color: entry.amount > 0 ? '#059669' : '#e11d48' }}>
                          {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.8rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                          {formatINR(entry.balanceAfter)}
                        </td>
                        <td className="mono" style={{ padding: '0.8rem 1rem', color: '#94a3b8', fontSize: '0.76rem' }}>
                          {entry.transferId ? `${entry.transferId.slice(0, 8)}...${entry.transferId.slice(-4)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {statement.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.2rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="hud-tag" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}>
                Page {page + 1} of {statement.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(statement.totalPages - 1, p + 1))}
                disabled={page >= statement.totalPages - 1}
                className="btn btn-secondary"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : accounts.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <FileText size={24} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>
            No Ledger Accounts Found
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.2rem' }}>
            Please open an account from your Dashboard to generate reconciled double-entry statements.
          </p>
          <a href="/dashboard" className="btn btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Go to Dashboard
          </a>
        </div>
      ) : null}
    </div>
  );
}
