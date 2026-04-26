import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import StoreShotStudio from './storeShots/StoreShotStudio.jsx';
import { installMobileViewportSizing } from './lib/mobileRuntime.js';
import './index.css';

const searchParams = new URLSearchParams(window.location.search);
const isStoreShotMode = searchParams.has('store-shot');

installMobileViewportSizing();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isStoreShotMode ? (
      <StoreShotStudio />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);
