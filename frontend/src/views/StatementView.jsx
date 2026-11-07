import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { FileText, CheckCircle2, AlertOctagon, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>
            Account Statements
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Period statements with mathematical reconciliation check.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel" style={{ padding: '1.2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
        <div style={{ minWidth: '220px', flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
            Account
          </label>
          <select
            className="form-input"
            value={selectedAccountId}
            onChange={(e) => { setSelectedAccountId(e.target.value); setPage(0); }}
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id} style={{ background: '#0f172a' }}>
                {acc.name} ({formatINR(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
            From Date
          </label>
          <input
            type="date"
            className="form-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
            To Date
          </label>
          <input
            type="date"
            className="form-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <button onClick={() => { setPage(0); fetchStatement(); }} className="btn btn-primary">
          <Calendar size={16} /> Filter
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Calculating statement entries...</div>
      ) : statement ? (
        <div>
          {/* Mathematical Reconciliation Status Banner */}
          <div
            className="glass-panel"
            style={{
              padding: '1.2rem 1.5rem',
              marginBottom: '1.5rem',
              border: statement.reconciled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.5)',
              background: statement.reconciled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              {statement.reconciled ? (
                <CheckCircle2 size={24} style={{ color: 'var(--neon-emerald)' }} />
              ) : (
                <AlertOctagon size={24} style={{ color: 'var(--neon-crimson)' }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: statement.reconciled ? '#34d399' : '#f87171' }}>
                  {statement.reconciled ? 'Reconciliation Verified: Books Balance' : 'Reconciliation Warning: Books Imbalanced'}
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Closing ({formatINR(statement.closingBalance)}) = Opening ({formatINR(statement.openingBalance)}) + Period Movements ({formatINR(statement.periodSum)})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OPENING BALANCE</div>
                <div className="tabular-nums" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatINR(statement.openingBalance)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CLOSING BALANCE</div>
                <div className="tabular-nums" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--neon-cyan)' }}>{formatINR(statement.closingBalance)}</div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} style={{ color: 'var(--neon-cyan)' }} />
              Ledger Journal Entries ({statement.totalEntries} Total)
            </h2>

            {statement.entries.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No journal entries in this statement interval.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Seq #</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Date & Time (UTC)</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Direction</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Amount</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Running Balance</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Transfer ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                        <td className="mono" style={{ padding: '0.7rem 0.8rem', color: 'var(--text-muted)' }}>#{entry.id}</td>
                        <td style={{ padding: '0.7rem 0.8rem', color: 'var(--text-secondary)' }}>
                          {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td style={{ padding: '0.7rem 0.8rem' }}>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-emerald' : 'badge-crimson'}`}>
                            {entry.direction}
                          </span>
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.7rem 0.8rem', fontWeight: 600, color: entry.amount > 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                          {entry.amount > 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount)}
                        </td>
                        <td className="tabular-nums" style={{ padding: '0.7rem 0.8rem', fontWeight: 600 }}>
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

          {/* Pagination Controls */}
          {statement.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
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

