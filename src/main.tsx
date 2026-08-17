import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { RolePreviewProvider } from '@/context/RolePreviewContext';
import { ToastProvider } from '@/context/ToastContext';
import { UIProvider } from '@/context/UIContext';
import { ThemeProvider } from '@/context/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <DataProvider>
              <RolePreviewProvider>
                <UIProvider>
                  <App />
                </UIProvider>
              </RolePreviewProvider>
            </DataProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
