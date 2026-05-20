import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { bootstrapTelegram } from './telegram.js'

if (typeof window !== 'undefined' && typeof window.console === 'object' && window.console) {
  for (const method of ['log', 'warn', 'error', 'info', 'debug', 'trace']) {
    window.console[method] = () => {}
  }
}

void bootstrapTelegram()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
