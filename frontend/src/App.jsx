import { useState, useEffect } from 'react'

const API_HEADERS = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
})

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState({ name: '', role: '', instructions: '', model: 'gpt-4' })

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setEmployees(data)
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')

    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setAuthStatus(data))
      .catch(() => setAuthStatus({ oauth_configured: false }))

    if (token) {
      fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => {
          if (res.ok) return res.json()
          localStorage.removeItem('token')
          return null
        })
        .then(data => {
          setUser(data)
          if (data) fetchEmployees()
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
    setEmployees([])
  }

  const handleAddEmployee = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        setShowAddForm(false)
        setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' })
        fetchEmployees()
      }
    } catch (err) {
      console.error('Failed to add employee:', err)
    }
  }

  const handleUpdateEmployee = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        setEditingEmployee(null)
        setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' })
        fetchEmployees()
      }
    } catch (err) {
      console.error('Failed to update employee:', err)
    }
  }

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Are you sure you want to delete this employee?')) return
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: API_HEADERS()
      })
      if (res.ok) {
        fetchEmployees()
      }
    } catch (err) {
      console.error('Failed to delete employee:', err)
    }
  }

  const startEdit = (emp) => {
    setEditingEmployee(emp)
    setFormData({
      name: emp.name,
      role: emp.role || '',
      instructions: emp.instructions || '',
      model: emp.model
    })
    setShowAddForm(false)
  }

  if (loading) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  const formStyles = {
    container: { background: 'white', padding: '20px', borderRadius: '8px', marginTop: '20px', width: '100%', maxWidth: '500px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    input: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '80px', boxSizing: 'border-box' },
    button: { padding: '10px 20px', fontSize: '14px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#333', marginBottom: '0.5rem' }}>SilentPartner</h1>
          <p style={{ color: '#666' }}>Your AI consulting team, configured by you.</p>
        </div>

        {user ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '15px', borderRadius: '8px' }}>
              <div>
                <strong>{user.name}</strong>
                <span style={{ color: '#666', marginLeft: '10px', fontSize: '14px' }}>{user.email}</span>
              </div>
              <button onClick={handleLogout} style={{ ...formStyles.button, backgroundColor: '#dc3545', color: 'white' }}>
                Sign out
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, color: '#333' }}>Your AI Employees</h2>
              {!showAddForm && !editingEmployee && (
                <button onClick={() => setShowAddForm(true)} style={{ ...formStyles.button, backgroundColor: '#28a745', color: 'white' }}>
                  + Add Employee
                </button>
              )}
            </div>

            {(showAddForm || editingEmployee) && (
              <form onSubmit={editingEmployee ? handleUpdateEmployee : handleAddEmployee} style={formStyles.container}>
                <h3 style={{ marginTop: 0 }}>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</h3>
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={formStyles.input}
                  required
                  disabled={editingEmployee?.is_default}
                />
                <input
                  type="text"
                  placeholder="Role (e.g., Developer, QA, Designer)"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={formStyles.input}
                />
                <textarea
                  placeholder="Instructions for this AI employee..."
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  style={formStyles.textarea}
                />
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  style={formStyles.input}
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                </select>
                <div>
                  <button type="submit" style={{ ...formStyles.button, backgroundColor: '#007bff', color: 'white' }}>
                    {editingEmployee ? 'Save Changes' : 'Create Employee'}
                  </button>
                  <button type="button" onClick={() => { setShowAddForm(false); setEditingEmployee(null); setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' }) }} style={{ ...formStyles.button, backgroundColor: '#6c757d', color: 'white' }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
              {employees.map(emp => (
                <div key={emp.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 5px 0', color: '#333' }}>
                        {emp.name}
                        {emp.is_default && <span style={{ fontSize: '12px', background: '#007bff', color: 'white', padding: '2px 8px', borderRadius: '10px', marginLeft: '10px' }}>Default</span>}
                      </h3>
                      {emp.role && <p style={{ margin: '0 0 5px 0', color: '#666', fontSize: '14px' }}>{emp.role}</p>}
                      <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>Model: {emp.model}</p>
                    </div>
                    <div>
                      <button onClick={() => startEdit(emp)} style={{ ...formStyles.button, backgroundColor: '#ffc107', color: '#333', padding: '5px 10px', fontSize: '12px' }}>
                        Edit
                      </button>
                      {!emp.is_default && (
                        <button onClick={() => handleDeleteEmployee(emp.id)} style={{ ...formStyles.button, backgroundColor: '#dc3545', color: 'white', padding: '5px 10px', fontSize: '12px', marginRight: 0 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {emp.instructions && (
                    <p style={{ margin: '10px 0 0 0', padding: '10px', background: '#f8f9fa', borderRadius: '4px', fontSize: '13px', color: '#555' }}>
                      {emp.instructions.length > 150 ? emp.instructions.substring(0, 150) + '...' : emp.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : authStatus && (
          <div style={{ textAlign: 'center' }}>
            {authStatus.oauth_configured ? (
              <button onClick={handleLogin} style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Sign in with Google
              </button>
            ) : (
              <p style={{ color: '#999', fontSize: '14px' }}>Google OAuth not configured yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
