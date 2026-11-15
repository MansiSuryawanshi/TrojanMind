import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import AuthGate from './components/auth/AuthGate'
import { BrightspaceProvider } from './brightspace/BrightspaceProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <BrightspaceProvider>
          <App />
        </BrightspaceProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
