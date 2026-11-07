import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { Activity, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, Link2, AlertTriangle, Layers } from 'lucide-react';

/**
 * Auditor Dashboard Component.
 *
 * SECURITY NOTICE:
 * This dashboard operates in read-only mode. Financial mutation controls (Deposits, Withdrawals, Transfers)
 * are NOT rendered here.
 * Note: Hiding write controls in the client UI is purely a UX affordance and is NEVER a security boundary.
 * The backend API independently enforces role-based access control (HTTP 403 Forbidden) on all write endpoints.
 */
export default function AuditorDashboard() {
  const [conservation, setConservation] = useState(null);
  const [conservationLoading, setConservationLoading] = useState(true);

  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  const fetchConservation = async () => {
    setConservationLoading(true);
    try {
      const data = await apiClient('/api/ledger/conservation');
      setConservation(data);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setConservationLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await apiClient('/api/audit?page=0&size=20');
      // Sort ascending to visualize chronological chain from left to right or top to bottom
      const sorted = [...(data.content || [])].reverse();
      setAuditLogs(sorted);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const verifyAuditChain = async () => {
    setVerifying(true);
    setVerificationResult(null);
    try {
      const result = await apiClient('/api/audit/verify');
      setVerificationResult(result);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchConservation();
    fetchAuditLogs();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--neon-cyan)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            <Activity size={16} /> Auditor Verification Console
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>
            System Integrity & Conservation
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Cryptographic audit chain verification and global zero-sum conservation monitoring.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button onClick={() => { fetchConservation(); fetchAuditLogs(); }} className="btn btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={verifyAuditChain}
            disabled={verifying}
            className="btn btn-primary"
            style={{ minWidth: '160px' }}
          >
            <ShieldCheck size={18} />
            {verifying ? 'Verifying Chain...' : 'Verify Cryptographic Chain'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            marginBottom: '2rem',
            border: verificationResult.valid ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(239, 68, 68, 0.6)',
            background: verificationResult.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {verificationResult.valid ? (
              <CheckCircle2 size={32} style={{ color: 'var(--neon-emerald)' }} />
            ) : (
              <ShieldAlert size={32} style={{ color: 'var(--neon-crimson)' }} />
            )}
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: verificationResult.valid ? '#34d399' : '#f87171' }}>
                {verificationResult.valid ? 'Cryptographic Hash-Chain Valid & Untampered' : 'Tampering Detected: Hash Chain Broken'}
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                {verificationResult.valid
                  ? `All ${verificationResult.checkedRows} sequential blocks verified from genesis (SHA-256 linear chain unbroken).`
                  : `Integrity check failed at sequence #${verificationResult.firstBrokenSeq}. Stored hash does not match computed hash.`}
              </p>
            </div>
          </div>

          <span className={`badge ${verificationResult.valid ? 'badge-emerald' : 'badge-crimson'}`} style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
            {verificationResult.valid ? 'CHAIN VERIFIED' : `BROKEN AT #${verificationResult.firstBrokenSeq}`}
          </span>
        </div>
      )}

      {/* Conservation Meter */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Layers size={20} style={{ color: 'var(--neon-cyan)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Double-Entry Conservation Meter</h2>
          </div>
          {conservation && (
            <span className={`badge ${conservation.healthy ? 'badge-emerald' : 'badge-crimson'}`}>
              {conservation.healthy ? 'ZERO-SUM PRESERVED' : 'INVARIANT VIOLATED'}
            </span>
          )}
        </div>

        {conservationLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Calculating global conservation...</div>
        ) : conservation ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {/* Metric 1: Sum of Entries */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                SUM OF ALL LEDGER ENTRIES
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 700, color: conservation.sumOfEntries === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {formatINR(conservation.sumOfEntries)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Must equal 0 minor units across all credits and debits.
              </div>
            </div>

            {/* Metric 2: Sum of Balances */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                SUM OF ALL ACCOUNT BALANCES
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 700, color: conservation.sumOfBalances === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {formatINR(conservation.sumOfBalances)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Customer balances offset against CASH_IN_OUT system node.
              </div>
            </div>

            {/* Metric 3: Imbalanced Transfers */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                IMBALANCED TRANSFER COUNT
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 700, color: conservation.imbalancedTransferCount === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {conservation.imbalancedTransferCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Individual transfers whose bilateral entries do not sum to 0.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hash-Chain Visualizer */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Link2 size={20} style={{ color: 'var(--neon-violet)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Cryptographic Hash-Chain Visualizer</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            SHA-256(prev_hash || seq || actor || action || entity || payload || created_at)
          </span>
        </div>

        {logsLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading audit blocks...</div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No audit blocks recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {auditLogs.map((block) => {
              const isBroken = verificationResult && !verificationResult.valid && verificationResult.firstBrokenSeq === block.seq;
              const isVerified = verificationResult && verificationResult.valid;

              return (
                <div
                  key={block.seq}
                  style={{
                    background: isBroken ? 'rgba(239, 68, 68, 0.15)' : isVerified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                    border: isBroken ? '1px solid var(--neon-crimson)' : isVerified ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '1.2rem',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span className="badge badge-cyan">BLOCK #{block.seq}</span>
                      <span className="badge badge-violet">{block.action}</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {block.entityType}: <code className="mono">{block.entityId}</code>
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {new Date(block.createdAt).toISOString()}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem', fontSize: '0.78rem', marginBottom: '0.6rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>PREVIOUS HASH:</div>
                      <code className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{block.prevHash}</code>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>BLOCK HASH:</div>
                      <code className="mono" style={{ color: isBroken ? '#f87171' : isVerified ? '#34d399' : 'var(--neon-cyan)', wordBreak: 'break-all' }}>
                        {block.hash}
                      </code>
                    </div>
                  </div>

                  {block.payload && Object.keys(block.payload).length > 0 && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '0.5rem 0.8rem', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Payload: </span>
                      <code className="mono" style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(block.payload)}</code>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

