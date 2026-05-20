
import React from 'react';
import ReactDOM from 'react-dom/client';

// Global Fetch Interceptor for Capacitor Mobile App to route API requests to production server
const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  let url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  
  if (url.startsWith('/api/')) {
    url = 'https://gg.modvc.org' + url;
  } else if (url.startsWith('http://localhost/api/') || url.startsWith('capacitor://localhost/api/')) {
    url = url.replace(/^(http|capacitor):\/\/localhost/, 'https://gg.modvc.org');
  }

  if (typeof input === 'string') {
    return originalFetch(url, init);
  } else if (input instanceof URL) {
    return originalFetch(new URL(url), init);
  } else {
    const newRequest = new Request(url, input);
    return originalFetch(newRequest, init);
  }
};

import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
