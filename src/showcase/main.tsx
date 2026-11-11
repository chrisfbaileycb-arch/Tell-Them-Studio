import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ShowcaseApp } from './ShowcaseApp';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

const container = document.getElementById('showcase-root') || document.getElementById('root');

if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ShowcaseApp />
    </React.StrictMode>
  );
}
