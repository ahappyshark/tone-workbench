import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ParamRegistryProvider } from './context/ParamRegistry.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ParamRegistryProvider>
      <App />
    </ParamRegistryProvider>
  </StrictMode>,
)
