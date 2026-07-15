import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { AppWithErrorBoundary } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithErrorBoundary />
  </React.StrictMode>,
)
