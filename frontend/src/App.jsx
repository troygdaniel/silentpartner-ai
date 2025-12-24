import { useState, useEffect, useRef } from 'react'

const API_HEADERS = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
})

// Retry helper with exponential backoff
const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  let lastError
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.ok || res.status < 500) return res // Don't retry client errors
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)) // 1s, 2s, 4s
    }
  }
  throw lastError
}

// Toast notification component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: bgColor,
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '400px',
      animation: 'slideIn 0.3s ease'
    }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px', padding: 0 }}>×</button>
    </div>
  )
}

// Estimate token count (rough approximation: ~4 chars per token for English)
function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Instruction templates for common employee roles
const INSTRUCTION_TEMPLATES = {
  '': { name: 'Custom (no template)', instructions: '' },
  'developer': {
    name: 'Software Developer',
    instructions: `You are an expert software developer. You write clean, maintainable, and well-documented code. When helping with code:
- Explain your reasoning and approach
- Follow best practices and design patterns
- Consider edge cases and error handling
- Suggest improvements when appropriate
- Use clear variable names and add comments for complex logic`
  },
  'writer': {
    name: 'Content Writer',
    instructions: `You are a skilled content writer. You create engaging, clear, and well-structured content. When writing:
- Match the requested tone and style
- Use clear, concise language
- Structure content with headings and bullet points when appropriate
- Proofread for grammar and clarity
- Consider the target audience`
  },
  'analyst': {
    name: 'Data Analyst',
    instructions: `You are an analytical data expert. You help interpret data and provide insights. When analyzing:
- Look for patterns, trends, and anomalies
- Present findings clearly with supporting evidence
- Create summaries and visualizations when helpful
- Ask clarifying questions about data sources
- Consider statistical significance and limitations`
  },
  'researcher': {
    name: 'Research Assistant',
    instructions: `You are a thorough research assistant. You help gather, organize, and synthesize information. When researching:
- Provide comprehensive yet focused information
- Cite sources when possible
- Distinguish between facts and opinions
- Organize findings in a logical structure
- Highlight key takeaways and implications`
  },
  'strategist': {
    name: 'Business Strategist',
    instructions: `You are a strategic business advisor. You help with planning, decision-making, and problem-solving. When advising:
- Consider multiple perspectives and options
- Analyze risks and opportunities
- Provide actionable recommendations
- Support advice with reasoning
- Consider both short-term and long-term implications`
  },
  'editor': {
    name: 'Editor & Proofreader',
    instructions: `You are a meticulous editor and proofreader. You help improve and polish written content. When editing:
- Fix grammar, spelling, and punctuation errors
- Improve clarity and readability
- Maintain the author's voice and intent
- Suggest structural improvements
- Explain significant changes you make`
  }
}

