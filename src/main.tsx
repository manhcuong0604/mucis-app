import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Tự động thêm header bypass-tunnel-reminder: true cho mọi request ngầm khi chạy qua Localtunnel
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let [resource, config] = args;
    config = config || {};
    const headers = new Headers(config.headers || {});
    if (!headers.has('bypass-tunnel-reminder')) {
      headers.set('bypass-tunnel-reminder', 'true');
    }
    config.headers = headers;
    return originalFetch(resource, config);
  };
}

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
