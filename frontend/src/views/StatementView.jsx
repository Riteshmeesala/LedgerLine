import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  FileText, CheckCircle2, AlertOctagon, ChevronLeft, ChevronRight, 
  Calendar, Filter, ArrowDownLeft, ArrowUpRight, Download, RefreshCw,
  Wallet, ShieldCheck, Sparkles
} from 'lucide-react';

export default function StatementView() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    apiClient('/api/accounts')
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) {
          setSelectedAccountId(data[0].id);
        }
      })
      .catch((err) => setError(err.detail || err.message));
  }, []);

  const fetchStatement = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setError(null);
    try {
      let query = `/api/accounts/${selectedAccountId}/statement?page=${page}&size=${size}`;
      if (fromDate) query += `&from=${new Date(fromDate).toISOString()}`;
      if (toDate) query += `&to=${new Date(toDate).toISOString()}`;

      const res = await apiClient(query);
      setStatement(res);
    } catch (err) {
      setError(err.detail || err.message || 'Failed to generate statement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      fetchStatement();
    }
  }, [selectedAccountId, page]);

  const handleExportCSV = () => {
    if (!statement || !statement.entries || statement.entries.length === 0) return;
    const headers = ['Entry ID', 'Timestamp', 'Direction', 'Amount (INR)', 'Balance After (INR)', 'Transfer Ref'];
    const rows = statement.entries.map(e => [
      e.id,
      new Date(e.createdAt).toISOString(),
      e.direction,
      (e.amount / 100).toFixed(2),
      (e.balanceAfter / 100).toFixed(2),
      e.transferId || 'N/A'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `statement_${selectedAccountId.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDatePreset = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    setFromDate(from.toISOString().split('T')[0]);
    setToDate(to.toISOString().split('T')[0]);
    setPage(0);
  };

  const handleClearFilters = () => {
    setFromDate('');
    setToDate('');
    setPage(0);
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
            <button onClick={fetchStatement} className="btn btn-secondary">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={handleExportCSV} disabled={!statement || statement.entries.length === 0} className="btn btn-secondary">
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.8rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Statement Controls & Date Filter</h2>
          </div>

          {/* Quick Date Presets */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleDatePreset(7)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.74rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
              Last 7 Days
            </button>
            <button type="button" onClick={() => handleDatePreset(30)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.74rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
              Last 30 Days
            </button>
            {(fromDate || toDate) && (
              <button type="button" onClick={handleClearFilters} style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.74rem', fontWeight: 600, color: '#be123c', cursor: 'pointer' }}>
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 'min(100%, 260px)', flex: '1 1 260px' }}>
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

          <div style={{ minWidth: 'min(100%, 140px)', flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              Start Date
            </label>
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 'min(100%, 140px)', flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 600 }}>
              End Date
            </label>
            <input
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <button onClick={() => { setPage(0); fetchStatement(); }} className="btn btn-primary" style={{ padding: '0.7rem 1.3rem', flex: '1 1 140px', justifyContent: 'center' }}>
            <Calendar size={16} /> Filter
          </button>
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
          Reconciling statement entries from immutable ledger...
        </div>
      ) : statement ? (
        <div>
          {/* Mathematical Reconciliation Status Banner */}
          <div
            className="glass-panel"
            style={{
              padding: '1.5rem',
              marginBottom: '1.8rem',
              border: statement.reconciled ? '1px solid #a7f3d0' : '1px solid #fecdd3',
              background: statement.reconciled ? '#f0fdf4' : '#fff1f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1.2rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {statement.reconciled ? (
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <CheckCircle2 size={24} />
                </div>
              ) : (
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ffe4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                  <AlertOctagon size={24} />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.08rem', color: statement.reconciled ? '#065f46' : '#9f1239' }}>
                  {statement.reconciled ? 'Reconciliation Verified: Books Balance Perfectly' : 'Reconciliation Notice: Variance Detected'}
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.85rem', color: statement.reconciled ? '#047857' : '#be123c', marginTop: '0.15rem' }}>
                  Ending Balance ({formatINR(statement.closingBalance)}) = Opening ({formatINR(statement.openingBalance)}) + Period Net ({formatINR(statement.periodSum)})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div className="stat-tile" style={{ padding: '0.65rem 1.1rem', background: '#ffffff' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Opening Balance</div>
                <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>{formatINR(statement.openingBalance)}</div>
              </div>
              <div className="stat-tile" style={{ padding: '0.65rem 1.1rem', background: '#ffffff', borderColor: '#bfdbfe' }}>
                <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 600, textTransform: 'uppercase' }}>Closing Balance</div>
                <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1d4ed8' }}>{formatINR(statement.closingBalance)}</div>
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
              <span className="badge badge-cyan">{statement.totalEntries} Total Records</span>
            </div>

            {statement.entries.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                No transactions recorded for this selected period.
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
                    {statement.entries.map((entry) => (
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
      ) : null}
    </div>
  );
}
