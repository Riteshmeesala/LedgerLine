import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { FileText, CheckCircle2, AlertOctagon, ChevronLeft, ChevronRight, Calendar, Filter, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

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

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Top Header */}
      <div className="hud-card" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">Statements & History</span>
              <span className="hud-tag emerald">Verified Accuracy</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#0f172a' }}>
              Account <span className="glow-text-cyan">Statements</span>
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '0.4rem' }}>
              Review your detailed transaction records with verified starting and ending balances.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="hud-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}>
          <Filter size={18} style={{ color: 'var(--brand-primary)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Filter by Date or Account</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '240px', flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
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

          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
              Start Date
            </label>
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
              End Date
            </label>
            <input
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <button onClick={() => { setPage(0); fetchStatement(); }} className="btn btn-primary" style={{ padding: '0.75rem 1.4rem' }}>
            <Calendar size={16} /> Filter Statement
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.8rem', fontWeight: 500 }}>
          <AlertOctagon size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '5rem 2rem', textAlign: 'center', color: '#64748b' }}>
          Loading statement transactions...
        </div>
      ) : statement ? (
        <div>
          {/* Mathematical Reconciliation Status Banner */}
          <div
            className="hud-card"
            style={{
              padding: '1.5rem',
              marginBottom: '2rem',
              border: statement.reconciled ? '1px solid #a7f3d0' : '1px solid #fecaca',
              background: statement.reconciled ? '#f0fdf4' : '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {statement.reconciled ? (
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #86efac' }}>
                  <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
                </div>
              ) : (
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fca5a5' }}>
                  <AlertOctagon size={24} style={{ color: '#dc2626' }} />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: statement.reconciled ? '#166534' : '#991b1b' }}>
                  {statement.reconciled ? 'Reconciliation Verified: Books Balance Perfectly' : 'Reconciliation Notice: Variance Detected'}
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.88rem', color: '#475569', marginTop: '0.2rem' }}>
                  Ending Balance ({formatINR(statement.closingBalance)}) = Starting ({formatINR(statement.openingBalance)}) + Net Change ({formatINR(statement.periodSum)})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="stat-tile" style={{ padding: '0.75rem 1.25rem', background: '#ffffff' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>STARTING BALANCE</div>
                <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{formatINR(statement.openingBalance)}</div>
              </div>
              <div className="stat-tile" style={{ padding: '0.75rem 1.25rem', background: '#ffffff', borderColor: '#bfdbfe' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--brand-primary)', fontWeight: 600 }}>ENDING BALANCE</div>
                <div className="tabular-nums glow-text-cyan" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatINR(statement.closingBalance)}</div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="hud-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#0f172a' }}>
                <FileText size={20} style={{ color: 'var(--brand-primary)' }} />
                Statement Journal Entries
              </h2>
              <span className="hud-tag cyan">{statement.totalEntries} Total Records</span>
            </div>

            {statement.entries.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                No transactions recorded for this period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>#</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Date & Time</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Balance After</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Reference ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td className="mono" style={{ padding: '0.85rem 1rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                          #{entry.id}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.84rem' }}>
                          {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            {entry.direction === 'CREDIT' ? (
                              <><ArrowDownLeft size={13} /> Credit (In)</>
                            ) : (
                              <><ArrowUpRight size={13} /> Debit (Out)</>
                            )}
                          </span>
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.95rem', color: entry.amount > 0 ? '#16a34a' : '#dc2626' }}>
                          {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                          {formatINR(entry.balanceAfter)}
                        </td>
                        <td className="mono" style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.78rem' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.2rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="hud-tag" style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
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
