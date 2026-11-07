import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  Activity, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, 
  Link2, AlertTriangle, Layers, Database, Lock, Terminal, Cpu
} from 'lucide-react';

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
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Top Futuristic SOC Header */}
      <div className="hud-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">SECURITY OPERATIONS CENTER</span>
              <span className="hud-tag violet">READ-ONLY AUDIT ROLE</span>
            </div>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              System Integrity & <span className="glow-text-cyan">Conservation</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
              Cryptographic hash-chain audit trail verification and global double-entry zero-sum monitoring.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { fetchConservation(); fetchAuditLogs(); }} className="btn btn-secondary">
              <RefreshCw size={16} /> Refresh Feeds
            </button>
            <button
              onClick={verifyAuditChain}
              disabled={verifying}
              className="btn btn-primary"
              style={{ minWidth: '220px' }}
            >
              <ShieldCheck size={18} />
              {verifying ? 'Scanning Chain Hashes...' : 'Verify Cryptographic Chain'}
            </button>
          </div>
        </div>

        {/* Security Primitives Badges */}
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="hud-tag emerald">
            <Lock size={12} /> SQLSTATE 55000 IMMUTABLE TRIGGERS
          </div>
          <div className="hud-tag cyan">
            <Cpu size={12} /> PG_ADVISORY_XACT_LOCK CONCURRENCY
          </div>
          <div className="hud-tag violet">
            <Database size={12} /> BILATERAL DEFERRABLE CONSTRAINTS
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '2rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className="hud-card"
          style={{
            padding: '1.8rem',
            marginBottom: '2.5rem',
            border: verificationResult.valid ? '1px solid rgba(16, 185, 129, 0.6)' : '1px solid rgba(244, 63, 94, 0.7)',
            background: verificationResult.valid ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 30, 20, 0.5) 100%)' : 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(30, 5, 10, 0.5) 100%)',
            boxShadow: verificationResult.valid ? '0 0 30px rgba(16, 185, 129, 0.2)' : '0 0 30px rgba(244, 63, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.2rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            {verificationResult.valid ? (
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16, 185, 129, 0.5)' }}>
                <CheckCircle2 size={30} style={{ color: 'var(--neon-emerald)' }} />
              </div>
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(244, 63, 94, 0.5)' }}>
                <ShieldAlert size={30} style={{ color: 'var(--neon-crimson)' }} />
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: verificationResult.valid ? '#34d399' : '#f87171', letterSpacing: '-0.01em' }}>
                {verificationResult.valid ? 'Cryptographic Hash-Chain Valid & Untampered' : 'Tampering Detected: Hash Chain Broken'}
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {verificationResult.valid
                  ? `All ${verificationResult.checkedRows} sequential blocks verified from genesis (SHA-256 linear chain unbroken).`
                  : `Integrity check failed at sequence #${verificationResult.firstBrokenSeq}. Stored hash does not match computed hash.`}
              </p>
            </div>
          </div>

          <span className={`badge ${verificationResult.valid ? 'badge-emerald' : 'badge-crimson'}`} style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
            {verificationResult.valid ? 'CHAIN 100% VERIFIED' : `BROKEN AT BLOCK #${verificationResult.firstBrokenSeq}`}
          </span>
        </div>
      )}

      {/* Conservation Meter */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Layers size={22} style={{ color: 'var(--neon-cyan)' }} />
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Double-Entry Conservation Meter
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Fundamental Invariant: Σ Credits + Σ Debits = 0 (Global Zero-Sum)
              </span>
            </div>
          </div>

          {conservation && (
            <span className={`badge ${conservation.healthy ? 'badge-emerald' : 'badge-crimson'}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
              {conservation.healthy ? 'ZERO-SUM PRESERVED' : 'INVARIANT VIOLATED'}
            </span>
          )}
        </div>

        {conservationLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculating global conservation invariant...
          </div>
        ) : conservation ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Metric 1: Sum of Entries */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.4rem' }}>
                SUM OF ALL LEDGER ENTRIES
              </div>
              <div className="tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: conservation.sumOfEntries === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {formatINR(conservation.sumOfEntries)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="live-beacon" style={{ width: '6px', height: '6px' }} />
                <span>Must strictly equal 0 minor units.</span>
              </div>
            </div>

            {/* Metric 2: Sum of Balances */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.4rem' }}>
                SUM OF ALL ACCOUNT BALANCES
              </div>
              <div className="tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: conservation.sumOfBalances === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {formatINR(conservation.sumOfBalances)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="live-beacon" style={{ width: '6px', height: '6px' }} />
                <span>Customer balances offset vs CASH_IN_OUT node.</span>
              </div>
            </div>

            {/* Metric 3: Imbalanced Transfers */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.4rem' }}>
                IMBALANCED TRANSFER COUNT
              </div>
              <div className="tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: conservation.imbalancedTransferCount === 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)' }}>
                {conservation.imbalancedTransferCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="live-beacon" style={{ width: '6px', height: '6px' }} />
                <span>Transfers violating double-entry conservation.</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hash-Chain Visualizer */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.8rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link2 size={22} style={{ color: 'var(--neon-violet)' }} />
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Cryptographic Hash-Chain Visualizer
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Linear hash integrity: H(i) = SHA-256(H(i-1) || seq || actor || action || entity || payload || timestamp)
              </span>
            </div>
          </div>

          <span className="hud-tag violet">
            IMMUTABLE SEQUENTIAL LOG
          </span>
        </div>

        {logsLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Retrieving cryptographic audit blocks...
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(10, 16, 30, 0.4)', borderRadius: '12px' }}>
            No audit blocks recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {auditLogs.map((block, index) => {
              const isBroken = verificationResult && !verificationResult.valid && verificationResult.firstBrokenSeq === block.seq;
              const isVerified = verificationResult && verificationResult.valid;

              return (
                <div key={block.seq}>
                  <div
                    className="stat-tile"
                    style={{
                      background: isBroken 
                        ? 'rgba(239, 68, 68, 0.15)' 
                        : isVerified 
                        ? 'rgba(16, 185, 129, 0.08)' 
                        : 'linear-gradient(135deg, rgba(16, 26, 48, 0.7) 0%, rgba(9, 15, 30, 0.85) 100%)',
                      border: isBroken 
                        ? '1px solid var(--neon-crimson)' 
                        : isVerified 
                        ? '1px solid rgba(16, 185, 129, 0.4)' 
                        : '1px solid var(--border-subtle)',
                      padding: '1.4rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-cyan" style={{ fontSize: '0.8rem' }}>BLOCK #{block.seq}</span>
                        <span className="badge badge-violet">{block.action}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {block.entityType}: <code className="mono" style={{ color: 'var(--text-primary)' }}>{block.entityId}</code>
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(block.createdAt).toISOString()}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', fontSize: '0.8rem', marginBottom: '0.8rem' }}>
                      <div style={{ background: 'rgba(5, 10, 20, 0.5)', padding: '0.7rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.06)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.2rem' }}>PREVIOUS BLOCK HASH:</div>
                        <code className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all', fontSize: '0.76rem' }}>{block.prevHash}</code>
                      </div>
                      <div style={{ background: 'rgba(5, 10, 20, 0.5)', padding: '0.7rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.06)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.2rem' }}>BLOCK HASH (SHA-256):</div>
                        <code className="mono" style={{ color: isBroken ? '#f87171' : isVerified ? '#34d399' : 'var(--neon-cyan)', wordBreak: 'break-all', fontSize: '0.76rem' }}>
                          {block.hash}
                        </code>
                      </div>
                    </div>

                    {block.payload && Object.keys(block.payload).length > 0 && (
                      <div style={{ background: 'rgba(0, 0, 0, 0.35)', borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.78rem', border: '1px solid rgba(148, 163, 184, 0.05)' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Payload: </span>
                        <code className="mono" style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(block.payload)}</code>
                      </div>
                    )}
                  </div>

                  {/* Visual link vector to next block */}
                  {index < auditLogs.length - 1 && (
                    <div className="chain-connector" />
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
