import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { formatINR } from '../utils/money';
import { 
  Activity, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, 
  Link2, AlertTriangle, Layers, Lock, Cpu, Database, Search,
  Download, Copy, Check, Filter, Sparkles, ArrowUpRight, ArrowDownLeft, X, Key, GitCommit
} from 'lucide-react';

/**
 * Auditor Dashboard Component.
 *
 * Clean, light-theme audit and integrity monitoring console.
 */
export default function AuditorDashboard() {
  const [conservation, setConservation] = useState(null);
  const [conservationLoading, setConservationLoading] = useState(true);

  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [copiedHash, setCopiedHash] = useState(null);

  // Feature 1: Transfer Trace State
  const [traceId, setTraceId] = useState('');
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);
  const [traceResult, setTraceResult] = useState(null);
  const [copiedTraceId, setCopiedTraceId] = useState(null);

  const handleTraceTransfer = async (e, idOverride = null) => {
    if (e) e.preventDefault();
    const idToSearch = (idOverride || traceId).trim();
    if (!idToSearch) return;
    setTraceLoading(true);
    setTraceError(null);
    setTraceResult(null);
    try {
      const res = await apiClient(`/api/audit/transfers/${idToSearch}`);
      setTraceResult(res);
      setTraceId(idToSearch);
    } catch (err) {
      setTraceError(err.detail || err.message || 'Transfer not found or invalid format.');
    } finally {
      setTraceLoading(false);
    }
  };

  const handleClearTrace = () => {
    setTraceId('');
    setTraceResult(null);
    setTraceError(null);
  };

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
      const data = await apiClient('/api/audit?page=0&size=50');
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

  const handleCopyHash = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleExportAuditProof = () => {
    if (auditLogs.length === 0) return;
    const proofDoc = {
      verifiedAt: new Date().toISOString(),
      conservationSummary: conservation,
      chainVerification: verificationResult,
      totalBlocks: auditLogs.length,
      genesisBlockSeq: auditLogs[0]?.seq,
      headBlockSeq: auditLogs[auditLogs.length - 1]?.seq,
      blocks: auditLogs
    };
    const blob = new Blob([JSON.stringify(proofDoc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledgerline_audit_proof_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter((block) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      block.seq.toString().includes(q) ||
      (block.action && block.action.toLowerCase().includes(q)) ||
      (block.entityType && block.entityType.toLowerCase().includes(q)) ||
      (block.entityId && block.entityId.toLowerCase().includes(q)) ||
      (block.hash && block.hash.toLowerCase().includes(q));
    const matchesAction = actionFilter === 'ALL' || block.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const uniqueActions = ['ALL', ...new Set(auditLogs.map(l => l.action).filter(Boolean))];

  return (
    <div className="view-container">
      {/* Header */}
      <div className="glass-panel" style={{ marginBottom: '2rem', padding: '2rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="live-beacon" />
              <span className="hud-tag cyan">Auditor Console</span>
              <span className="hud-tag emerald">Cryptographic Proofs Active</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              System Integrity & Conservation
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: '0.2rem' }}>
              Verify cryptographic audit chain blocks and real-time double-entry conservation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', width: 'auto' }}>
            <button onClick={() => { fetchConservation(); fetchAuditLogs(); }} className="btn btn-secondary">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={handleExportAuditProof} disabled={auditLogs.length === 0} className="btn btn-secondary">
              <Download size={15} /> Export Audit Proof
            </button>
            <button
              onClick={verifyAuditChain}
              disabled={verifying}
              className="btn btn-primary"
              style={{ minWidth: 'min(100%, 180px)' }}
            >
              <ShieldCheck size={18} />
              {verifying ? 'Verifying Hashes...' : 'Verify Audit Trail'}
            </button>
          </div>
        </div>

        {/* Technical Safety Features */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid #f1f5f9' }}>
          <div className="hud-tag emerald">
            <Lock size={12} /> Immutable Append-Only Database Triggers
          </div>
          <div className="hud-tag cyan">
            <Cpu size={12} /> Concurrency Mutex Protected
          </div>
          <div className="hud-tag violet">
            <Database size={12} /> Double-Entry Deferred Commit Checks
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '0.85rem 1.1rem', marginBottom: '1.8rem', color: '#be123c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{error}</span>
          </div>
          <button
            onClick={() => { setError(null); fetchConservation(); fetchAuditLogs(); }}
            className="btn btn-secondary btn-sm"
            style={{ borderColor: '#fca5a5', color: '#be123c', background: '#ffffff', padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          style={{
            padding: '1.5rem',
            marginBottom: '2rem',
            borderRadius: '14px',
            border: verificationResult.valid ? '1px solid #a7f3d0' : '1px solid #fecdd3',
            background: verificationResult.valid ? '#ecfdf5' : '#fff1f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.2rem',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {verificationResult.valid ? (
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                <CheckCircle2 size={28} />
              </div>
            ) : (
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ffe4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                <ShieldAlert size={28} />
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: verificationResult.valid ? '#065f46' : '#9f1239' }}>
                {verificationResult.valid ? 'Cryptographic Hash Chain Valid & Untampered' : 'Integrity Issue Detected'}
              </h2>
              <p style={{ fontSize: '0.88rem', color: verificationResult.valid ? '#047857' : '#be123c', marginTop: '0.15rem' }}>
                {verificationResult.valid
                  ? `All ${verificationResult.checkedRows} sequential blocks verified from genesis (SHA-256 linear chain unbroken).`
                  : `Integrity check failed at sequence #${verificationResult.firstBrokenSeq}.`}
              </p>
            </div>
          </div>

          <span className={`badge ${verificationResult.valid ? 'badge-emerald' : 'badge-crimson'}`} style={{ fontSize: '0.86rem', padding: '0.45rem 0.9rem' }}>
            {verificationResult.valid ? 'CHAIN 100% VERIFIED' : `BROKEN AT #${verificationResult.firstBrokenSeq}`}
          </span>
        </div>
      )}

      {/* Conservation Meter */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <Layers size={22} style={{ color: '#2563eb' }} />
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Double-Entry Balance Conservation
              </h2>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Fundamental Rule: Total Debits + Total Credits = 0 (Global Zero-Sum)
              </span>
            </div>
          </div>

          {conservation && (
            <span className={`badge ${conservation.healthy ? 'badge-emerald' : 'badge-crimson'}`} style={{ fontSize: '0.84rem', padding: '0.35rem 0.8rem' }}>
              {conservation.healthy ? 'ZERO-SUM PRESERVED' : 'INVARIANT VIOLATED'}
            </span>
          )}
        </div>

        {conservationLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Calculating global balance conservation...
          </div>
        ) : conservation ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '1rem' }}>
            {/* Metric 1 */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                Sum of All Transaction Entries
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 800, color: conservation.sumOfEntries === 0 ? '#059669' : '#e11d48' }}>
                {formatINR(conservation.sumOfEntries)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.4rem' }}>
                Credits and debits strictly cancel to 0 paise.
              </div>
            </div>

            {/* Metric 2 */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                Sum of All Account Balances
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 800, color: conservation.sumOfBalances === 0 ? '#059669' : '#e11d48' }}>
                {formatINR(conservation.sumOfBalances)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.4rem' }}>
                Customer balances offset against CASH_IN_OUT node.
              </div>
            </div>

            {/* Metric 3 */}
            <div className="stat-tile">
              <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                Imbalanced Transfers
              </div>
              <div className="tabular-nums" style={{ fontSize: '1.8rem', fontWeight: 800, color: conservation.imbalancedTransferCount === 0 ? '#059669' : '#e11d48' }}>
                {conservation.imbalancedTransferCount}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.4rem' }}>
                Transfers where debits don't equal credits.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Feature 1: AUDITOR Transfer Trace & Forensic Search */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <GitCommit size={22} style={{ color: '#0284c7' }} />
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Auditor Transfer Trace & Forensic Drill-Down
              </h2>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Trace any transfer ID across bilateral ledger journal entries and cryptographic audit hash blocks
              </span>
            </div>
          </div>
          <span className="hud-tag cyan">Auditor & Admin Only</span>
        </div>

        {/* Search Input Box */}
        <form onSubmit={handleTraceTransfer} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 280px)' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Paste Transfer UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)..."
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>
          <button
            type="submit"
            disabled={traceLoading || !traceId.trim()}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.25rem' }}
          >
            {traceLoading ? 'Tracing...' : 'Trace Transfer'}
          </button>
          {(traceResult || traceError || traceId) && (
            <button
              type="button"
              onClick={handleClearTrace}
              className="btn btn-secondary"
              style={{ padding: '0.55rem 1rem' }}
            >
              <X size={15} /> Clear
            </button>
          )}
        </form>

        {/* Quick-Pick recent transfers from loaded audit blocks if available */}
        {auditLogs.some(l => l.action === 'TRANSFER' || l.action === 'DEPOSIT' || l.action === 'WITHDRAWAL') && !traceResult && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b', marginBottom: '1rem' }}>
            <span>Quick-trace recent:</span>
            {auditLogs
              .filter(l => l.entityType === 'TRANSFER' && l.entityId)
              .slice(0, 3)
              .map(l => (
                <button
                  key={l.seq}
                  type="button"
                  onClick={(e) => handleTraceTransfer(e, l.entityId)}
                  className="badge badge-cyan"
                  style={{ cursor: 'pointer', fontFamily: 'monospace', border: '1px solid #bae6fd' }}
                >
                  {l.entityId.slice(0, 8)}... ({l.action})
                </button>
              ))}
          </div>
        )}

        {/* Error Message */}
        {traceError && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '0.85rem 1.1rem', color: '#be123c', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{traceError}</span>
          </div>
        )}

        {/* Trace Result Detail Card */}
        {traceResult && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginTop: '1rem' }}>
            {/* Transfer Intent Meta Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.2rem', marginBottom: '1.2rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span className={`badge ${traceResult.transfer.kind === 'DEPOSIT' ? 'badge-emerald' : traceResult.transfer.kind === 'WITHDRAWAL' ? 'badge-amber' : 'badge-cyan'}`}>
                    {traceResult.transfer.kind}
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    {formatINR(traceResult.transfer.amount)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'monospace', fontSize: '0.82rem', color: '#334155' }}>
                  <span>ID: {traceResult.transfer.id}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(traceResult.transfer.id); setCopiedTraceId(traceResult.transfer.id); setTimeout(() => setCopiedTraceId(null), 2000); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    {copiedTraceId === traceResult.transfer.id ? <Check size={14} style={{ color: '#059669' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748b' }}>
                <div>Initiated by: <code style={{ color: '#0f172a' }}>{traceResult.transfer.initiatedBy?.slice(0, 8)}...</code></div>
                <div>Idempotency Key: <code style={{ color: '#0f172a' }}>{traceResult.transfer.idempotencyKey}</code></div>
                <div>Settled: {new Date(traceResult.transfer.createdAt).toLocaleString()}</div>
              </div>
            </div>

            {/* Bilateral Double-Entry Journal Table */}
            <div style={{ marginBottom: '1.4rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} style={{ color: '#2563eb' }} /> Symmetric Double-Entry Journal
              </h3>
              <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Entry ID</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Account ID</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Signed Amount</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Balance After</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceResult.entries.map((entry) => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'monospace' }}>#{entry.id}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'monospace' }}>{entry.accountId}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700, color: entry.amount >= 0 ? '#059669' : '#dc2626' }}>
                          {entry.amount >= 0 ? `+${formatINR(entry.amount)}` : `-${formatINR(Math.abs(entry.amount))}`}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{formatINR(entry.balanceAfter)}</td>
                        <td style={{ padding: '0.6rem 0.8rem', color: '#64748b' }}>{new Date(entry.createdAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Linked Cryptographic Audit Log Entries */}
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Link2 size={16} style={{ color: '#7c3aed' }} /> Linked Cryptographic Audit Receipt(s)
              </h3>
              {traceResult.auditEntries.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>No audit rows explicitly linked.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {traceResult.auditEntries.map((a) => (
                    <div key={a.seq} style={{ background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '0.8rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="badge badge-violet" style={{ fontFamily: 'monospace' }}>Block #{a.seq}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>{a.action}</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>by {a.actorRole} ({a.actorId?.slice(0, 8)}...)</span>
                        </div>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{new Date(a.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.4rem', fontFamily: 'monospace', fontSize: '0.74rem', color: '#475569' }}>
                        <div style={{ wordBreak: 'break-all' }}>
                          <span style={{ color: '#94a3b8' }}>Prev: </span>{a.prevHash}
                        </div>
                        <div style={{ wordBreak: 'break-all' }}>
                          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Hash: </span>{a.hash}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hash-Chain Visualizer */}
      <div className="glass-panel" style={{ padding: '2rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <Link2 size={22} style={{ color: '#7c3aed' }} />
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Cryptographic Audit Log Visualizer
              </h2>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Every event is cryptographically hashed with the previous block (SHA-256 linear chain)
              </span>
            </div>
          </div>

          <span className="hud-tag violet">
            Tamper-Evident Trail
          </span>
        </div>

        {logsLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading audit blocks...
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
            No audit records found yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {auditLogs.map((block, index) => {
              const isBroken = verificationResult && !verificationResult.valid && verificationResult.firstBrokenSeq === block.seq;
              const isVerified = verificationResult && verificationResult.valid;

              return (
                <div key={block.seq}>
                  <div
                    className="stat-tile"
                    style={{
                      background: isBroken ? '#fff1f2' : isVerified ? '#f0fdf4' : '#ffffff',
                      border: isBroken ? '1px solid #fecdd3' : isVerified ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                      padding: '1.2rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>BLOCK #{block.seq}</span>
                        <span className="badge badge-violet">{block.action}</span>
                        <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {block.entityType}: <code className="mono" style={{ color: '#0f172a' }}>{block.entityId}</code>
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                        {new Date(block.createdAt).toISOString()}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '0.75rem', fontSize: '0.8rem', marginBottom: '0.8rem' }}>
                      <div style={{ background: '#f8fafc', padding: '0.7rem 0.9rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>PREVIOUS HASH:</div>
                        <code className="mono" style={{ color: '#334155', wordBreak: 'break-all', fontSize: '0.75rem' }}>{block.prevHash}</code>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '0.7rem 0.9rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>BLOCK HASH (SHA-256):</div>
                        <code className="mono" style={{ color: isBroken ? '#be123c' : isVerified ? '#047857' : '#2563eb', wordBreak: 'break-all', fontSize: '0.75rem', fontWeight: 600 }}>
                          {block.hash}
                        </code>
                      </div>
                    </div>

                    {block.payload && Object.keys(block.payload).length > 0 && (
                      <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Payload: </span>
                        <code className="mono" style={{ color: '#334155' }}>{JSON.stringify(block.payload)}</code>
                      </div>
                    )}
                  </div>

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
