import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { FileText, CheckCircle2, AlertOctagon, ChevronLeft, ChevronRight, Calendar, Filter, Calculator } from 'lucide-react';

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
      <div className="hud-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">LEDGER JOURNAL // DOUBLE-ENTRY</span>
              <span className="hud-tag emerald">MATHEMATICALLY RECONCILED</span>
            </div>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Account <span className="glow-text-cyan">Statements</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
              Temporal ledger journal with mathematical reconciliation verification.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}>
          <Filter size={18} style={{ color: 'var(--neon-cyan)' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Filter Statement Period</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '240px', flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
              Target Account
            </label>
            <select
              className="form-input"
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setPage(0); }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} style={{ background: '#0a101e' }}>
                  {acc.name} — ({formatINR(acc.balance)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
              From Date
            </label>
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>
              To Date
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
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <AlertOctagon size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Calculating statement journal and reconciliation proofs...
        </div>
      ) : statement ? (
        <div>
          {/* Mathematical Reconciliation Status Banner */}
          <div
            className="hud-card"
            style={{
              padding: '1.8rem',
              marginBottom: '2rem',
              border: statement.reconciled ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(244, 63, 94, 0.6)',
              background: statement.reconciled ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 30, 20, 0.4) 100%)' : 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(30, 5, 10, 0.4) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              {statement.reconciled ? (
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                  <CheckCircle2 size={26} style={{ color: 'var(--neon-emerald)' }} />
                </div>
              ) : (
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
                  <AlertOctagon size={26} style={{ color: 'var(--neon-crimson)' }} />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: statement.reconciled ? '#34d399' : '#f87171', letterSpacing: '-0.01em' }}>
                  {statement.reconciled ? 'Reconciliation Verified: Books Balance' : 'Reconciliation Warning: Books Imbalanced'}
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Closing ({formatINR(statement.closingBalance)}) = Opening ({formatINR(statement.openingBalance)}) + Period Movements ({formatINR(statement.periodSum)})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div className="stat-tile" style={{ padding: '0.8rem 1.2rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OPENING BALANCE</div>
                <div className="tabular-nums" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{formatINR(statement.openingBalance)}</div>
              </div>
              <div className="stat-tile" style={{ padding: '0.8rem 1.2rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>CLOSING BALANCE</div>
                <div className="tabular-nums glow-text-cyan" style={{ fontSize: '1.3rem', fontWeight: 800 }}>{formatINR(statement.closingBalance)}</div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <FileText size={20} style={{ color: 'var(--neon-cyan)' }} />
                Ledger Journal Entries
              </h2>
              <span className="hud-tag cyan">{statement.totalEntries} Total Recorded</span>
            </div>

            {statement.entries.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(10, 16, 30, 0.4)', borderRadius: '12px' }}>
                No journal entries found in this statement interval.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '0.8rem 1rem' }}>Seq #</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Date & Time (UTC)</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Direction</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Amount</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Running Balance</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Transfer UUID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                        <td className="mono" style={{ padding: '0.85rem 1rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>
                          #{entry.id}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                          {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`}>
                            {entry.direction === 'CREDIT' ? '↑ CREDIT' : '↓ DEBIT'}
                          </span>
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.95rem', color: entry.amount > 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                          {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
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

          {/* Pagination Controls */}
          {statement.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.2rem' }}>
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
