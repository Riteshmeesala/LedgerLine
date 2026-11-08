import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import InactivityWatchdog from '../components/InactivityWatchdog';
import * as client from '../api/client';

describe('Feature 7: HOLDER inactivity auto-logout (UI only)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns at 9 minutes with countdown dialog and stay signed in action', () => {
    const onLogout = vi.fn();
    const user = { id: 'u1', email: 'holder@test.local', role: 'HOLDER' };

    render(<InactivityWatchdog user={user} onLogout={onLogout} />);

    // Initially no warning is visible
    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();

    // Advance 8 minutes 59 seconds
    act(() => {
      vi.advanceTimersByTime(8 * 60 * 1000 + 59 * 1000);
    });
    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();

    // Advance to exactly 9 minutes (540,000 ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Session Inactivity Warning/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stay Signed In/i })).toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('clicking Stay Signed In resets timer and hides warning dialog', () => {
    const onLogout = vi.fn();
    const user = { id: 'u1', email: 'holder@test.local', role: 'HOLDER' };

    render(<InactivityWatchdog user={user} onLogout={onLogout} />);

    // Advance to 9 minutes to show warning
    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000);
    });
    expect(screen.getByText(/Session Inactivity Warning/i)).toBeInTheDocument();

    // Click stay signed in
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Stay Signed In/i }));
    });

    // Dialog dismissed
    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();

    // Advance another 8 minutes - still no warning
    act(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });
    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('user activity before 9 minutes resets the watchdog timer', () => {
    const onLogout = vi.fn();
    const user = { id: 'u1', email: 'holder@test.local', role: 'HOLDER' };

    render(<InactivityWatchdog user={user} onLogout={onLogout} />);

    // Advance 5 minutes
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    // User moves mouse or types
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Advance another 5 minutes (total 10 min elapsed, but only 5 min since last activity)
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('automatically logs out at 10 minutes and clears in-memory token', () => {
    const onLogout = vi.fn();
    const clearTokenSpy = vi.spyOn(client, 'clearToken');
    const user = { id: 'u1', email: 'holder@test.local', role: 'HOLDER' };

    render(<InactivityWatchdog user={user} onLogout={onLogout} />);

    // Advance past 9 minutes (warning appears)
    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000);
    });
    expect(screen.getByText(/Session Inactivity Warning/i)).toBeInTheDocument();

    // Advance to 10 minutes (total 600,000 ms)
    act(() => {
      vi.advanceTimersByTime(1 * 60 * 1000);
    });

    expect(clearTokenSpy).toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalledWith('inactivity');
    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();
  });

  it('does not engage watchdog for non-HOLDER roles', () => {
    const onLogout = vi.fn();
    const adminUser = { id: 'admin1', email: 'admin@test.local', role: 'ADMIN' };

    render(<InactivityWatchdog user={adminUser} onLogout={onLogout} />);

    // Advance 12 minutes
    act(() => {
      vi.advanceTimersByTime(12 * 60 * 1000);
    });

    expect(screen.queryByText(/Session Inactivity Warning/i)).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });
});

