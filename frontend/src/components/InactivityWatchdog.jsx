import React, { useState, useEffect, useRef, useCallback } from 'react';
import { clearToken } from '../api/client';
import { ShieldAlert, LogOut } from 'lucide-react';

const WARN_TIME_MS = 9 * 60 * 1000;    // 9 minutes (540,000 ms)
const LOGOUT_TIME_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms)
const TICK_INTERVAL_MS = 1000;

/**
 * InactivityWatchdog
 *
 * Feature 7: HOLDER inactivity auto-logout (UI only).
 * Monitors user interaction across standard browser events.
 * Warns at 9 minutes with a countdown modal.
 * Automatically clears in-memory tokens and logs out at 10 minutes.
 * Only engages when authenticated user role is HOLDER.
 */
export default function InactivityWatchdog({ user, onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const lastActivityRef = useRef(Date.now());
  const isEngaged = Boolean(user && user.role === 'HOLDER');

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  const handleManualLogout = useCallback(() => {
    setShowWarning(false);
    clearToken();
    if (onLogout) {
      onLogout('inactivity');
    }
  }, [onLogout]);

  useEffect(() => {
    if (!isEngaged) {
      setShowWarning(false);
      return;
    }

    lastActivityRef.current = Date.now();

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click'
    ];

    const onUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      if (elapsed >= LOGOUT_TIME_MS) {
        setShowWarning(false);
        clearToken();
        if (onLogout) {
          onLogout('inactivity');
        }
      } else if (elapsed >= WARN_TIME_MS) {
        setShowWarning(true);
        const rem = Math.max(0, Math.ceil((LOGOUT_TIME_MS - elapsed) / 1000));
        setSecondsRemaining(rem);
      } else {
        setShowWarning(false);
      }
    }, TICK_INTERVAL_MS);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      clearInterval(intervalId);
    };
  }, [isEngaged, onLogout]);

  if (!showWarning) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.5rem'
      }}
    >
      <div
        className="glass-panel"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '440px',
          width: '100%',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #fecdd3'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#fff1f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e11d48'
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Session Inactivity Warning
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Automatic safety timeout in progress
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          You have been inactive for 9 minutes. For your security, your session will automatically terminate in{' '}
          <strong style={{ color: '#e11d48' }}>{secondsRemaining}s</strong> unless you confirm your presence.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleManualLogout}
            className="btn btn-secondary"
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            <LogOut size={14} /> Log Out Now
          </button>
          <button
            type="button"
            onClick={resetActivity}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem', background: '#2563eb' }}
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}
