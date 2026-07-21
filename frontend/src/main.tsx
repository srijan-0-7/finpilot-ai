import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { AuthGate } from './components/Auth/AuthGate';
import { trackVisit } from './services/api';

// Fire-and-forget visit tracking — counts every page load regardless of
// login state, so "how many people have visited" isn't limited to just
// people who signed up.
trackVisit();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ThemeProvider>
  </React.StrictMode>,
);
