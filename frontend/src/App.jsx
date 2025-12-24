import { useState, useEffect } from 'react'

function App() {
  const [authStatus, setAuthStatus] = useState(null)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setAuthStatus(data))
      .catch(() => setAuthStatus({ oauth_configured: false }))
  }, [])

  const handleLogin = () => {
    window.location.href = '/api/auth/google'
  }

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      margin: 0,
      backgroundColor: '#f5f5f5'
    }}>
      <h1 style={{ color: '#333', marginBottom: '0.5rem' }}>SilentPartner</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Your AI consulting team, configured by you.</p>

      {authStatus && (
        <div style={{ textAlign: 'center' }}>
          {authStatus.oauth_configured ? (
            <button
              onClick={handleLogin}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Sign in with Google
            </button>
          ) : (
            <p style={{ color: '#999', fontSize: '14px' }}>
              Google OAuth not configured yet
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default App
