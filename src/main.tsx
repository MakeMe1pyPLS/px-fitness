import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import { installMotionTokens } from './lib/motion';
import { cloud } from './components/core';
import { parseAuthHash } from './lib/cloud';
import { cloudEnabled } from './config';
import { linkResult } from './linkResult';

installMotionTokens();

// Email links (confirm sign-up, reset password) arrive as #access_token=…
// Handle them before the hash router sees the URL, then land on the You tab.
if (cloudEnabled()) {
  const link = parseAuthHash(location.hash);
  if (link) {
    history.replaceState(null, '', location.pathname + location.search + '#you');
    if (link.error) linkResult.error = link.error;
    else if (link.tokens) {
      linkResult.type = link.tokens.type;
      void cloud.acceptLink(link.tokens).catch(() => { linkResult.error = 'Couldn’t finish signing in. Try again.'; });
    }
  } else void cloud.resume();
  addEventListener('pagehide', () => { void cloud.flush(); });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