// Simple markdown-like rendering for AI responses
function renderMarkdown(text) {
  if (!text) return null
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
      const lang = match?.[1] || ''
      const code = match?.[2] || part.slice(3, -3)
      return (
        <pre key={i} style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '6px', overflow: 'auto', fontSize: '13px', margin: '8px 0' }}>
          {lang && <div style={{ color: '#888', fontSize: '11px', marginBottom: '8px' }}>{lang}</div>}
          <code>{code}</code>
        </pre>
      )
    }
    // Handle inline code
    const inlineCodeParts = part.split(/(`[^`]+`)/g)
    return (
      <span key={i}>
        {inlineCodeParts.map((p, j) => {
          if (p.startsWith('`') && p.endsWith('`')) {
            return <code key={j} style={{ background: '#f1f1f1', padding: '2px 6px', borderRadius: '3px', fontSize: '13px' }}>{p.slice(1, -1)}</code>
          }
          // Handle bold
          const boldParts = p.split(/(\*\*[^*]+\*\*)/g)
          return boldParts.map((bp, k) => {
            if (bp.startsWith('**') && bp.endsWith('**')) {
              return <strong key={`${j}-${k}`}>{bp.slice(2, -2)}</strong>
            }
            return bp
          })
        })}
      </span>
    )
  })
}

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Toast state
  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'info') => setToast({ message, type })

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
  const [editingMessage, setEditingMessage] = useState(null)
  const [editMessageContent, setEditMessageContent] = useState('')
  const [filePreview, setFilePreview] = useState(null) // { file, content, name }
  const [freshContextFrom, setFreshContextFrom] = useState(null) // message index to start fresh from

  // Modal state
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editingProject, setEditingProject] = useState(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [projectForm, setProjectForm] = useState({ name: '', description: '', status: 'active' })
  const [employeeForm, setEmployeeForm] = useState({ name: '', role: '', instructions: '', model: 'gpt-4' })
  const [keyInputs, setKeyInputs] = useState({ openai: '', anthropic: '' })
  const [savingKeys, setSavingKeys] = useState(false)
  const [newMemory, setNewMemory] = useState({ content: '', employee_id: '', project_id: '' })
  const [savingMemory, setSavingMemory] = useState(false)
  const [memorySearch, setMemorySearch] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)

  // Fetch functions with retry logic
  const fetchProjects = async () => {
    try {
      const res = await fetchWithRetry('/api/projects', { headers: API_HEADERS() })
      if (res.ok) setProjects(await res.json())
    } catch (err) { console.error('Failed to fetch projects:', err); showToast('Failed to load projects', 'error') }
  }

  const fetchEmployees = async () => {
    try {
      const res = await fetchWithRetry('/api/employees', { headers: API_HEADERS() })
      if (res.ok) setEmployees(await res.json())
    } catch (err) { console.error('Failed to fetch employees:', err); showToast('Failed to load employees', 'error') }
  }

  const fetchApiKeys = async () => {
    try {
      const res = await fetchWithRetry('/api/settings/api-keys', { headers: API_HEADERS() })
      if (res.ok) setApiKeys(await res.json())
    } catch (err) { console.error('Failed to fetch API keys:', err) }
  }

  const fetchMemories = async () => {
    try {
      const res = await fetchWithRetry('/api/memories/all', { headers: API_HEADERS() })
      if (res.ok) setMemories(await res.json())
    } catch (err) { console.error('Failed to fetch memories:', err) }
  }

  const fetchMessages = async (channel) => {
    if (!channel) return
    try {
      const endpoint = channel.type === 'project'
        ? `/api/messages/project/${channel.id}`
        : `/api/messages/dm/${channel.id}`
      const res = await fetchWithRetry(endpoint, { headers: API_HEADERS() })
      if (res.ok) setMessages(await res.json())
    } catch (err) { console.error('Failed to fetch messages:', err); showToast('Failed to load messages', 'error') }
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

  // Fetch DM files from server
  const fetchDMFiles = async (employeeId) => {
    try {
      const res = await fetch(`/api/files/${employeeId}`, { headers: API_HEADERS() })
      if (res.ok) setUploadedFiles(await res.json())
    } catch (err) { console.error('Failed to fetch files:', err) }
  }

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel)
      if (activeChannel.type === 'dm') {
        fetchDMFiles(activeChannel.id)
      } else {
        setUploadedFiles([])
      }
      setChatError(null)
      setShowSettings(false)
      setFreshContextFrom(null) // Reset fresh context when switching channels
    }
  }, [activeChannel])

  const handleLogin = () => { window.location.href = '/api/auth/google' }
  const handleLogout = () => { localStorage.removeItem('token'); setUser(null); setProjects([]); setEmployees([]) }

  // Project CRUD
  const handleSaveProject = async (e) => {
    e.preventDefault()
    const method = editingProject ? 'PUT' : 'POST'
    const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects'
    try {
      const res = await fetch(url, { method, headers: API_HEADERS(), body: JSON.stringify(projectForm) })
      if (res.ok) {
        setShowProjectModal(false)
        setEditingProject(null)
        setProjectForm({ name: '', description: '' })
        fetchProjects()
        showToast(editingProject ? 'Project updated' : 'Project created', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to save project', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  const handleDeleteProject = async (id) => {
    if (!confirm('Delete this project and all its messages?')) return
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: API_HEADERS() })
      if (res.ok) {
        if (activeChannel?.type === 'project' && activeChannel?.id === id) setActiveChannel(null)
        fetchProjects()
        showToast('Project deleted', 'success')
      } else {
        showToast('Failed to delete project', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Employee CRUD
  const handleSaveEmployee = async (e) => {
    e.preventDefault()
    const method = editingEmployee ? 'PUT' : 'POST'
    const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : '/api/employees'
    try {
      const res = await fetch(url, { method, headers: API_HEADERS(), body: JSON.stringify(employeeForm) })
      if (res.ok) {
        setShowEmployeeModal(false)
        setEditingEmployee(null)
        setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' })
        fetchEmployees()
        showToast(editingEmployee ? 'Employee updated' : 'Employee created', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to save employee', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Delete this employee?')) return
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE', headers: API_HEADERS() })
      if (res.ok) {
        if (activeChannel?.type === 'dm' && activeChannel?.id === id) setActiveChannel(null)
        fetchEmployees()
        showToast('Employee deleted', 'success')
      } else {
        showToast('Failed to delete employee', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // API Keys
  const saveApiKeys = async () => {
    setSavingKeys(true)
    const body = {}
    if (keyInputs.openai) body.openai_api_key = keyInputs.openai
    if (keyInputs.anthropic) body.anthropic_api_key = keyInputs.anthropic
    try {
      const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
      if (res.ok) {
        setApiKeys(await res.json())
        setKeyInputs({ openai: '', anthropic: '' })
        showToast('API keys saved securely', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to save API keys', 'error')
      }
    } catch { showToast('Connection error', 'error') }
    setSavingKeys(false)
  }

  const removeApiKey = async (provider) => {
    const body = provider === 'openai' ? { openai_api_key: '' } : { anthropic_api_key: '' }
    try {
      const res = await fetch('/api/settings/api-keys', { method: 'PUT', headers: API_HEADERS(), body: JSON.stringify(body) })
      if (res.ok) {
        setApiKeys(await res.json())
        showToast(`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key removed`, 'success')
      } else {
        showToast('Failed to remove API key', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Copy message to clipboard
  const copyToClipboard = async (content) => {
    try {
      await navigator.clipboard.writeText(content)
      showToast('Copied to clipboard', 'success')
    } catch { showToast('Failed to copy', 'error') }
  }

  // Delete memory
  const handleDeleteMemory = async (id) => {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE', headers: API_HEADERS() })
      if (res.ok) {
        fetchMemories()
        showToast('Memory deleted', 'success')
      } else {
        showToast('Failed to delete memory', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Create memory
  const handleCreateMemory = async (e) => {
    e.preventDefault()
    if (!newMemory.content.trim()) return
    setSavingMemory(true)
    try {
      const payload = {
        content: newMemory.content.trim(),
        employee_id: newMemory.employee_id || null,
        project_id: newMemory.project_id || null
      }
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        fetchMemories()
        setNewMemory({ content: '', employee_id: '', project_id: '' })
        showToast('Memory created', 'success')
      } else {
        showToast('Failed to create memory', 'error')
      }
    } catch { showToast('Connection error', 'error') }
    setSavingMemory(false)
  }

  // Clear chat history
  const handleClearChat = async () => {
    if (!activeChannel || !confirm('Clear all messages in this conversation?')) return
    try {
      const endpoint = activeChannel.type === 'project'
        ? `/api/messages/project/${activeChannel.id}`
        : `/api/messages/dm/${activeChannel.id}`
      const res = await fetch(endpoint, { method: 'DELETE', headers: API_HEADERS() })
      if (res.ok) {
        setMessages([])
        setFreshContextFrom(null)
        showToast('Chat history cleared', 'success')
      } else {
        showToast('Failed to clear chat', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Start fresh - clear context without deleting history
  const handleStartFresh = () => {
    if (messages.length === 0) return
    setFreshContextFrom(messages.length)
    showToast('Context cleared - starting fresh. History preserved.', 'success')
  }

  // Resume using full history
  const handleResumeContext = () => {
    setFreshContextFrom(null)
    showToast('Full conversation history restored', 'success')
  }

  // Export conversation to Markdown
  const handleExportMarkdown = () => {
    if (!activeChannel || messages.length === 0) return
    const channelName = activeChannel.type === 'project' ? `#${activeChannel.name}` : activeChannel.name
    let markdown = `# ${channelName} - Conversation Export\n\n`
    markdown += `*Exported on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}*\n\n---\n\n`

    messages.forEach(msg => {
      const sender = msg.role === 'user' ? user.name : (msg.employee_id ? getEmployeeName(msg.employee_id) : 'Assistant')
      const time = msg.created_at ? new Date(msg.created_at).toLocaleString() : ''
      markdown += `### ${sender}${time ? ` (${time})` : ''}\n\n${msg.content}\n\n---\n\n`
    })

    // Download as file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeChannel.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    showToast('Conversation exported to Markdown', 'success')
  }

  // Search conversations
  const handleSearchConversations = async (query) => {
    setConversationSearch(query)
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }
    if (query.trim().length < 2) return
    setSearching(true)
    setShowSearchResults(true)
    try {
      const res = await fetch(`/api/messages/search?q=${encodeURIComponent(query.trim())}`, {
        headers: API_HEADERS()
      })
      if (res.ok) {
        setSearchResults(await res.json())
      }
    } catch (err) { console.error('Search failed:', err) }
    setSearching(false)
  }

  // Navigate to search result
  const handleSearchResultClick = (result) => {
    if (result.project_id) {
      setActiveChannel({ type: 'project', id: result.project_id, name: result.project_name })
    } else if (result.employee_id) {
      setActiveChannel({ type: 'dm', id: result.employee_id, name: result.employee_name })
    }
    setShowSearchResults(false)
    setConversationSearch('')
  }

  // Export employee configuration
  const handleExportEmployee = () => {
    if (!employeeForm.name) return
    const config = {
      name: employeeForm.name,
      role: employeeForm.role || '',
      instructions: employeeForm.instructions || '',
      model: employeeForm.model || 'gpt-4',
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${employeeForm.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-config.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    showToast('Employee configuration exported', 'success')
  }

  // Import employee configuration
  const handleImportEmployee = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target.result)
        if (config.name && config.model) {
          setEmployeeForm({
            name: config.name,
            role: config.role || '',
            instructions: config.instructions || '',
            model: config.model || 'gpt-4'
          })
          showToast('Configuration imported - review and save', 'success')
        } else {
          showToast('Invalid configuration file', 'error')
        }
      } catch {
        showToast('Failed to parse configuration file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Edit message
  const handleEditMessage = async (messageId) => {
    if (!editMessageContent.trim()) return
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify({ content: editMessageContent.trim() })
      })
      if (res.ok) {
        setMessages(messages.map(m => m.id === messageId ? { ...m, content: editMessageContent.trim() } : m))
        setEditingMessage(null)
        setEditMessageContent('')
        showToast('Message updated', 'success')
      } else {
        showToast('Failed to update message', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Delete message
  const handleDeleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: API_HEADERS()
      })
      if (res.ok) {
        setMessages(messages.filter(m => m.id !== messageId))
        showToast('Message deleted', 'success')
      } else {
        showToast('Failed to delete message', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // File upload for DMs - show preview first
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file || !activeChannel || activeChannel.type !== 'dm') return

    // Read file content for preview
    try {
      const content = await file.text()
      setFilePreview({ file, content: content.slice(0, 5000), name: file.name, size: file.size })
    } catch {
      showToast('Could not preview file', 'error')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileUpload = async () => {
    if (!filePreview || !activeChannel || activeChannel.type !== 'dm') return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', filePreview.file)
    try {
      const res = await fetch(`/api/files/upload/${activeChannel.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      })
      if (res.ok) {
        const data = await res.json()
        setUploadedFiles([...uploadedFiles, { id: data.id, filename: data.filename, size: data.size }])
        showToast('File uploaded', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Upload failed', 'error')
      }
    } catch { showToast('Upload error', 'error') }
    setUploading(false)
    setFilePreview(null)
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

  const handleDownloadFile = async (fileId, filename) => {
    if (!activeChannel || activeChannel.type !== 'dm') return
    try {
      const res = await fetch(`/api/files/${activeChannel.id}/${fileId}/download`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        showToast('Failed to download file', 'error')
      }
    } catch (err) { showToast('Download error', 'error') }
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
      // If fresh context is active, only send messages from that point onwards
      const contextMessages = freshContextFrom !== null
        ? newMessages.slice(freshContextFrom)
        : newMessages
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({
          employee_id: employeeId,
          messages: contextMessages.map(m => ({ role: m.role, content: m.content })),
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
    sidebar: {
      width: '260px',
      background: '#1a1d21',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'relative',
      transition: 'margin-left 0.3s ease',
      marginLeft: sidebarOpen ? 0 : '-260px'
    },
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
    <div style={{ display: 'flex', fontFamily: 'system-ui, sans-serif', height: '100vh', overflow: 'hidden' }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: '10px',
          left: sidebarOpen ? '270px' : '10px',
          zIndex: 1001,
          background: '#1a1d21',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          transition: 'left 0.3s ease',
          display: 'none'
        }}
        className="sidebar-toggle"
      >
        {sidebarOpen ? '←' : '☰'}
      </button>

      {/* Toast notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader} onClick={() => { setActiveChannel(null); setShowSettings(false); setMessages([]); setShowSearchResults(false) }}>SilentPartner</div>

        {/* Search */}
        <div style={{ padding: '10px 15px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search conversations..."
            value={conversationSearch}
            onChange={(e) => handleSearchConversations(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #444', borderRadius: '4px', background: '#2c2f33', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
          />
          {showSearchResults && (
            <div style={{ position: 'absolute', top: '100%', left: '15px', right: '15px', background: '#2c2f33', border: '1px solid #444', borderRadius: '4px', maxHeight: '300px', overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              {searching ? (
                <div style={{ padding: '15px', color: '#999', textAlign: 'center' }}>Searching...</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: '15px', color: '#999', textAlign: 'center' }}>No results found</div>
              ) : (
                searchResults.map(r => (
                  <div
                    key={r.id}
                    onClick={() => handleSearchResultClick(r)}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #444' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3c3f44'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                      {r.project_name ? `#${r.project_name}` : r.employee_name || 'Unknown'} • {r.role}
                    </div>
                    <div style={{ fontSize: '13px', color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.content.length > 80 ? r.content.slice(0, 80) + '...' : r.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Projects */}
        <div style={styles.sidebarSection}>
          <span>Projects</span>
          <button onClick={() => { setShowProjectModal(true); setEditingProject(null); setProjectForm({ name: '', description: '', status: 'active' }) }} style={styles.addBtn}>+</button>
        </div>
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => setActiveChannel({ type: 'project', id: p.id, name: p.name })}
            onContextMenu={(e) => { e.preventDefault(); if (confirm('Delete project?')) handleDeleteProject(p.id) }}
            style={{ ...styles.channel, ...(activeChannel?.type === 'project' && activeChannel?.id === p.id ? styles.channelActive : {}), opacity: p.status === 'archived' ? 0.5 : 1 }}
            className="sidebar-channel"
          >
            <span style={{ color: '#999' }}>#</span>
            <span style={{ flex: 1 }}>{p.name}</span>
            {p.status === 'completed' && <span style={{ fontSize: '10px', color: '#28a745' }} title="Completed">✓</span>}
            {p.status === 'archived' && <span style={{ fontSize: '10px', color: '#6c757d' }} title="Archived">⊘</span>}
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
            className="sidebar-channel"
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
          <div style={{ flex: 1, overflow: 'auto', padding: '40px' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <h1 style={{ color: '#333', marginBottom: '8px' }}>Settings</h1>
              <p style={{ color: '#666', marginBottom: '40px' }}>Configure your AI team's capabilities.</p>

              {/* API Keys Section */}
              <div style={{ marginBottom: '50px' }}>
                <h2 style={{ color: '#333', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  API Keys
                  {(apiKeys.has_openai_key || apiKeys.has_anthropic_key) && (
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: '#d4edda', color: '#155724', borderRadius: '12px' }}>
                      {apiKeys.has_openai_key && apiKeys.has_anthropic_key ? '2 configured' : '1 configured'}
                    </span>
                  )}
                </h2>
                <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
                  Your API keys are encrypted and stored securely. You only need to add keys for the AI models you want to use.
                </p>

                {/* OpenAI Card */}
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ margin: 0, color: '#333' }}>OpenAI</h3>
                        {apiKeys.has_openai_key && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#d4edda', color: '#155724', borderRadius: '10px' }}>Connected</span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>Powers GPT-4, GPT-4 Turbo, and GPT-3.5 models</p>
                    </div>
                    <div style={{ width: '40px', height: '40px', background: '#000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>AI</span>
                    </div>
                  </div>

                  {apiKeys.has_openai_key ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, padding: '10px 14px', background: '#f8f9fa', borderRadius: '6px', color: '#666', fontSize: '14px' }}>
                        sk-...hidden
                      </div>
                      <button onClick={() => removeApiKey('openai')} style={{ padding: '10px 16px', background: '#fff', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="password"
                        placeholder="sk-proj-..."
                        value={keyInputs.openai}
                        onChange={(e) => setKeyInputs({ ...keyInputs, openai: e.target.value })}
                        style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' }}
                      />
                      <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#555', lineHeight: 1.6 }}>
                        <strong style={{ color: '#333' }}>How to get your OpenAI API key:</strong>
                        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                          <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>platform.openai.com/api-keys</a></li>
                          <li>Sign in or create an OpenAI account</li>
                          <li>Click "Create new secret key"</li>
                          <li>Copy the key (starts with <code style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: '3px' }}>sk-proj-</code>)</li>
                        </ol>
                        <p style={{ margin: '10px 0 0 0', color: '#888', fontSize: '12px' }}>
                          Note: OpenAI charges based on usage. New accounts get free credits to start.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Anthropic Card */}
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ margin: 0, color: '#333' }}>Anthropic</h3>
                        {apiKeys.has_anthropic_key && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#d4edda', color: '#155724', borderRadius: '10px' }}>Connected</span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>Powers Claude 3 Opus and Claude 3 Sonnet models</p>
                    </div>
                    <div style={{ width: '40px', height: '40px', background: '#d97706', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>A</span>
                    </div>
                  </div>

                  {apiKeys.has_anthropic_key ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, padding: '10px 14px', background: '#f8f9fa', borderRadius: '6px', color: '#666', fontSize: '14px' }}>
                        sk-ant-...hidden
                      </div>
                      <button onClick={() => removeApiKey('anthropic')} style={{ padding: '10px 16px', background: '#fff', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="password"
                        placeholder="sk-ant-api03-..."
                        value={keyInputs.anthropic}
                        onChange={(e) => setKeyInputs({ ...keyInputs, anthropic: e.target.value })}
                        style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' }}
                      />
                      <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#555', lineHeight: 1.6 }}>
                        <strong style={{ color: '#333' }}>How to get your Anthropic API key:</strong>
                        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                          <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>console.anthropic.com/settings/keys</a></li>
                          <li>Sign in or create an Anthropic account</li>
                          <li>Click "Create Key"</li>
                          <li>Copy the key (starts with <code style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: '3px' }}>sk-ant-</code>)</li>
                        </ol>
                        <p style={{ margin: '10px 0 0 0', color: '#888', fontSize: '12px' }}>
                          Note: Anthropic requires adding credits before use. Claude models are known for strong reasoning.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {(keyInputs.openai || keyInputs.anthropic) && (
                  <button
                    onClick={saveApiKeys}
                    disabled={savingKeys}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: savingKeys ? 'not-allowed' : 'pointer',
                      opacity: savingKeys ? 0.7 : 1
                    }}
                  >
                    {savingKeys ? 'Saving...' : 'Save API Keys'}
                  </button>
                )}
              </div>

              {/* Memories Section */}
              <div>
                <h2 style={{ color: '#333', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  Memories
                  {memories.length > 0 && (
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: '#e3f2fd', color: '#1565c0', borderRadius: '12px' }}>
                      {memories.length} saved
                    </span>
                  )}
                </h2>
                <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
                  Memories are facts that your AI employees will remember across all conversations. They help personalize responses and maintain context about you, your business, and your preferences.
                </p>

                {/* Memory Search */}
                {memories.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <input
                      type="text"
                      placeholder="Search memories..."
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {/* Add Memory Form */}
                <form onSubmit={handleCreateMemory} style={{ marginBottom: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <textarea
                      placeholder="Enter a fact you want your AI employees to remember..."
                      value={newMemory.content}
                      onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                      style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', minHeight: '80px', fontSize: '14px', resize: 'vertical' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={newMemory.employee_id}
                      onChange={(e) => setNewMemory({ ...newMemory, employee_id: e.target.value })}
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="">All employees (shared)</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name} only</option>)}
                    </select>
                    <select
                      value={newMemory.project_id}
                      onChange={(e) => setNewMemory({ ...newMemory, project_id: e.target.value })}
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="">All projects</option>
                      {projects.map(p => <option key={p.id} value={p.id}>#{p.name} only</option>)}
                    </select>
                    <button
                      type="submit"
                      disabled={savingMemory || !newMemory.content.trim()}
                      style={{ padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', opacity: (savingMemory || !newMemory.content.trim()) ? 0.6 : 1 }}
                    >
                      {savingMemory ? 'Saving...' : 'Add Memory'}
                    </button>
                  </div>
                </form>

                {memories.length === 0 ? (
                  <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '30px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>brain icon</div>
                    <p style={{ color: '#666', margin: 0, marginBottom: '8px' }}>No memories yet</p>
                    <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>
                      Memories are created when you chat with employees. Ask them to "remember" something important.
                    </p>
                  </div>
                ) : (() => {
                  const filteredMemories = memorySearch.trim()
                    ? memories.filter(m =>
                        m.content.toLowerCase().includes(memorySearch.toLowerCase()) ||
                        (m.employee_name && m.employee_name.toLowerCase().includes(memorySearch.toLowerCase())) ||
                        (m.project_name && m.project_name.toLowerCase().includes(memorySearch.toLowerCase()))
                      )
                    : memories
                  return filteredMemories.length === 0 ? (
                    <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '30px', textAlign: 'center' }}>
                      <p style={{ color: '#666', margin: 0 }}>No memories match "{memorySearch}"</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {memorySearch.trim() && (
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                          Showing {filteredMemories.length} of {memories.length} memories
                        </div>
                      )}
                      {filteredMemories.map(m => (
                        <div key={m.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p style={{ margin: 0, color: '#333', lineHeight: 1.5, flex: 1 }}>{m.content}</p>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '4px 8px', fontSize: '14px' }}
                              title="Delete memory"
                            >
                              ×
                            </button>
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: m.project_name ? '#fff3e0' : m.employee_name ? '#e8f5e9' : '#e3f2fd',
                              color: m.project_name ? '#e65100' : m.employee_name ? '#2e7d32' : '#1565c0'
                            }}>
                              {m.project_name ? `# ${m.project_name}` : m.employee_name ? m.employee_name : 'Shared with all'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        ) : activeChannel ? (
          <>
            <div style={styles.header} className="chat-header">
              <div>
                <strong>{activeChannel.type === 'project' ? '#' : ''}{activeChannel.name}</strong>
                {activeChannel.type === 'project' && <span style={{ color: '#999', marginLeft: '10px', fontSize: '14px' }}>Use @name to mention an employee</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} className="chat-header-buttons">
                {messages.length > 0 && (() => {
                  const contextMessages = freshContextFrom !== null ? messages.slice(freshContextFrom) : messages
                  const totalTokens = contextMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
                  const tokenColor = totalTokens > 100000 ? '#dc3545' : totalTokens > 50000 ? '#ffc107' : '#28a745'
                  return (
                    <span style={{ fontSize: '11px', padding: '4px 8px', background: '#f8f9fa', color: '#666', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Estimated tokens in context">
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tokenColor }}></span>
                      ~{totalTokens.toLocaleString()} tokens
                    </span>
                  )
                })()}
                {freshContextFrom !== null && (
                  <span style={{ fontSize: '12px', padding: '4px 10px', background: '#fff3cd', color: '#856404', borderRadius: '12px' }}>
                    Fresh context active
                  </span>
                )}
                {messages.length > 0 && (
                  <>
                    <button onClick={handleExportMarkdown} style={{ ...styles.btn, background: '#6f42c1', color: '#fff' }} title="Export conversation as Markdown">
                      Export
                    </button>
                    {freshContextFrom === null ? (
                      <button onClick={handleStartFresh} style={{ ...styles.btn, background: '#17a2b8', color: '#fff' }} title="Clear AI context without deleting messages">
                        Start Fresh
                      </button>
                    ) : (
                      <button onClick={handleResumeContext} style={{ ...styles.btn, background: '#28a745', color: '#fff' }} title="Restore full conversation context">
                        Resume Full
                      </button>
                    )}
                    <button onClick={handleClearChat} style={{ ...styles.btn, background: '#dc3545', color: '#fff' }}>
                      Clear Chat
                    </button>
                  </>
                )}
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
            </div>

            <div style={styles.messages}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', marginTop: '50px' }}>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id || i} style={{ marginBottom: '15px', display: 'flex', gap: '10px', position: 'relative' }} className="message-container">
                  <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: msg.role === 'user' ? '#4285f4' : '#2bac76', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', flexShrink: 0 }}>
                    {msg.role === 'user' ? (user.name?.[0] || 'U') : (msg.employee_id ? getEmployeeName(msg.employee_id)?.[0] : 'A')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold' }}>
                        {msg.role === 'user' ? user.name : (msg.employee_id ? getEmployeeName(msg.employee_id) : 'Assistant')}
                      </span>
                      {msg.created_at && (
                        <span style={{ fontSize: '11px', color: '#999' }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(msg.content)}
                        style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: 0.6 }}
                        title="Copy message"
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.6}
                      >
                        Copy
                      </button>
                      {msg.id && msg.role === 'user' && !isStreaming && (
                        <>
                          <button
                            onClick={() => { setEditingMessage(msg.id); setEditMessageContent(msg.content) }}
                            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: 0.6 }}
                            title="Edit message"
                            onMouseEnter={(e) => e.target.style.opacity = 1}
                            onMouseLeave={(e) => e.target.style.opacity = 0.6}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: 0.6 }}
                            title="Delete message"
                            onMouseEnter={(e) => e.target.style.opacity = 1}
                            onMouseLeave={(e) => e.target.style.opacity = 0.6}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                    {editingMessage === msg.id ? (
                      <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                        <textarea
                          value={editMessageContent}
                          onChange={(e) => setEditMessageContent(e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '60px', fontSize: '14px', resize: 'vertical' }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleEditMessage(msg.id)} style={{ padding: '6px 12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Save</button>
                          <button onClick={() => { setEditingMessage(null); setEditMessageContent('') }} style={{ padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>
                        {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                      </div>
                    )}
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
                      <span style={{ marginRight: '6px' }}>{f.filename}</span>
                      <button onClick={() => handleDownloadFile(f.id, f.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', padding: '0 4px', fontSize: '12px' }} title="Download">↓</button>
                      <button onClick={() => handleDeleteFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '0', fontSize: '14px' }} title="Delete">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }} className="chat-input-area">
                {activeChannel.type === 'dm' && (
                  <>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".txt,.md,.json,.csv,.py,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.log,.sql" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || uploading || uploadedFiles.length >= 5}
                      style={{ ...styles.btn, background: '#6c757d', color: '#fff', opacity: (isStreaming || uploading || uploadedFiles.length >= 5) ? 0.6 : 1, flexShrink: 0 }}
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
                  style={{ flex: 1, minWidth: '0', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                />
                <button onClick={sendMessage} disabled={isStreaming || !chatInput.trim()} style={{ ...styles.btn, background: '#007bff', color: '#fff', opacity: isStreaming ? 0.6 : 1, flexShrink: 0 }}>
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
              {editingProject && (
                <select value={projectForm.status || 'active'} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })} style={styles.input}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              )}
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
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>Instruction Template</label>
                <select
                  onChange={(e) => {
                    const template = INSTRUCTION_TEMPLATES[e.target.value]
                    if (template && template.instructions) {
                      setEmployeeForm({ ...employeeForm, instructions: template.instructions })
                    }
                  }}
                  style={{ ...styles.input, marginBottom: 0 }}
                  defaultValue=""
                >
                  {Object.entries(INSTRUCTION_TEMPLATES).map(([key, val]) => (
                    <option key={key} value={key}>{val.name}</option>
                  ))}
                </select>
              </div>
              <textarea placeholder="Instructions (use variables: {{user_name}}, {{employee_name}}, {{project_name}}, {{date}}, {{day}})" value={employeeForm.instructions || ''} onChange={(e) => setEmployeeForm({ ...employeeForm, instructions: e.target.value })} style={styles.textarea} />
              <select value={employeeForm.model || 'gpt-4'} onChange={(e) => setEmployeeForm({ ...employeeForm, model: e.target.value })} style={styles.input}>
                <optgroup label="OpenAI">
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </optgroup>
                <optgroup label="Anthropic">
                  <option value="claude-3.5-sonnet">Claude 3.5 Sonnet (Recommended)</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (Fast)</option>
                </optgroup>
              </select>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button type="submit" style={{ ...styles.btn, background: '#007bff', color: '#fff' }}>Save</button>
                <button type="button" onClick={() => setShowEmployeeModal(false)} style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}>Cancel</button>
                <div style={{ flex: 1 }}></div>
                {editingEmployee && (
                  <button type="button" onClick={handleExportEmployee} style={{ ...styles.btn, background: '#17a2b8', color: '#fff', fontSize: '12px' }} title="Export configuration">
                    Export
                  </button>
                )}
                <label style={{ ...styles.btn, background: '#6f42c1', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', margin: 0 }}>
                  Import
                  <input type="file" accept=".json" onChange={handleImportEmployee} style={{ display: 'none' }} />
                </label>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {filePreview && (
        <div style={styles.modal} onClick={() => setFilePreview(null)}>
          <div style={{ ...styles.modalContent, maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>File Preview</h3>
              <button onClick={() => setFilePreview(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <div style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '6px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{filePreview.name}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{(filePreview.size / 1024).toFixed(1)} KB</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#1e1e1e', borderRadius: '6px', padding: '12px', marginBottom: '15px' }}>
              <pre style={{ margin: 0, color: '#d4d4d4', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {filePreview.content}
                {filePreview.content.length >= 5000 && <span style={{ color: '#888' }}>... (truncated)</span>}
              </pre>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleFileUpload}
                disabled={uploading}
                style={{ ...styles.btn, background: '#007bff', color: '#fff', flex: 1, opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
              <button onClick={() => setFilePreview(null)} style={{ ...styles.btn, background: '#6c757d', color: '#fff' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
