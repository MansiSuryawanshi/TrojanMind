import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import AuthGate from './components/auth/AuthGate'
import { BrightspaceProvider } from './brightspace/BrightspaceProvider'
import UserScope from './auth/UserScope'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <UserScope>
          <BrightspaceProvider>
            <App />
          </BrightspaceProvider>
        </UserScope>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
