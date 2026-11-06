import React, { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Health check failed', err));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>LedgerLine</h1>
      <p>Move money so the books always balance and the same request never pays twice.</p>
      <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f4f8', borderRadius: '4px' }}>
        <strong>Backend Health:</strong> {health ? JSON.stringify(health) : 'Connecting...'}
      </div>
    </div>
  );
}

