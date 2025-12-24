import { useState, useEffect } from 'react'

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')

    // Check auth status
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setAuthStatus(data))
      .catch(() => setAuthStatus({ oauth_configured: false }))

    // If we have a token, fetch user info
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) return res.json()
          // Token invalid, remove it
          localStorage.removeItem('token')
          return null
        })
        .then(data => {
          setUser(data)
          setLoading(false)
        })
        .catch(() => {
          localStorage.removeItem('token')
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = () => {
    window.location.href = '/api/auth/google'
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
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

      {user ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#333', marginBottom: '1rem' }}>
            Welcome, <strong>{user.name}</strong>
          </p>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '1rem' }}>
            {user.email}
          </p>
          <button
            onClick={handleLogout}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sign out
          </button>
        </div>
      ) : authStatus && (
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
