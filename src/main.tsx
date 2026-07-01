import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppDataProvider } from './store/appData';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RequireAuth>
          <AppDataProvider>
            <App />
          </AppDataProvider>
        </RequireAuth>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
