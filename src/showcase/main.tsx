import React from 'react';
import ReactDOM from 'react-dom/client';
import { ShowcaseApp } from './ShowcaseApp';

const container = document.getElementById('showcase-root') || document.getElementById('root');

if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ShowcaseApp />
    </React.StrictMode>
  );
}
