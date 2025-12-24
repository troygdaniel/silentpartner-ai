import { useState, useEffect, useRef } from 'react'

const API_HEADERS = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
})

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Data
  const [projects, setProjects] = useState([])
  const [employees, setEmployees] = useState([])
  const [memories, setMemories] = useState([])
  const [apiKeys, setApiKeys] = useState({ has_openai_key: false, has_anthropic_key: false })

  // Navigation
  const [activeChannel, setActiveChannel] = useState(null) // { type: 'project' | 'dm', id, name }
  const [showSettings, setShowSettings] = useState(false)

  // Chat state
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatError, setChatError] = useState(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  // Modal state
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [projectForm, setProjectForm] = useState({ name: '', description: '' })
  const [employeeForm, setEmployeeForm] = useState({ name: '', role: '', instructions: '', model: 'gpt-4' })
  const [keyInputs, setKeyInputs] = useState({ openai: '', anthropic: '' })
  const [savingKeys, setSavingKeys] = useState(false)

  // Fetch functions
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { headers: API_HEADERS() })
      if (res.ok) setProjects(await res.json())
    } catch (err) { console.error('Failed to fetch projects:', err) }
  }

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', { headers: API_HEADERS() })
      if (res.ok) setEmployees(await res.json())
    } catch (err) { console.error('Failed to fetch employees:', err) }
  }

  const fetchApiKeys = async () => {
    try {
      const res = await fetch('/api/settings/api-keys', { headers: API_HEADERS() })
      if (res.ok) setApiKeys(await res.json())
    } catch (err) { console.error('Failed to fetch API keys:', err) }
  }

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories/all', { headers: API_HEADERS() })
      if (res.ok) setMemories(await res.json())
    } catch (err) { console.error('Failed to fetch memories:', err) }
  }

  const fetchMessages = async (channel) => {
    if (!channel) return
    try {
      const endpoint = channel.type === 'project'
        ? `/api/messages/project/${channel.id}`
        : `/api/messages/dm/${channel.id}`
      const res = await fetch(endpoint, { headers: API_HEADERS() })
      if (res.ok) setMessages(await res.json())
    } catch (err) { console.error('Failed to fetch messages:', err) }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setAuthStatus(data))
      .catch(() => setAuthStatus({ oauth_configured: false }))

    if (token) {
      fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => { if (res.ok) return res.json(); localStorage.removeItem('token'); return null })
        .then(data => {
          setUser(data)
          if (data) { fetchProjects(); fetchEmployees(); fetchApiKeys(); fetchMemories() }
          setLoading(false)
        })
        .catch(() => { localStorage.removeItem('token'); setLoading(false) })
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel)
      setUploadedFiles([])
      setChatError(null)
      setShowSettings(false)
    }
  }, [activeChannel])

  const handleLogin = () => { window.location.href = '/api/auth/google' }
  const handleLogout = () => { localStorage.removeItem('token'); setUser(null); setProjects([]); setEmployees([]) }

  // Project CRUD
  const handleSaveProject = async (e) => {
    e.preventDefault()
    const method = editingProject ? 'PUT' : 'POST'
    const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects'
    const res = await fetch(url, { method, headers: API_HEADERS(), body: JSON.stringify(projectForm) })
    if (res.ok) {
      setShowProjectModal(false)
      setEditingProject(null)
      setProjectForm({ name: '', description: '' })
      fetchProjects()
    }
  }

  const handleDeleteProject = async (id) => {
    if (!confirm('Delete this project and all its messages?')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: API_HEADERS() })
    if (activeChannel?.type === 'project' && activeChannel?.id === id) setActiveChannel(null)
    fetchProjects()
  }

  // Employee CRUD
  const handleSaveEmployee = async (e) => {
    e.preventDefault()
    const method = editingEmployee ? 'PUT' : 'POST'
    const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : '/api/employees'
    const res = await fetch(url, { method, headers: API_HEADERS(), body: JSON.stringify(employeeForm) })
    if (res.ok) {
      setShowEmployeeModal(false)
      setEditingEmployee(null)
      setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' })
      fetchEmployees()
    }
  }

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Delete this employee?')) return
    await fetch(`/api/employees/${id}`, { method: 'DELETE', headers: API_HEADERS() })
    if (activeChannel?.type === 'dm' && activeChannel?.id === id) setActiveChannel(null)
    fetchEmployees()
  }

  // API Keys
  const saveApiKeys = async () => {
    setSavingKeys(true)
    const body = {}
    if (keyInputs.openai) body.openai_api_key = keyInputs.openai
    if (keyInputs.anthropic) body.anthropic_api_key = keyInputs.anthropic
    const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
    if (res.ok) {
      setApiKeys(await res.json())
      setKeyInputs({ openai: '', anthropic: '' })
    }
    setSavingKeys(false)
  }

  const removeApiKey = async (provider) => {
    const body = provider === 'openai' ? { openai_api_key: '' } : { anthropic_api_key: '' }
    const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
    if (res.ok) setApiKeys(await res.json())
  }

  // File upload for DMs
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !activeChannel || activeChannel.type !== 'dm') return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/files/upload/${activeChannel.id}`, {
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
    } catch (err) { setChatError('Upload error') }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteFile = async (fileId) => {
    if (!activeChannel || activeChannel.type !== 'dm') return
    try {
      const res = await fetch(`/api/files/${activeChannel.id}/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (res.ok) setUploadedFiles(uploadedFiles.filter(f => f.id !== fileId))
    } catch (err) { console.error('Failed to delete file:', err) }
  }

  // Chat
  const sendMessage = async () => {
    if (!chatInput.trim() || isStreaming || !activeChannel) return

    const userMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setChatInput('')
    setIsStreaming(true)
    setChatError(null)

    // Save user message
    await fetch('/api/messages', {
      method: 'POST',
      headers: API_HEADERS(),
      body: JSON.stringify({
        content: userMessage.content,
        role: 'user',
        project_id: activeChannel.type === 'project' ? activeChannel.id : null,
        employee_id: activeChannel.type === 'dm' ? activeChannel.id : null
      })
    })

    // For project channels, parse @mention to get employee
    let employeeId = activeChannel.type === 'dm' ? activeChannel.id : null
    if (activeChannel.type === 'project') {
      // Look for @mention in the message
      const mentionMatch = chatInput.match(/@(\w+)/)
      if (mentionMatch) {
        const mentionedName = mentionMatch[1].toLowerCase()
        const mentionedEmployee = employees.find(e => e.name.toLowerCase().includes(mentionedName))
        if (mentionedEmployee) employeeId = mentionedEmployee.id
      }
      // If no mention, use first employee as default
      if (!employeeId && employees.length > 0) employeeId = employees[0].id
    }

    if (!employeeId) {
      setChatError('No employee available to respond')
      setIsStreaming(false)
      return
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({
          employee_id: employeeId,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          project_id: activeChannel.type === 'project' ? activeChannel.id : null
        })
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
      setMessages([...newMessages, { role: 'assistant', content: '', employee_id: employeeId }])

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
              if (parsed.error) setChatError(parsed.error)
              else if (parsed.content) {
                assistantContent += parsed.content
                setMessages([...newMessages, { role: 'assistant', content: assistantContent, employee_id: employeeId }])
              }
            } catch {}
          }
        }
      }

      // Save assistant message
      await fetch('/api/messages', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({
          content: assistantContent,
          role: 'assistant',
          project_id: activeChannel.type === 'project' ? activeChannel.id : null,
          employee_id: employeeId
        })
      })
    } catch (err) { setChatError('Connection error') }
    setIsStreaming(false)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1d21' }}><p style={{ color: '#fff' }}>Loading...</p></div>
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1d21', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ marginBottom: '10px' }}>SilentPartner</h1>
        <p style={{ color: '#999', marginBottom: '30px' }}>Your AI consulting team, configured by you.</p>
        {authStatus?.oauth_configured ? (
          <button onClick={handleLogin} style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign in with Google</button>
        ) : (
          <p style={{ color: '#999' }}>Google OAuth not configured yet</p>
        )}
      </div>
    )
  }

  const styles = {
    sidebar: { width: '260px', background: '#1a1d21', color: '#fff', display: 'flex', flexDirection: 'column', height: '100vh' },
    sidebarHeader: { padding: '15px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' },
    sidebarSection: { padding: '10px 15px 5px', color: '#999', fontSize: '12px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    channel: { padding: '6px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
    channelActive: { background: '#1164A3' },
    addBtn: { background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', height: '100vh' },
    header: { padding: '15px 20px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    messages: { flex: 1, overflow: 'auto', padding: '20px' },
    input: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '80px', boxSizing: 'border-box' },
    btn: { padding: '8px 16px', fontSize: '14px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#fff', padding: '25px', borderRadius: '8px', width: '400px', maxWidth: '90%' }
  }

  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || 'Unknown'

  return (
    <div style={{ display: 'flex', fontFamily: 'system-ui, sans-serif', height: '100vh' }}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader} onClick={() => { setActiveChannel(null); setShowSettings(false); setMessages([]) }}>SilentPartner</div>

        {/* Projects */}
        <div style={styles.sidebarSection}>
          <span>Projects</span>
          <button onClick={() => { setShowProjectModal(true); setEditingProject(null); setProjectForm({ name: '', description: '' }) }} style={styles.addBtn}>+</button>
        </div>
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => setActiveChannel({ type: 'project', id: p.id, name: p.name })}
            onContextMenu={(e) => { e.preventDefault(); if (confirm('Delete project?')) handleDeleteProject(p.id) }}
            style={{ ...styles.channel, ...(activeChannel?.type === 'project' && activeChannel?.id === p.id ? styles.channelActive : {}) }}
          >
            <span style={{ color: '#999' }}>#</span> {p.name}
          </div>
        ))}

        {/* Direct Messages */}
        <div style={{ ...styles.sidebarSection, marginTop: '20px' }}>
          <span>Direct Messages</span>
          <button onClick={() => { setShowEmployeeModal(true); setEditingEmployee(null); setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' }) }} style={styles.addBtn}>+</button>
        </div>
        {employees.map(e => (
          <div
            key={e.id}
            onClick={() => setActiveChannel({ type: 'dm', id: e.id, name: e.name })}
            onContextMenu={(ev) => { ev.preventDefault(); if (!e.is_default && confirm('Delete employee?')) handleDeleteEmployee(e.id) }}
            style={{ ...styles.channel, ...(activeChannel?.type === 'dm' && activeChannel?.id === e.id ? styles.channelActive : {}), flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2bac76', flexShrink: 0 }}></span>
              <span style={{ fontWeight: 500 }}>{e.name}</span>
            </div>
            {e.role && <div style={{ color: '#999', fontSize: '11px', paddingLeft: '18px' }}>{e.role}</div>}
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop: 'auto', padding: '15px', borderTop: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#4285f4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px' }}>
              {user.name?.[0] || 'U'}
            </span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setShowSettings(true); setActiveChannel(null) }} style={{ ...styles.btn, flex: 1, background: '#333', color: '#fff', marginRight: 0, fontSize: '12px' }}>Settings</button>
            <button onClick={handleLogout} style={{ ...styles.btn, flex: 1, background: '#dc3545', color: '#fff', marginRight: 0, fontSize: '12px' }}>Logout</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {showSettings ? (
          <div style={{ padding: '30px', maxWidth: '600px' }}>
            <h2>Settings</h2>

            <h3>API Keys</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>Add your API keys to use AI employees.</p>

            <div style={{ marginTop: '20px' }}>
              <h4>OpenAI API Key {apiKeys.has_openai_key && <span style={{ color: 'green' }}>Configured</span>}</h4>
              {apiKeys.has_openai_key ? (
                <button onClick={() => removeApiKey('openai')} style={{ ...styles.btn, background: '#dc3545', color: '#fff' }}>Remove</button>
              ) : (
                <input type="password" placeholder="sk-..." value={keyInputs.openai} onChange={(e) => setKeyInputs({ ...keyInputs, openai: e.target.value })} style={styles.input} />
              )}
            </div>

            <div style={{ marginTop: '20px' }}>
              <h4>Anthropic API Key {apiKeys.has_anthropic_key && <span style={{ color: 'green' }}>Configured</span>}</h4>
              {apiKeys.has_anthropic_key ? (
                <button onClick={() => removeApiKey('anthropic')} style={{ ...styles.btn, background: '#dc3545', color: '#fff' }}>Remove</button>
              ) : (
                <input type="password" placeholder="sk-ant-..." value={keyInputs.anthropic} onChange={(e) => setKeyInputs({ ...keyInputs, anthropic: e.target.value })} style={styles.input} />
              )}
            </div>

            {(keyInputs.openai || keyInputs.anthropic) && (
              <button onClick={saveApiKeys} disabled={savingKeys} style={{ ...styles.btn, background: '#28a745', color: '#fff', marginTop: '15px' }}>
                {savingKeys ? 'Saving...' : 'Save Keys'}
              </button>
            )}

            <h3 style={{ marginTop: '40px' }}>Memories</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>Facts your AI employees will remember.</p>
            {memories.length === 0 ? (
              <p style={{ color: '#999' }}>No memories yet.</p>
            ) : (
              memories.map(m => (
                <div key={m.id} style={{ padding: '10px', background: '#f5f5f5', borderRadius: '4px', marginTop: '10px' }}>
                  <p style={{ margin: 0 }}>{m.content}</p>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    {m.project_name ? `Project: ${m.project_name}` : m.employee_name ? `Employee: ${m.employee_name}` : 'Shared'}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : activeChannel ? (
          <>
            <div style={styles.header}>
              <div>
                <strong>{activeChannel.type === 'project' ? '#' : ''}{activeChannel.name}</strong>
                {activeChannel.type === 'project' && <span style={{ color: '#999', marginLeft: '10px', fontSize: '14px' }}>Use @name to mention an employee</span>}
              </div>
              {activeChannel.type === 'dm' && (
                <button
                  onClick={() => { setEditingEmployee(employees.find(e => e.id === activeChannel.id)); setEmployeeForm(employees.find(e => e.id === activeChannel.id) || {}); setShowEmployeeModal(true) }}
                  style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}
                >
                  Edit Employee
                </button>
              )}
              {activeChannel.type === 'project' && (
                <button
                  onClick={() => { setEditingProject(projects.find(p => p.id === activeChannel.id)); setProjectForm(projects.find(p => p.id === activeChannel.id) || {}); setShowProjectModal(true) }}
                  style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}
                >
                  Edit Project
                </button>
              )}
            </div>

            <div style={styles.messages}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', marginTop: '50px' }}>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: msg.role === 'user' ? '#4285f4' : '#2bac76', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', flexShrink: 0 }}>
                    {msg.role === 'user' ? (user.name?.[0] || 'U') : (msg.employee_id ? getEmployeeName(msg.employee_id)?.[0] : 'A')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {msg.role === 'user' ? user.name : (msg.employee_id ? getEmployeeName(msg.employee_id) : 'Assistant')}
                    </div>
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

            <div style={{ padding: '15px', borderTop: '1px solid #ddd' }}>
              {activeChannel.type === 'dm' && uploadedFiles.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {uploadedFiles.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', background: '#e3f2fd', padding: '4px 10px', borderRadius: '15px', fontSize: '12px' }}>
                      <span style={{ marginRight: '8px' }}>{f.filename}</span>
                      <button onClick={() => handleDeleteFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '0', fontSize: '14px' }}>x</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                {activeChannel.type === 'dm' && (
                  <>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".txt,.md,.json,.csv,.py,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.log,.sql" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || uploading || uploadedFiles.length >= 5}
                      style={{ ...styles.btn, background: '#6c757d', color: '#fff', opacity: (isStreaming || uploading || uploadedFiles.length >= 5) ? 0.6 : 1 }}
                    >
                      {uploading ? '...' : '+'}
                    </button>
                  </>
                )}
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={activeChannel.type === 'project' ? 'Message #' + activeChannel.name + ' (use @name to mention)' : 'Message ' + activeChannel.name}
                  disabled={isStreaming}
                  style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                />
                <button onClick={sendMessage} disabled={isStreaming || !chatInput.trim()} style={{ ...styles.btn, background: '#007bff', color: '#fff', opacity: isStreaming ? 0.6 : 1 }}>
                  {isStreaming ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '40px' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h1 style={{ color: '#333', marginBottom: '8px' }}>Welcome to SilentPartner</h1>
              <p style={{ color: '#666', marginBottom: '40px' }}>Your AI consulting team, configured by you.</p>

              {/* Team Section */}
              <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: '#333', margin: 0 }}>Your Team</h2>
                  <button
                    onClick={() => { setShowEmployeeModal(true); setEditingEmployee(null); setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' }) }}
                    style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    + Add Employee
                  </button>
                </div>

                {employees.length === 0 ? (
                  <div style={{ padding: '40px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'center', color: '#666' }}>
                    <p style={{ margin: 0 }}>No employees yet. Add your first AI team member to get started.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {employees.map(e => (
                      <div
                        key={e.id}
                        style={{
                          background: '#fff',
                          border: '1px solid #e0e0e0',
                          borderRadius: '8px',
                          padding: '20px',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.2s, border-color 0.2s'
                        }}
                        onClick={() => setActiveChannel({ type: 'dm', id: e.id, name: e.name })}
                        onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; ev.currentTarget.style.borderColor = '#007bff' }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = '#e0e0e0' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            background: '#2bac76',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}>
                            {e.name[0]?.toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '16px', color: '#333', marginBottom: '4px' }}>{e.name}</div>
                            <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>{e.role || 'No role assigned'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                background: e.model?.startsWith('claude') ? '#f3e5f5' : '#e3f2fd',
                                color: e.model?.startsWith('claude') ? '#7b1fa2' : '#1565c0',
                                borderRadius: '12px'
                              }}>
                                {e.model || 'gpt-4'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setEditingEmployee(e); setEmployeeForm(e); setShowEmployeeModal(true) }}
                            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '4px', fontSize: '18px' }}
                            title="Edit employee"
                          >
                            ✎
                          </button>
                        </div>
                        {e.instructions && (
                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f0f0', color: '#888', fontSize: '13px', lineHeight: 1.4 }}>
                            {e.instructions.length > 100 ? e.instructions.slice(0, 100) + '...' : e.instructions}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{employees.length}</div>
                  <div style={{ color: '#666', fontSize: '14px' }}>Team Members</div>
                </div>
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{projects.length}</div>
                  <div style={{ color: '#666', fontSize: '14px' }}>Projects</div>
                </div>
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{memories.length}</div>
                  <div style={{ color: '#666', fontSize: '14px' }}>Memories</div>
                </div>
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: apiKeys.has_openai_key || apiKeys.has_anthropic_key ? '#2bac76' : '#dc3545' }}>
                    {apiKeys.has_openai_key || apiKeys.has_anthropic_key ? '✓' : '!'}
                  </div>
                  <div style={{ color: '#666', fontSize: '14px' }}>API Keys</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div style={styles.modal} onClick={() => setShowProjectModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editingProject ? 'Edit Project' : 'New Project'}</h3>
            <form onSubmit={handleSaveProject}>
              <input type="text" placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} style={styles.input} required />
              <textarea placeholder="Description (optional)" value={projectForm.description || ''} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} style={styles.textarea} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ ...styles.btn, background: '#007bff', color: '#fff' }}>Save</button>
                <button type="button" onClick={() => setShowProjectModal(false)} style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div style={styles.modal} onClick={() => setShowEmployeeModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editingEmployee ? 'Edit Employee' : 'New Employee'}</h3>
            <form onSubmit={handleSaveEmployee}>
              <input type="text" placeholder="Name" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} style={styles.input} required disabled={editingEmployee?.is_default} />
              <input type="text" placeholder="Role (e.g., Developer, QA)" value={employeeForm.role || ''} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })} style={styles.input} />
              <textarea placeholder="Instructions" value={employeeForm.instructions || ''} onChange={(e) => setEmployeeForm({ ...employeeForm, instructions: e.target.value })} style={styles.textarea} />
              <select value={employeeForm.model || 'gpt-4'} onChange={(e) => setEmployeeForm({ ...employeeForm, model: e.target.value })} style={styles.input}>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              </select>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ ...styles.btn, background: '#007bff', color: '#fff' }}>Save</button>
                <button type="button" onClick={() => setShowEmployeeModal(false)} style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
