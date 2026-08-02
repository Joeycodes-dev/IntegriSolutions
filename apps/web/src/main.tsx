import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './lib/AuthContext';
import { parseVerificationTokenFromHash } from './lib/verificationRoute';
import { PublicVerificationPage } from './components/public/PublicVerificationPage';

const verificationToken = parseVerificationTokenFromHash(window.location.hash);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {verificationToken ? (
      <PublicVerificationPage token={verificationToken} />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
