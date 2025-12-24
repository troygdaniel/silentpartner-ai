import { useState, useEffect, useRef } from 'react'

const API_HEADERS = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
})

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('employees') // 'employees', 'settings', 'memories', 'chat'
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState({ name: '', role: '', instructions: '', model: 'gpt-4' })

  // Settings state
  const [apiKeys, setApiKeys] = useState({ has_openai_key: false, has_anthropic_key: false })
  const [keyInputs, setKeyInputs] = useState({ openai: '', anthropic: '' })
  const [savingKeys, setSavingKeys] = useState(false)

  // Chat state
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatError, setChatError] = useState(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  // Memory state
  const [memories, setMemories] = useState([])
  const [memoryForm, setMemoryForm] = useState({ content: '', employee_id: '' })
  const [showMemoryForm, setShowMemoryForm] = useState(false)
  const [editingMemory, setEditingMemory] = useState(null)

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

  const fetchApiKeys = async () => {
    try {
      const res = await fetch('/api/settings/api-keys', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setApiKeys(data)
      }
    } catch (err) {
      console.error('Failed to fetch API keys status:', err)
    }
  }

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories/all', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setMemories(data)
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err)
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
          if (data) {
            fetchEmployees()
            fetchApiKeys()
            fetchMemories()
          }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLogin = () => { window.location.href = '/api/auth/google' }
  const handleLogout = () => { localStorage.removeItem('token'); setUser(null); setEmployees([]); setMemories([]) }

  const handleAddEmployee = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/employees', { method: 'POST', headers: API_HEADERS(), body: JSON.stringify(formData) })
    if (res.ok) { setShowAddForm(false); setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' }); fetchEmployees() }
  }

  const handleUpdateEmployee = async (e) => {
    e.preventDefault()
    const res = await fetch(`/api/employees/${editingEmployee.id}`, { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(formData) })
    if (res.ok) { setEditingEmployee(null); setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' }); fetchEmployees() }
  }

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Delete this employee?')) return
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE', headers: API_HEADERS() })
    if (res.ok) fetchEmployees()
  }

  const startEdit = (emp) => {
    setEditingEmployee(emp)
    setFormData({ name: emp.name, role: emp.role || '', instructions: emp.instructions || '', model: emp.model })
    setShowAddForm(false)
  }

  const saveApiKeys = async () => {
    setSavingKeys(true)
    const body = {}
    if (keyInputs.openai) body.openai_api_key = keyInputs.openai
    if (keyInputs.anthropic) body.anthropic_api_key = keyInputs.anthropic

    const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
    if (res.ok) {
      const data = await res.json()
      setApiKeys({ has_openai_key: data.has_openai_key, has_anthropic_key: data.has_anthropic_key })
      setKeyInputs({ openai: '', anthropic: '' })
    }
    setSavingKeys(false)
  }

  const removeApiKey = async (provider) => {
    const body = provider === 'openai' ? { openai_api_key: '' } : { anthropic_api_key: '' }
    const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
    if (res.ok) {
      const data = await res.json()
      setApiKeys({ has_openai_key: data.has_openai_key, has_anthropic_key: data.has_anthropic_key })
    }
  }

  const handleAddMemory = async (e) => {
    e.preventDefault()
    const body = { content: memoryForm.content }
    if (memoryForm.employee_id) body.employee_id = memoryForm.employee_id
    const res = await fetch('/api/memories', { method: 'POST', headers: API_HEADERS(), body: JSON.stringify(body) })
    if (res.ok) {
      setShowMemoryForm(false)
      setMemoryForm({ content: '', employee_id: '' })
      fetchMemories()
    }
  }

  const handleUpdateMemory = async (e) => {
    e.preventDefault()
    const res = await fetch(`/api/memories/${editingMemory.id}`, { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify({ content: memoryForm.content }) })
    if (res.ok) {
      setEditingMemory(null)
      setMemoryForm({ content: '', employee_id: '' })
      fetchMemories()
    }
  }

  const handleDeleteMemory = async (id) => {
    if (!confirm('Delete this memory?')) return
    const res = await fetch(`/api/memories/${id}`, { method: 'DELETE', headers: API_HEADERS() })
    if (res.ok) fetchMemories()
  }

  const startEditMemory = (mem) => {
    setEditingMemory(mem)
    setMemoryForm({ content: mem.content, employee_id: mem.employee_id || '' })
    setShowMemoryForm(false)
  }

  const startChat = async (emp) => {
    setSelectedEmployee(emp)
    setMessages([])
    setChatError(null)
    setUploadedFiles([])
    setView('chat')
    // Fetch any existing files for this employee
    try {
      const res = await fetch(`/api/files/${emp.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      if (res.ok) {
        const files = await res.json()
        setUploadedFiles(files)
      }
    } catch (err) {
      console.error('Failed to fetch files:', err)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedEmployee) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/files/upload/${selectedEmployee.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      })
      if (res.ok) {
        const data = await res.json()
        setUploadedFiles([...uploadedFiles, { id: data.id, filename: data.filename, size: data.size }])
      } else {
        const err = await res.json()
        setChatError(err.detail || 'Upload failed')
      }
    } catch (err) {
      setChatError('Upload error')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteFile = async (fileId) => {
    if (!selectedEmployee) return
    try {
      const res = await fetch(`/api/files/${selectedEmployee.id}/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (res.ok) {
        setUploadedFiles(uploadedFiles.filter(f => f.id !== fileId))
      }
    } catch (err) {
      console.error('Failed to delete file:', err)
    }
  }

  const sendMessage = async () => {
    if (!chatInput.trim() || isStreaming) return

    const userMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setChatInput('')
    setIsStreaming(true)
    setChatError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({ employee_id: selectedEmployee.id, messages: newMessages })
      })

      if (!res.ok) {
        const err = await res.json()
        setChatError(err.detail || 'Chat failed')
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages([...newMessages, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) {
                setChatError(parsed.error)
              } else if (parsed.content) {
                assistantContent += parsed.content
                setMessages([...newMessages, { role: 'assistant', content: assistantContent }])
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setChatError('Connection error')
    }
    setIsStreaming(false)
  }

  if (loading) {
    return <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}><p>Loading...</p></div>
  }

  const styles = {
    input: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '80px', boxSizing: 'border-box' },
    btn: { padding: '10px 20px', fontSize: '14px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' },
    card: { background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '15px' }
  }

  // Chat View
  if (view === 'chat' && selectedEmployee) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f5' }}>
        <div style={{ padding: '15px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button onClick={() => setView('employees')} style={{ ...styles.btn, backgroundColor: '#6c757d', color: 'white', marginRight: '15px' }}>Back</button>
            <strong>{selectedEmployee.name}</strong>
            <span style={{ color: '#666', marginLeft: '10px', fontSize: '14px' }}>{selectedEmployee.role}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: '50px' }}>
              <p>Start a conversation with {selectedEmployee.name}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '15px', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '70%', padding: '12px 16px', borderRadius: '12px',
                backgroundColor: msg.role === 'user' ? '#007bff' : 'white',
                color: msg.role === 'user' ? 'white' : '#333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{msg.content}</pre>
              </div>
            </div>
          ))}
          {chatError && (
            <div style={{ padding: '15px', background: '#ffe6e6', borderRadius: '8px', color: '#cc0000', marginBottom: '15px' }}>
              {chatError}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '15px', background: 'white', borderTop: '1px solid #ddd' }}>
          {uploadedFiles.length > 0 && (
            <div style={{ maxWidth: '800px', margin: '0 auto 10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {uploadedFiles.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', background: '#e3f2fd', padding: '4px 10px', borderRadius: '15px', fontSize: '12px' }}>
                  <span style={{ marginRight: '8px' }}>{f.filename}</span>
                  <button onClick={() => handleDeleteFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '0', fontSize: '14px' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept=".txt,.md,.json,.csv,.py,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.log,.sql"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || uploading || uploadedFiles.length >= 5}
              style={{ ...styles.btn, backgroundColor: '#6c757d', color: 'white', padding: '12px', opacity: (isStreaming || uploading || uploadedFiles.length >= 5) ? 0.6 : 1 }}
              title="Upload file (max 100KB, text files only)"
            >
              {uploading ? '...' : '+'}
            </button>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              disabled={isStreaming}
              style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' }}
            />
            <button onClick={sendMessage} disabled={isStreaming || !chatInput.trim()} style={{ ...styles.btn, backgroundColor: '#007bff', color: 'white', opacity: isStreaming ? 0.6 : 1 }}>
              {isStreaming ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p style={{ textAlign: 'center', color: '#999', fontSize: '11px', margin: '8px 0 0' }}>
            {uploadedFiles.length}/5 files • Text files only (max 100KB each)
          </p>
        </div>
      </div>
    )
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', ...styles.card }}>
              <div>
                <strong>{user.name}</strong>
                <span style={{ color: '#666', marginLeft: '10px', fontSize: '14px' }}>{user.email}</span>
              </div>
              <div>
                <button onClick={() => setView('settings')} style={{ ...styles.btn, backgroundColor: view === 'settings' ? '#007bff' : '#6c757d', color: 'white' }}>Settings</button>
                <button onClick={() => setView('memories')} style={{ ...styles.btn, backgroundColor: view === 'memories' ? '#007bff' : '#6c757d', color: 'white' }}>Memories</button>
                <button onClick={() => setView('employees')} style={{ ...styles.btn, backgroundColor: view === 'employees' ? '#007bff' : '#6c757d', color: 'white' }}>Employees</button>
                <button onClick={handleLogout} style={{ ...styles.btn, backgroundColor: '#dc3545', color: 'white', marginRight: 0 }}>Sign out</button>
              </div>
            </div>

            {view === 'settings' && (
              <div style={styles.card}>
                <h2 style={{ marginTop: 0 }}>API Keys</h2>
                <p style={{ color: '#666', fontSize: '14px' }}>Add your own API keys to use AI employees. Keys are encrypted and stored securely.</p>

                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ marginBottom: '10px' }}>OpenAI API Key {apiKeys.has_openai_key && <span style={{ color: 'green' }}>✓ Configured</span>}</h4>
                  {apiKeys.has_openai_key ? (
                    <button onClick={() => removeApiKey('openai')} style={{ ...styles.btn, backgroundColor: '#dc3545', color: 'white' }}>Remove Key</button>
                  ) : (
                    <input type="password" placeholder="sk-..." value={keyInputs.openai} onChange={(e) => setKeyInputs({ ...keyInputs, openai: e.target.value })} style={styles.input} />
                  )}
                </div>

                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ marginBottom: '10px' }}>Anthropic API Key {apiKeys.has_anthropic_key && <span style={{ color: 'green' }}>✓ Configured</span>}</h4>
                  {apiKeys.has_anthropic_key ? (
                    <button onClick={() => removeApiKey('anthropic')} style={{ ...styles.btn, backgroundColor: '#dc3545', color: 'white' }}>Remove Key</button>
                  ) : (
                    <input type="password" placeholder="sk-ant-..." value={keyInputs.anthropic} onChange={(e) => setKeyInputs({ ...keyInputs, anthropic: e.target.value })} style={styles.input} />
                  )}
                </div>

                {(keyInputs.openai || keyInputs.anthropic) && (
                  <button onClick={saveApiKeys} disabled={savingKeys} style={{ ...styles.btn, backgroundColor: '#28a745', color: 'white', marginTop: '15px' }}>
                    {savingKeys ? 'Saving...' : 'Save Keys'}
                  </button>
                )}
              </div>
            )}

            {view === 'memories' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h2 style={{ margin: 0 }}>Memories</h2>
                  {!showMemoryForm && !editingMemory && (
                    <button onClick={() => setShowMemoryForm(true)} style={{ ...styles.btn, backgroundColor: '#28a745', color: 'white' }}>+ Add Memory</button>
                  )}
                </div>

                <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
                  Memories are facts your AI employees will remember. Shared memories apply to all employees. Role-specific memories only apply to one employee.
                </p>

                {(showMemoryForm || editingMemory) && (
                  <div style={styles.card}>
                    <h3 style={{ marginTop: 0 }}>{editingMemory ? 'Edit Memory' : 'Add New Memory'}</h3>
                    <form onSubmit={editingMemory ? handleUpdateMemory : handleAddMemory}>
                      <textarea
                        placeholder="What should your employees remember? (e.g., 'Our company name is Acme Corp', 'We use React and Python')"
                        value={memoryForm.content}
                        onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })}
                        style={styles.textarea}
                        required
                      />
                      {!editingMemory && (
                        <select
                          value={memoryForm.employee_id}
                          onChange={(e) => setMemoryForm({ ...memoryForm, employee_id: e.target.value })}
                          style={styles.input}
                        >
                          <option value="">Shared (all employees)</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name} only</option>
                          ))}
                        </select>
                      )}
                      <button type="submit" style={{ ...styles.btn, backgroundColor: '#007bff', color: 'white' }}>{editingMemory ? 'Save' : 'Create'}</button>
                      <button type="button" onClick={() => { setShowMemoryForm(false); setEditingMemory(null); setMemoryForm({ content: '', employee_id: '' }) }} style={{ ...styles.btn, backgroundColor: '#6c757d', color: 'white' }}>Cancel</button>
                    </form>
                  </div>
                )}

                <div>
                  {memories.length === 0 && !showMemoryForm && (
                    <div style={{ ...styles.card, textAlign: 'center', color: '#999' }}>
                      <p>No memories yet. Add some facts for your AI employees to remember.</p>
                    </div>
                  )}
                  {memories.map(mem => (
                    <div key={mem.id} style={styles.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: '0 0 10px 0' }}>{mem.content}</p>
                          <span style={{
                            fontSize: '12px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: mem.employee_id ? '#e3f2fd' : '#e8f5e9',
                            color: mem.employee_id ? '#1976d2' : '#388e3c'
                          }}>
                            {mem.employee_id ? `${mem.employee_name} only` : 'Shared'}
                          </span>
                        </div>
                        <div>
                          <button onClick={() => startEditMemory(mem)} style={{ ...styles.btn, backgroundColor: '#ffc107', color: '#333', padding: '5px 10px', fontSize: '12px' }}>Edit</button>
                          <button onClick={() => handleDeleteMemory(mem.id)} style={{ ...styles.btn, backgroundColor: '#dc3545', color: 'white', padding: '5px 10px', fontSize: '12px', marginRight: 0 }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {view === 'employees' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h2 style={{ margin: 0 }}>Your AI Employees</h2>
                  {!showAddForm && !editingEmployee && (
                    <button onClick={() => setShowAddForm(true)} style={{ ...styles.btn, backgroundColor: '#28a745', color: 'white' }}>+ Add Employee</button>
                  )}
                </div>

                {(showAddForm || editingEmployee) && (
                  <div style={styles.card}>
                    <h3 style={{ marginTop: 0 }}>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</h3>
                    <form onSubmit={editingEmployee ? handleUpdateEmployee : handleAddEmployee}>
                      <input type="text" placeholder="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={styles.input} required disabled={editingEmployee?.is_default} />
                      <input type="text" placeholder="Role (e.g., Developer, QA)" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={styles.input} />
                      <textarea placeholder="Instructions..." value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} style={styles.textarea} />
                      <select value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} style={styles.input}>
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="claude-3-opus">Claude 3 Opus</option>
                        <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                      </select>
                      <button type="submit" style={{ ...styles.btn, backgroundColor: '#007bff', color: 'white' }}>{editingEmployee ? 'Save' : 'Create'}</button>
                      <button type="button" onClick={() => { setShowAddForm(false); setEditingEmployee(null); setFormData({ name: '', role: '', instructions: '', model: 'gpt-4' }) }} style={{ ...styles.btn, backgroundColor: '#6c757d', color: 'white' }}>Cancel</button>
                    </form>
                  </div>
                )}

                <div>
                  {employees.map(emp => (
                    <div key={emp.id} style={styles.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ cursor: 'pointer' }} onClick={() => startChat(emp)}>
                          <h3 style={{ margin: '0 0 5px 0', color: '#007bff' }}>
                            {emp.name}
                            {emp.is_default && <span style={{ fontSize: '12px', background: '#007bff', color: 'white', padding: '2px 8px', borderRadius: '10px', marginLeft: '10px' }}>Default</span>}
                          </h3>
                          {emp.role && <p style={{ margin: '0 0 5px 0', color: '#666', fontSize: '14px' }}>{emp.role}</p>}
                          <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>Model: {emp.model} — Click to chat</p>
                        </div>
                        <div>
                          <button onClick={() => startChat(emp)} style={{ ...styles.btn, backgroundColor: '#007bff', color: 'white', padding: '5px 10px', fontSize: '12px' }}>Chat</button>
                          <button onClick={() => startEdit(emp)} style={{ ...styles.btn, backgroundColor: '#ffc107', color: '#333', padding: '5px 10px', fontSize: '12px' }}>Edit</button>
                          {!emp.is_default && (
                            <button onClick={() => handleDeleteEmployee(emp.id)} style={{ ...styles.btn, backgroundColor: '#dc3545', color: 'white', padding: '5px 10px', fontSize: '12px', marginRight: 0 }}>Delete</button>
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
              </>
            )}
          </div>
        ) : authStatus && (
          <div style={{ textAlign: 'center' }}>
            {authStatus.oauth_configured ? (
              <button onClick={handleLogin} style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign in with Google</button>
            ) : (
              <p style={{ color: '#999' }}>Google OAuth not configured yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
