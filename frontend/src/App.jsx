import { useState, useEffect, useRef } from 'react'

// ============================================================================
// THEME - Devin.ai-inspired dark theme with purple/violet accents
// ============================================================================
const T = {
  // Backgrounds
  bg: {
    primary: '#0a0a0b',      // Deepest - main background
    secondary: '#111114',    // Cards, sidebar
    tertiary: '#1a1a1f',     // Inputs, hover states
    elevated: '#222228',     // Modals, dropdowns
    hover: '#2a2a32',        // Hover states
  },
  // Text
  text: {
    primary: '#f0f0f0',      // Main text
    secondary: '#a0a0a8',    // Secondary text
    tertiary: '#8a8a94',     // Placeholder, disabled (improved contrast)
    inverse: '#0a0a0b',      // Text on light backgrounds
    onAccent: '#ffffff',     // White text on colored buttons
  },
  // Accent colors
  accent: {
    primary: '#8b5cf6',      // Violet - primary actions
    primaryHover: '#a78bfa', // Lighter violet - hover
    primaryMuted: 'rgba(139, 92, 246, 0.15)', // For backgrounds
    success: '#10b981',      // Emerald green
    successHover: '${T.accent.successHover}', // Lighter emerald for gradients
    successMuted: 'rgba(16, 185, 129, 0.15)',
    danger: '#ef4444',       // Red
    dangerMuted: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',      // Amber
    warningMuted: 'rgba(245, 158, 11, 0.15)',
    info: '#06b6d4',         // Cyan
    infoMuted: 'rgba(6, 182, 212, 0.15)',
  },
  // Borders
  border: {
    primary: '#2a2a32',
    subtle: '#1f1f26',
    focus: '#8b5cf6',
  },
  // Shadows
  shadow: {
    sm: '0 2px 4px rgba(0,0,0,0.3)',
    md: '0 4px 12px rgba(0,0,0,0.4)',
    lg: '0 8px 24px rgba(0,0,0,0.5)',
    glow: '0 0 20px rgba(139, 92, 246, 0.3)',
  },
  // Transitions
  transition: {
    fast: 'all 0.15s ease',
    normal: 'all 0.2s ease',
    slow: 'all 0.3s ease',
  },
  // Radius
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  }
}

// Provider colors (adjusted for dark theme)
const PROVIDER_COLORS = {
  openai: { bg: 'rgba(16, 163, 127, 0.15)', text: '#10a37f', icon: '#10a37f' },
  anthropic: { bg: 'rgba(217, 119, 6, 0.15)', text: '#d97706', icon: '#d97706' },
}

// Memory category colors (adjusted for dark theme)
const CATEGORY_COLORS = {
  preference: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8' },
  fact: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  context: { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee' },
  instruction: { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6' },
  default: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af' },
}

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

  const accentColor = type === 'success' ? T.accent.success : type === 'error' ? T.accent.danger : T.accent.primary
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: T.bg.elevated,
      color: T.text.primary,
      padding: '14px 20px',
      borderRadius: T.radius.lg,
      boxShadow: T.shadow.lg,
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '400px',
      animation: 'slideIn 0.3s ease',
      borderLeft: `4px solid ${accentColor}`,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.text.tertiary, cursor: 'pointer', fontSize: '18px', padding: 0, transition: T.transition.fast }} onMouseOver={e => e.target.style.color = T.text.primary} onMouseOut={e => e.target.style.color = T.text.tertiary} aria-label="Dismiss notification">×</button>
    </div>
  )
}

// Estimate token count (rough approximation: ~4 chars per token for English)
function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Debounce helper
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// Focus trap hook for modals
function useFocusTrap(isOpen, modalRef) {
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    const modal = modalRef.current
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus first element when modal opens
    firstElement?.focus()

    const handleTab = (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleTab)
    return () => modal.removeEventListener('keydown', handleTab)
  }, [isOpen, modalRef])
}

// Escape key handler for modals
function useEscapeKey(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])
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
        <pre key={i} style={{ background: T.bg.tertiary, color: T.text.primary, padding: '14px', borderRadius: T.radius.md, overflow: 'auto', fontSize: '13px', margin: '10px 0', border: `1px solid ${T.border.subtle}` }}>
          {lang && <div style={{ color: T.accent.primary, fontSize: '11px', marginBottom: '8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lang}</div>}
          <code style={{ fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace" }}>{code}</code>
        </pre>
      )
    }
    // Handle inline code
    const inlineCodeParts = part.split(/(`[^`]+`)/g)
    return (
      <span key={i}>
        {inlineCodeParts.map((p, j) => {
          if (p.startsWith('`') && p.endsWith('`')) {
            return <code key={j} style={{ background: T.bg.tertiary, color: T.accent.primaryHover, padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace" }}>{p.slice(1, -1)}</code>
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

  // Modal refs for focus trapping
  const projectModalRef = useRef(null)
  const employeeModalRef = useRef(null)
  const usageModalRef = useRef(null)
  const roleLibraryRef = useRef(null)
  const confirmDialogRef = useRef(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editMessageContent, setEditMessageContent] = useState('')
  const [filePreview, setFilePreview] = useState(null) // { file, content, name }
  const [freshContextFrom, setFreshContextFrom] = useState(null) // message index to start fresh from
  const [modelOverride, setModelOverride] = useState('') // Override employee's default model for this conversation
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm }
  const [mentionDropdown, setMentionDropdown] = useState({ show: false, matches: [], position: 0, selectedIndex: 0 })
  const [copiedMessageId, setCopiedMessageId] = useState(null) // Track which message was just copied

  // Modal state
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editingProject, setEditingProject] = useState(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [projectForm, setProjectForm] = useState({ name: '', description: '', status: 'active', instructions: '' })
  const [employeeForm, setEmployeeForm] = useState({ name: '', role: '', instructions: '', model: 'gpt-4' })
  const [keyInputs, setKeyInputs] = useState({ openai: '', anthropic: '' })
  const [savingKeys, setSavingKeys] = useState(false)
  const [newMemory, setNewMemory] = useState({ content: '', employee_id: '', project_id: '', category: '' })
  const [showArchived, setShowArchived] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [savingMemory, setSavingMemory] = useState(false)
  const [memorySearch, setMemorySearch] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)

  // Phase 3: Tags and Usage
  const [conversationTags, setConversationTags] = useState([])
  const [newTag, setNewTag] = useState('')
  const [usageStats, setUsageStats] = useState(null)
  const [showUsageModal, setShowUsageModal] = useState(false)
  const [projectEmployees, setProjectEmployees] = useState([])

  // Phase 2.3: Role Library
  const [showRoleLibrary, setShowRoleLibrary] = useState(false)
  const [roleLibrary, setRoleLibrary] = useState({ templates: [], total_employees: 0 })
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)
  const [memorySuggestions, setMemorySuggestions] = useState([])
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState(0)

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

  const fetchConversationTags = async (channel) => {
    if (!channel) return
    try {
      const endpoint = channel.type === 'project'
        ? `/api/tags/project/${channel.id}`
        : `/api/tags/dm/${channel.id}`
      const res = await fetchWithRetry(endpoint, { headers: API_HEADERS() })
      if (res.ok) setConversationTags(await res.json())
    } catch (err) { console.error('Failed to fetch tags:', err) }
  }

  const fetchUsageStats = async () => {
    try {
      const res = await fetchWithRetry('/api/usage/summary?days=30', { headers: API_HEADERS() })
      if (res.ok) setUsageStats(await res.json())
    } catch (err) { console.error('Failed to fetch usage:', err) }
  }

  const fetchProjectEmployees = async (projectId) => {
    try {
      const res = await fetchWithRetry(`/api/projects/${projectId}/employees`, { headers: API_HEADERS() })
      if (res.ok) setProjectEmployees(await res.json())
    } catch (err) { console.error('Failed to fetch project employees:', err) }
  }

  // Phase 2.3: Role Library functions
  const fetchRoleLibrary = async () => {
    setLoadingRoles(true)
    try {
      const res = await fetchWithRetry('/api/roles/library', { headers: API_HEADERS() })
      if (res.ok) setRoleLibrary(await res.json())
    } catch (err) { console.error('Failed to fetch role library:', err) }
    setLoadingRoles(false)
  }

  const fetchMemorySuggestions = async () => {
    try {
      const res = await fetchWithRetry('/api/memory-suggestions?status=pending', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setMemorySuggestions(data)
        setPendingSuggestionsCount(data.length)
      }
    } catch (err) { console.error('Failed to fetch memory suggestions:', err) }
  }

  const handleAddRoleFromTemplate = async (templateId) => {
    try {
      const res = await fetch(`/api/roles/templates/${templateId}/create-employee`, {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({})
      })
      if (res.ok) {
        showToast('Role added to your team', 'success')
        fetchEmployees()
        fetchRoleLibrary()
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to add role', 'error')
      }
    } catch (err) { showToast('Failed to add role', 'error') }
  }

  const handleCloneEmployee = async (employeeId) => {
    try {
      const res = await fetch(`/api/roles/employee/${employeeId}/clone`, {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({})
      })
      if (res.ok) {
        showToast('Role cloned', 'success')
        fetchEmployees()
        fetchRoleLibrary()
      } else {
        showToast('Failed to clone role', 'error')
      }
    } catch (err) { showToast('Failed to clone role', 'error') }
  }

  const handleResetToTemplate = (employeeId) => {
    setConfirmDialog({
      title: 'Reset to Template',
      message: 'Reset this role to its template defaults? Your custom instructions will be preserved.',
      confirmText: 'Reset',
      confirmStyle: 'warning',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/roles/employee/${employeeId}/reset-to-template`, {
            method: 'POST',
            headers: API_HEADERS(),
            body: JSON.stringify({ preserve_user_instructions: true })
          })
          if (res.ok) {
            showToast('Role reset to template defaults', 'success')
            fetchEmployees()
          } else {
            const err = await res.json()
            showToast(err.detail || 'Failed to reset', 'error')
          }
        } catch (err) { showToast('Failed to reset role', 'error') }
        setConfirmDialog(null)
      }
    })
  }

  const handleApproveMemorySuggestion = async (suggestionId) => {
    try {
      const res = await fetch(`/api/memory-suggestions/${suggestionId}/approve`, {
        method: 'POST',
        headers: API_HEADERS()
      })
      if (res.ok) {
        showToast('Memory saved', 'success')
        fetchMemorySuggestions()
        fetchMemories()
      }
    } catch (err) { showToast('Failed to approve', 'error') }
  }

  const handleRejectMemorySuggestion = async (suggestionId) => {
    try {
      await fetch(`/api/memory-suggestions/${suggestionId}/reject`, {
        method: 'POST',
        headers: API_HEADERS()
      })
      fetchMemorySuggestions()
    } catch (err) { showToast('Failed to reject', 'error') }
  }

  const handleAddTag = async () => {
    if (!newTag.trim() || !activeChannel) return
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({
          tag: newTag.trim(),
          project_id: activeChannel.type === 'project' ? activeChannel.id : null,
          employee_id: activeChannel.type === 'dm' ? activeChannel.id : null
        })
      })
      if (res.ok) {
        setNewTag('')
        fetchConversationTags(activeChannel)
        showToast('Tag added', 'success')
      }
    } catch (err) { showToast('Failed to add tag', 'error') }
  }

  const handleRemoveTag = async (tag) => {
    if (!activeChannel) return
    try {
      const endpoint = activeChannel.type === 'project'
        ? `/api/tags/project/${activeChannel.id}/${encodeURIComponent(tag)}`
        : `/api/tags/dm/${activeChannel.id}/${encodeURIComponent(tag)}`
      await fetch(endpoint, { method: 'DELETE', headers: API_HEADERS() })
      fetchConversationTags(activeChannel)
    } catch (err) { showToast('Failed to remove tag', 'error') }
  }

  const handleExportPDF = async () => {
    if (!activeChannel) return
    try {
      const endpoint = activeChannel.type === 'project'
        ? `/api/export/project/${activeChannel.id}/pdf`
        : `/api/export/dm/${activeChannel.id}/pdf`
      const res = await fetch(endpoint, { headers: API_HEADERS() })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${activeChannel.name}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        showToast('PDF exported', 'success')
      } else {
        showToast('Failed to export PDF', 'error')
      }
    } catch (err) { showToast('Export error', 'error') }
  }

  const handleAssignEmployee = async (employeeId) => {
    if (!activeChannel || activeChannel.type !== 'project') return
    try {
      const res = await fetch(`/api/projects/${activeChannel.id}/employees`, {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({ employee_id: employeeId })
      })
      if (res.ok) {
        fetchProjectEmployees(activeChannel.id)
        showToast('Employee assigned', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to assign', 'error')
      }
    } catch (err) { showToast('Failed to assign employee', 'error') }
  }

  const handleUnassignEmployee = async (employeeId) => {
    if (!activeChannel || activeChannel.type !== 'project') return
    try {
      await fetch(`/api/projects/${activeChannel.id}/employees/${employeeId}`, {
        method: 'DELETE',
        headers: API_HEADERS()
      })
      fetchProjectEmployees(activeChannel.id)
      showToast('Employee removed', 'success')
    } catch (err) { showToast('Failed to remove employee', 'error') }
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
          if (data) { fetchProjects(); fetchEmployees(); fetchApiKeys(); fetchMemories(); fetchMemorySuggestions() }
          setLoading(false)
        })
        .catch(() => { localStorage.removeItem('token'); setLoading(false) })
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Modal accessibility: Focus traps and escape key handlers
  useFocusTrap(showProjectModal, projectModalRef)
  useFocusTrap(showEmployeeModal, employeeModalRef)
  useFocusTrap(showUsageModal, usageModalRef)
  useFocusTrap(showRoleLibrary, roleLibraryRef)
  useFocusTrap(!!confirmDialog, confirmDialogRef)

  useEscapeKey(showProjectModal, () => setShowProjectModal(false))
  useEscapeKey(showEmployeeModal, () => setShowEmployeeModal(false))
  useEscapeKey(showUsageModal, () => setShowUsageModal(false))
  useEscapeKey(showRoleLibrary, () => setShowRoleLibrary(false))
  useEscapeKey(!!confirmDialog, () => setConfirmDialog(null))

  // Fetch DM files from server
  const fetchDMFiles = async (employeeId) => {
    try {
      const res = await fetch(`/api/files/${employeeId}`, { headers: API_HEADERS() })
      if (res.ok) setUploadedFiles(await res.json())
    } catch (err) { console.error('Failed to fetch files:', err) }
  }

  // Fetch pinned messages for a channel
  const fetchPinnedMessages = async (channel) => {
    if (!channel) return
    try {
      const endpoint = channel.type === 'project'
        ? `/api/messages/pinned/project/${channel.id}`
        : `/api/messages/pinned/dm/${channel.id}`
      const res = await fetchWithRetry(endpoint, { headers: API_HEADERS() })
      if (res.ok) setPinnedMessages(await res.json())
      else setPinnedMessages([])
    } catch (err) { console.error('Failed to fetch pinned messages:', err); setPinnedMessages([]) }
  }

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel)
      fetchPinnedMessages(activeChannel)
      fetchConversationTags(activeChannel)
      if (activeChannel.type === 'dm') {
        fetchDMFiles(activeChannel.id)
        setProjectEmployees([])
      } else {
        setUploadedFiles([])
        fetchProjectEmployees(activeChannel.id)
      }
      setChatError(null)
      setShowSettings(false)
      setFreshContextFrom(null) // Reset fresh context when switching channels
    }
  }, [activeChannel])

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

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
        setProjectForm({ name: '', description: '', status: 'active', instructions: '' })
        fetchProjects()
        showToast(editingProject ? 'Project updated' : 'Project created', 'success')
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to save project', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  const handleDeleteProject = (id) => {
    setConfirmDialog({
      title: 'Delete Project',
      message: 'Delete this project and all its messages? This action cannot be undone.',
      confirmText: 'Delete',
      confirmStyle: 'danger',
      onConfirm: async () => {
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
        setConfirmDialog(null)
      }
    })
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

  const handleDeleteEmployee = (id) => {
    const employee = employees.find(e => e.id === id)
    setConfirmDialog({
      title: 'Delete Employee',
      message: `Delete ${employee?.name || 'this employee'}? This will remove all their conversation history.`,
      confirmText: 'Delete',
      confirmStyle: 'danger',
      onConfirm: async () => {
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
        setConfirmDialog(null)
      }
    })
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
  const copyToClipboard = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
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
        project_id: newMemory.project_id || null,
        category: newMemory.category || null
      }
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        fetchMemories()
        setNewMemory({ content: '', employee_id: '', project_id: '', category: '' })
        showToast('Memory created', 'success')
      } else {
        showToast('Failed to create memory', 'error')
      }
    } catch { showToast('Connection error', 'error') }
    setSavingMemory(false)
  }

  // Clear chat history
  const handleClearChat = () => {
    if (!activeChannel) return
    setConfirmDialog({
      title: 'Clear Chat History',
      message: 'Are you sure you want to delete all messages in this conversation? This action cannot be undone.',
      onConfirm: async () => {
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
        setConfirmDialog(null)
      }
    })
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

  // Search conversations with debounce
  const debouncedSearch = useDebounce(conversationSearch, 300)

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }
    if (debouncedSearch.trim().length < 2) return

    const performSearch = async () => {
      setSearching(true)
      setShowSearchResults(true)
      try {
        const res = await fetch(`/api/messages/search?q=${encodeURIComponent(debouncedSearch.trim())}`, {
          headers: API_HEADERS()
        })
        if (res.ok) {
          setSearchResults(await res.json())
        }
      } catch (err) { console.error('Search failed:', err) }
      setSearching(false)
    }
    performSearch()
  }, [debouncedSearch])

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

  // Toggle star on project
  const handleToggleProjectStar = async (projectId, e) => {
    e.stopPropagation()
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify({ starred: !project.starred })
      })
      if (res.ok) {
        fetchProjects()
      }
    } catch { showToast('Failed to update', 'error') }
  }

  // Export all memories
  const handleExportMemories = () => {
    if (memories.length === 0) return
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      memories: memories.map(m => ({
        content: m.content,
        employee_name: m.employee_name || null,
        project_name: m.project_name || null
      }))
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `silentpartner-memories-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    showToast(`Exported ${memories.length} memories`, 'success')
  }

  // Import memories from file
  const handleImportMemories = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result)
        if (!data.memories || !Array.isArray(data.memories)) {
          showToast('Invalid memories file format', 'error')
          return
        }
        let imported = 0
        for (const m of data.memories) {
          if (!m.content) continue
          const res = await fetch('/api/memories', {
            method: 'POST',
            headers: API_HEADERS(),
            body: JSON.stringify({
              content: m.content,
              employee_id: null,
              project_id: null
            })
          })
          if (res.ok) imported++
        }
        fetchMemories()
        showToast(`Imported ${imported} memories`, 'success')
      } catch {
        showToast('Failed to parse memories file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Toggle star on employee (DM)
  const handleToggleEmployeeStar = async (employeeId, e) => {
    e.stopPropagation()
    const employee = employees.find(emp => emp.id === employeeId)
    if (!employee) return
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify({ starred: !employee.starred })
      })
      if (res.ok) {
        fetchEmployees()
      }
    } catch { showToast('Failed to update', 'error') }
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
  const handleDeleteMessage = (messageId) => {
    setConfirmDialog({
      title: 'Delete Message',
      message: 'Delete this message? This action cannot be undone.',
      confirmText: 'Delete',
      confirmStyle: 'danger',
      onConfirm: async () => {
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
        setConfirmDialog(null)
      }
    })
  }

  // Toggle pin message
  const handleTogglePin = async (messageId) => {
    const message = messages.find(m => m.id === messageId)
    if (!message) return
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify({ pinned: !message.pinned })
      })
      if (res.ok) {
        setMessages(messages.map(m => m.id === messageId ? { ...m, pinned: !m.pinned } : m))
        if (activeChannel) fetchPinnedMessages(activeChannel)
        showToast(message.pinned ? 'Message unpinned' : 'Message pinned', 'success')
      } else {
        showToast('Failed to update message', 'error')
      }
    } catch { showToast('Connection error', 'error') }
  }

  // Toggle archive employee
  const handleToggleArchiveEmployee = async (employeeId, e) => {
    e.stopPropagation()
    const employee = employees.find(emp => emp.id === employeeId)
    if (!employee) return
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PUT',
        headers: API_HEADERS(),
        body: JSON.stringify({ archived: !employee.archived })
      })
      if (res.ok) {
        fetchEmployees()
        showToast(employee.archived ? 'Conversation unarchived' : 'Conversation archived', 'success')
      }
    } catch { showToast('Failed to update', 'error') }
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

  // @mention autocomplete handling
  const handleChatInputChange = (e) => {
    const value = e.target.value
    setChatInput(value)

    // Only show autocomplete in project channels
    if (activeChannel?.type !== 'project') {
      setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 })
      return
    }

    // Check if we're in the middle of typing a mention
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      const matches = employees.filter(emp =>
        emp.name.toLowerCase().includes(query) ||
        (emp.role && emp.role.toLowerCase().includes(query))
      ).slice(0, 5)

      if (matches.length > 0) {
        setMentionDropdown({
          show: true,
          matches,
          position: mentionMatch.index,
          selectedIndex: 0
        })
      } else {
        setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 })
      }
    } else {
      setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 })
    }
  }

  const handleMentionSelect = (employee) => {
    const beforeMention = chatInput.slice(0, mentionDropdown.position)
    const afterMention = chatInput.slice(mentionDropdown.position).replace(/@\w*/, '')
    setChatInput(beforeMention + '@' + employee.name + ' ' + afterMention.trimStart())
    setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 })
  }

  const handleChatInputKeyDown = (e) => {
    if (mentionDropdown.show) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionDropdown(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.matches.length - 1)
        }))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionDropdown(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0)
        }))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (mentionDropdown.matches[mentionDropdown.selectedIndex]) {
          handleMentionSelect(mentionDropdown.matches[mentionDropdown.selectedIndex])
        }
      } else if (e.key === 'Escape') {
        setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 })
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      sendMessage()
    }
  }

  // Chat
  const sendMessage = async () => {
    if (!chatInput.trim() || isStreaming || !activeChannel) return

    // Determine which employee will respond
    let targetEmployeeId = activeChannel.type === 'dm' ? activeChannel.id : null
    if (activeChannel.type === 'project') {
      const mentionMatch = chatInput.match(/@(\w+)/)
      if (mentionMatch) {
        const mentionedName = mentionMatch[1].toLowerCase()
        const mentionedEmployee = employees.find(e => e.name.toLowerCase().includes(mentionedName))
        if (mentionedEmployee) targetEmployeeId = mentionedEmployee.id
      }
      if (!targetEmployeeId && employees.length > 0) targetEmployeeId = employees[0].id
    }

    // Check if we have an employee
    if (!targetEmployeeId) {
      setChatError('No employee available to respond')
      return
    }

    // Check if required API key is configured
    const targetEmployee = employees.find(e => e.id === targetEmployeeId)
    const effectiveModel = modelOverride || targetEmployee?.model || 'gpt-4'
    const isAnthropicModel = effectiveModel.startsWith('claude')
    const requiredKeyMissing = isAnthropicModel ? !apiKeys.has_anthropic_key : !apiKeys.has_openai_key

    if (requiredKeyMissing) {
      const provider = isAnthropicModel ? 'Anthropic' : 'OpenAI'
      setChatError(`${provider} API key required. Go to Settings to add your ${provider} API key.`)
      return
    }

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

    // Use the already-determined employee ID
    let employeeId = targetEmployeeId

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
          project_id: activeChannel.type === 'project' ? activeChannel.id : null,
          model_override: modelOverride || null
        })
      })

      if (!res.ok) {
        const err = await res.json()
        setChatError(err.detail || 'Failed to send message. Please try again.')
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
    } catch (err) { setChatError('Unable to connect. Check your internet connection and try again.') }
    setIsStreaming(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg.primary, gap: '16px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: `3px solid ${T.border.primary}`,
          borderTop: `3px solid ${T.accent.primary}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: T.text.secondary, margin: 0 }}>Loading...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg.primary, color: T.text.primary, fontFamily: "'Inter', system-ui, sans-serif", overflow: 'auto' }}>
        <style>{`
          @keyframes float {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(2%, 2%) rotate(1deg); }
            50% { transform: translate(-1%, 3%) rotate(-1deg); }
            75% { transform: translate(-2%, -1%) rotate(0.5deg); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes typing {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>

        {/* Hero Section */}
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Animated gradient background */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: `radial-gradient(ellipse at 30% 20%, ${T.accent.primaryMuted} 0%, transparent 50%),
                         radial-gradient(ellipse at 70% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
                         radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.05) 0%, transparent 70%)`,
            animation: 'float 20s ease-in-out infinite',
            pointerEvents: 'none'
          }} />

          {/* Nav bar */}
          <nav style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 40px',
            position: 'relative',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                <span style={{ filter: 'grayscale(100%) brightness(10)' }}>◧</span>
              </div>
              <span style={{ fontWeight: 600, fontSize: '18px', letterSpacing: '-0.5px' }}>QuietDesk</span>
            </div>
            {authStatus?.oauth_configured && (
              <button
                onClick={handleLogin}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  background: 'transparent',
                  color: T.text.primary,
                  border: `1px solid ${T.border.primary}`,
                  borderRadius: T.radius.md,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.target.style.background = T.bg.tertiary
                  e.target.style.borderColor = T.accent.primary
                }}
                onMouseOut={e => {
                  e.target.style.background = 'transparent'
                  e.target.style.borderColor = T.border.primary
                }}
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Main hero content */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 40px 80px'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '60px',
              maxWidth: '1200px',
              width: '100%',
              alignItems: 'center'
            }}>
              {/* Left: Text content */}
              <div style={{ animation: 'fadeInUp 0.6s ease-out' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: T.accent.primaryMuted,
                  borderRadius: '20px',
                  fontSize: '13px',
                  color: T.accent.primaryHover,
                  marginBottom: '24px',
                  fontWeight: 500
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: T.accent.success, animation: 'typing 1.5s infinite' }} />
                  Powered by GPT-4 & Claude
                </div>

                <h1 style={{
                  fontSize: 'clamp(36px, 5vw, 56px)',
                  fontWeight: 700,
                  letterSpacing: '-1.5px',
                  lineHeight: 1.1,
                  marginBottom: '20px'
                }}>
                  Build your own
                  <br />
                  <span style={{ color: T.accent.primaryHover }}>AI workforce</span>
                </h1>

                <p style={{
                  fontSize: '18px',
                  color: T.text.secondary,
                  lineHeight: 1.6,
                  marginBottom: '32px',
                  maxWidth: '480px'
                }}>
                  Create specialized AI employees with unique skills and personalities.
                  They remember context, collaborate on projects, and work the way you want.
                </p>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '40px' }}>
                  {authStatus?.oauth_configured ? (
                    <button
                      onClick={handleLogin}
                      style={{
                        padding: '14px 28px',
                        fontSize: '15px',
                        background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
                        color: T.text.onAccent,
                        border: 'none',
                        borderRadius: T.radius.md,
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.2s ease',
                        boxShadow: `0 4px 20px ${T.accent.primary}40`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = `0 8px 30px ${T.accent.primary}50`
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = `0 4px 20px ${T.accent.primary}40`
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Start Free with Google
                    </button>
                  ) : (
                    <p style={{ color: T.text.tertiary }}>Sign-in coming soon</p>
                  )}
                </div>

                {/* Trust badges */}
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {[
                    { icon: '🔐', text: 'Your API keys' },
                    { icon: '💰', text: 'No hidden fees' },
                    { icon: '🚀', text: '2 min setup' }
                  ].map((badge, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text.tertiary, fontSize: '13px' }}>
                      <span>{badge.icon}</span>
                      <span>{badge.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: App preview mockup */}
              <div style={{ animation: 'fadeInUp 0.6s ease-out 0.2s both' }}>
                <div style={{
                  background: T.bg.secondary,
                  borderRadius: T.radius.xl,
                  border: `1px solid ${T.border.primary}`,
                  overflow: 'hidden',
                  boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${T.border.subtle}`
                }}>
                  {/* Fake title bar */}
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${T.border.subtle}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#febc2e' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c840' }} />
                    </div>
                    <span style={{ fontSize: '12px', color: T.text.tertiary, marginLeft: '8px' }}>QuietDesk</span>
                  </div>

                  {/* Chat preview */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* User message */}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <div style={{
                        background: T.accent.primaryMuted,
                        padding: '12px 16px',
                        borderRadius: '16px 16px 4px 16px',
                        maxWidth: '280px',
                        fontSize: '14px',
                        color: T.text.primary
                      }}>
                        Can you help me write a product launch email?
                      </div>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: T.text.onAccent,
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        Y
                      </div>
                    </div>

                    {/* AI response */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: `linear-gradient(135deg, ${T.accent.success}, #34d399)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: T.text.onAccent,
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        M
                      </div>
                      <div style={{
                        background: T.bg.tertiary,
                        padding: '12px 16px',
                        borderRadius: '16px 16px 16px 4px',
                        maxWidth: '320px',
                        fontSize: '14px',
                        color: T.text.primary
                      }}>
                        <div style={{ fontWeight: 500, color: T.accent.success, fontSize: '12px', marginBottom: '6px' }}>Maya • Marketing Writer</div>
                        I'd love to help! Let me draft something compelling. What's the product and who's the target audience?
                      </div>
                    </div>

                    {/* Team indicator */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: T.bg.tertiary,
                      borderRadius: T.radius.md,
                      fontSize: '12px',
                      color: T.text.tertiary
                    }}>
                      <span>Your team:</span>
                      <div style={{ display: 'flex', marginLeft: '4px' }}>
                        {['M', 'D', 'A'].map((initial, i) => (
                          <div key={i} style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            background: [T.accent.success, T.accent.info, T.accent.warning][i],
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            color: T.text.onAccent,
                            fontWeight: 600,
                            marginLeft: i > 0 ? '-6px' : 0,
                            border: `2px solid ${T.bg.tertiary}`
                          }}>
                            {initial}
                          </div>
                        ))}
                      </div>
                      <span style={{ color: T.text.secondary }}>3 employees ready</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section - Compact */}
        <div style={{
          padding: '80px 40px',
          background: T.bg.secondary,
          borderTop: `1px solid ${T.border.subtle}`
        }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <h2 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px', marginBottom: '12px' }}>
                Why teams choose QuietDesk
              </h2>
              <p style={{ color: T.text.secondary, fontSize: '16px' }}>
                Everything you need to build and manage your AI workforce
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px'
            }}>
              {[
                { icon: '🎭', title: 'Custom Personalities', desc: 'Give each AI employee unique instructions, tone, and expertise' },
                { icon: '🧠', title: 'Persistent Memory', desc: 'Your team remembers context across every conversation' },
                { icon: '👥', title: '@Mentions', desc: 'Collaborate in projects by mentioning specific team members' },
                { icon: '📊', title: 'Usage Dashboard', desc: 'Track tokens, costs, and usage across your entire team' },
                { icon: '🔑', title: 'BYOK', desc: 'Bring your own OpenAI or Anthropic keys — no markup' },
                { icon: '📁', title: 'File Context', desc: 'Upload documents for your AI team to reference' }
              ].map((f, i) => (
                <div key={i} style={{
                  padding: '24px',
                  background: T.bg.elevated,
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.border.primary}`,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = T.accent.primary}
                onMouseOut={e => e.currentTarget.style.borderColor = T.border.primary}
                >
                  <span style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }}>{f.icon}</span>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: T.text.primary }}>{f.title}</h3>
                  <p style={{ fontSize: '14px', color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA - Simpler */}
        <div style={{
          padding: '80px 40px',
          textAlign: 'center',
          background: T.bg.primary
        }}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '12px', letterSpacing: '-0.5px' }}>
            Ready to meet your new team?
          </h2>
          <p style={{ color: T.text.secondary, marginBottom: '24px', fontSize: '16px' }}>
            Start building in under 2 minutes. No credit card required.
          </p>
          {authStatus?.oauth_configured && (
            <button
              onClick={handleLogin}
              style={{
                padding: '14px 32px',
                fontSize: '15px',
                background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
                color: T.text.onAccent,
                border: 'none',
                borderRadius: T.radius.md,
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                boxShadow: `0 4px 20px ${T.accent.primary}40`
              }}
              onMouseOver={e => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = `0 8px 30px ${T.accent.primary}50`
              }}
              onMouseOut={e => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = `0 4px 20px ${T.accent.primary}40`
              }}
            >
              Get Started Free
            </button>
          )}

          <div style={{ marginTop: '60px', color: T.text.tertiary, fontSize: '13px' }}>
            © {new Date().getFullYear()} QuietDesk
          </div>
        </div>
      </div>
    )
  }

  const styles = {
    sidebar: {
      width: '260px',
      background: T.bg.secondary,
      color: T.text.primary,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'relative',
      transition: 'margin-left 0.3s ease',
      marginLeft: sidebarOpen ? 0 : '-260px',
      borderRight: `1px solid ${T.border.subtle}`
    },
    sidebarHeader: { padding: '18px 15px', borderBottom: `1px solid ${T.border.primary}`, fontWeight: 600, fontSize: '18px', cursor: 'pointer', letterSpacing: '-0.3px' },
    sidebarSection: { padding: '12px 15px 6px', color: T.text.tertiary, fontSize: '11px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.5px', fontWeight: 500 },
    channel: { padding: '8px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderRadius: T.radius.sm, margin: '2px 8px', transition: T.transition.fast },
    channelActive: { background: T.accent.primaryMuted, color: T.accent.primaryHover },
    addBtn: { background: 'none', border: 'none', color: T.text.tertiary, cursor: 'pointer', fontSize: '16px', transition: T.transition.fast, padding: '4px' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', background: T.bg.primary, height: '100vh' },
    header: { padding: '16px 24px', borderBottom: `1px solid ${T.border.primary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.bg.secondary },
    messages: { flex: 1, overflow: 'auto', padding: '24px' },
    input: { width: '100%', padding: '12px 14px', marginBottom: '12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, boxSizing: 'border-box', background: T.bg.tertiary, color: T.text.primary, fontSize: '14px', transition: T.transition.fast, outline: 'none' },
    textarea: { width: '100%', padding: '12px 14px', marginBottom: '12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, minHeight: '100px', boxSizing: 'border-box', background: T.bg.tertiary, color: T.text.primary, fontSize: '14px', resize: 'vertical', outline: 'none', transition: T.transition.fast },
    btn: { padding: '10px 18px', fontSize: '14px', border: 'none', borderRadius: T.radius.md, cursor: 'pointer', marginRight: '8px', fontWeight: 500, transition: T.transition.fast },
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
    modalContent: { background: T.bg.elevated, padding: '28px', borderRadius: T.radius.xl, width: '440px', maxWidth: '90%', boxShadow: T.shadow.lg, border: `1px solid ${T.border.primary}` }
  }

  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || 'Unknown'

  return (
    <div style={{ display: 'flex', fontFamily: "'Inter', system-ui, sans-serif", height: '100vh', overflow: 'hidden', background: T.bg.primary }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: '10px',
          left: sidebarOpen ? '270px' : '10px',
          zIndex: 1001,
          background: T.bg.elevated,
          color: T.text.primary,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.md,
          padding: '8px 12px',
          cursor: 'pointer',
          transition: 'left 0.3s ease',
          display: 'none'
        }}
        className="sidebar-toggle"
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? '←' : '☰'}
      </button>

      {/* Toast notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        {/* Fixed Header */}
        <div style={styles.sidebarHeader} onClick={() => { setActiveChannel(null); setShowSettings(false); setMessages([]); setShowSearchResults(false) }}>QuietDesk</div>

        {/* Scrollable Content Area */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Search */}
          <div style={{ padding: '12px 12px', position: 'relative', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search conversations..."
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, background: T.bg.tertiary, color: T.text.primary, fontSize: '13px', boxSizing: 'border-box', outline: 'none', transition: T.transition.fast }}
              onFocus={e => e.target.style.borderColor = T.accent.primary}
              onBlur={e => e.target.style.borderColor = T.border.primary}
            />
            {showSearchResults && (
              <div style={{ position: 'absolute', top: '100%', left: '12px', right: '12px', background: T.bg.elevated, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, maxHeight: '300px', overflow: 'auto', zIndex: 100, boxShadow: T.shadow.lg }}>
                {searching ? (
                  <div style={{ padding: '16px', color: T.text.tertiary, textAlign: 'center' }}>Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '16px', color: T.text.tertiary, textAlign: 'center' }}>No results found</div>
                ) : (
                  searchResults.map(r => (
                    <div
                      key={r.id}
                      onClick={() => handleSearchResultClick(r)}
                      style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border.subtle}`, transition: T.transition.fast }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.bg.hover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontSize: '11px', color: T.text.tertiary, marginBottom: '4px' }}>
                        {r.project_name ? `#${r.project_name}` : r.employee_name || 'Unknown'} • {r.role}
                      </div>
                      <div style={{ fontSize: '13px', color: T.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <button onClick={() => { setShowProjectModal(true); setEditingProject(null); setProjectForm({ name: '', description: '', status: 'active', instructions: '' }) }} style={styles.addBtn} onMouseOver={e => e.target.style.color = T.accent.primary} onMouseOut={e => e.target.style.color = T.text.tertiary}>+</button>
          </div>
          {projects
            .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
            .map(p => (
            <div
              key={p.id}
              onClick={() => setActiveChannel({ type: 'project', id: p.id, name: p.name })}
              onContextMenu={(e) => { e.preventDefault(); handleDeleteProject(p.id) }}
              style={{ ...styles.channel, ...(activeChannel?.type === 'project' && activeChannel?.id === p.id ? styles.channelActive : {}), opacity: p.status === 'archived' ? 0.5 : 1 }}
              className="sidebar-channel"
              onMouseEnter={e => { if (!(activeChannel?.type === 'project' && activeChannel?.id === p.id)) e.currentTarget.style.background = T.bg.hover }}
              onMouseLeave={e => { if (!(activeChannel?.type === 'project' && activeChannel?.id === p.id)) e.currentTarget.style.background = 'transparent' }}
            >
              <span
                onClick={(e) => handleToggleProjectStar(p.id, e)}
                style={{ cursor: 'pointer', color: p.starred ? T.accent.warning : T.text.tertiary, fontSize: '12px', transition: T.transition.fast }}
                title={p.starred ? 'Unstar' : 'Star'}
                role="button"
                aria-label={p.starred ? 'Unstar project' : 'Star project'}
              >
                {p.starred ? '★' : '☆'}
              </span>
              <span style={{ color: T.accent.primary, fontWeight: 500 }}>#</span>
              <span style={{ flex: 1, color: T.text.primary }}>{p.name}</span>
              {p.status === 'completed' && <span style={{ fontSize: '10px', color: T.accent.success }} title="Completed" aria-label="Project completed">✓</span>}
              {p.status === 'archived' && <span style={{ fontSize: '10px', color: T.text.tertiary }} title="Archived" aria-label="Project archived">⊘</span>}
            </div>
          ))}

          {/* Employees */}
          <div style={{ ...styles.sidebarSection, marginTop: '20px' }}>
            <span>Employees</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setShowArchived(!showArchived)} style={{ ...styles.addBtn, fontSize: '11px' }} title={showArchived ? 'Hide archived' : 'Show archived'} onMouseOver={e => e.target.style.color = T.accent.primary} onMouseOut={e => e.target.style.color = T.text.tertiary}>
                {showArchived ? '◉' : '○'}
              </button>
              <button onClick={() => { setShowEmployeeModal(true); setEditingEmployee(null); setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' }) }} style={styles.addBtn} onMouseOver={e => e.target.style.color = T.accent.primary} onMouseOut={e => e.target.style.color = T.text.tertiary}>+</button>
            </div>
          </div>
          {employees
            .filter(e => showArchived || !e.archived)
            .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
            .map(e => (
            <div
              key={e.id}
              onClick={() => setActiveChannel({ type: 'dm', id: e.id, name: e.name })}
              onContextMenu={(ev) => { ev.preventDefault(); if (!e.is_default) handleDeleteEmployee(e.id) }}
              style={{ ...styles.channel, ...(activeChannel?.type === 'dm' && activeChannel?.id === e.id ? styles.channelActive : {}), flexDirection: 'column', alignItems: 'flex-start', gap: '2px', opacity: e.archived ? 0.5 : 1 }}
              className="sidebar-channel"
              onMouseEnter={ev => { if (!(activeChannel?.type === 'dm' && activeChannel?.id === e.id)) ev.currentTarget.style.background = T.bg.hover }}
              onMouseLeave={ev => { if (!(activeChannel?.type === 'dm' && activeChannel?.id === e.id)) ev.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                <span
                  onClick={(ev) => handleToggleEmployeeStar(e.id, ev)}
                  style={{ cursor: 'pointer', color: e.starred ? T.accent.warning : T.text.tertiary, fontSize: '12px', transition: T.transition.fast }}
                  title={e.starred ? 'Unstar' : 'Star'}
                  role="button"
                  aria-label={e.starred ? 'Unstar employee' : 'Star employee'}
                >
                  {e.starred ? '★' : '☆'}
                </span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: e.archived ? T.text.tertiary : T.accent.success, flexShrink: 0 }} aria-label={e.archived ? 'Offline' : 'Online'}></span>
                <span style={{ fontWeight: 500, flex: 1, color: T.text.primary }}>{e.name}</span>
                {e.archived && <span style={{ fontSize: '10px', color: T.text.tertiary }} title="Archived" aria-label="Employee archived">⊘</span>}
                <span
                  onClick={(ev) => handleToggleArchiveEmployee(e.id, ev)}
                  style={{ cursor: 'pointer', color: T.text.tertiary, fontSize: '11px', opacity: 0.6, transition: T.transition.fast }}
                  title={e.archived ? 'Unarchive' : 'Archive'}
                  role="button"
                  aria-label={e.archived ? 'Unarchive employee' : 'Archive employee'}
                  onMouseEnter={(ev) => { ev.currentTarget.style.opacity = '1'; ev.currentTarget.style.color = T.accent.primary }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.opacity = '0.6'; ev.currentTarget.style.color = T.text.tertiary }}
                >
                  {e.archived ? '↩' : '⊘'}
                </span>
              </div>
              {e.role && <div style={{ color: T.text.tertiary, fontSize: '11px', paddingLeft: '30px' }}>{e.role}</div>}
            </div>
          ))}
        </div>

        {/* Fixed Footer - User Profile with Dropdown */}
        <div ref={userMenuRef} style={{ flexShrink: 0, padding: '12px', borderTop: `1px solid ${T.border.primary}`, position: 'relative' }}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '8px 10px',
              background: showUserMenu ? T.bg.tertiary : 'transparent',
              border: 'none',
              borderRadius: T.radius.md,
              cursor: 'pointer',
              transition: T.transition.fast,
              textAlign: 'left'
            }}
            onMouseOver={e => { if (!showUserMenu) e.currentTarget.style.background = T.bg.tertiary }}
            onMouseOut={e => { if (!showUserMenu) e.currentTarget.style.background = 'transparent' }}
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
          >
            <span style={{ width: '32px', height: '32px', borderRadius: T.radius.md, background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text.onAccent, fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
              {user.name?.[0] || 'U'}
            </span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.text.primary }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: T.text.tertiary }}>{user.email}</div>
            </div>
            <span style={{ color: T.text.tertiary, fontSize: '10px', transition: T.transition.fast, transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '12px',
                right: '12px',
                marginBottom: '4px',
                background: T.bg.elevated,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.lg,
                boxShadow: T.shadow.lg,
                overflow: 'hidden',
                zIndex: 100
              }}
            >
              <button
                role="menuitem"
                onClick={() => { setShowSettings(true); setActiveChannel(null); setShowUserMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', color: T.text.primary, fontSize: '13px', cursor: 'pointer', transition: T.transition.fast, textAlign: 'left' }}
                onMouseOver={e => e.currentTarget.style.background = T.bg.hover}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: '18px', opacity: 0.7 }}>⚙️</span>
                Settings
              </button>
              <button
                role="menuitem"
                onClick={() => { fetchRoleLibrary(); setShowRoleLibrary(true); setShowUserMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', color: T.text.primary, fontSize: '13px', cursor: 'pointer', transition: T.transition.fast, textAlign: 'left' }}
                onMouseOver={e => e.currentTarget.style.background = T.bg.hover}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: '18px', opacity: 0.7 }}>👤</span>
                Role Library
              </button>
              <button
                role="menuitem"
                onClick={() => { fetchUsageStats(); setShowUsageModal(true); setShowUserMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', color: T.text.primary, fontSize: '13px', cursor: 'pointer', transition: T.transition.fast, textAlign: 'left' }}
                onMouseOver={e => e.currentTarget.style.background = T.bg.hover}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: '18px', opacity: 0.7 }}>📊</span>
                Usage Stats
              </button>
              <div style={{ height: '1px', background: T.border.primary, margin: '4px 0' }} />
              <button
                role="menuitem"
                onClick={() => { handleLogout(); setShowUserMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', color: T.accent.danger, fontSize: '13px', cursor: 'pointer', transition: T.transition.fast, textAlign: 'left' }}
                onMouseOver={e => e.currentTarget.style.background = T.accent.dangerMuted}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: '18px', opacity: 0.7 }}>🚪</span>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {showSettings ? (
          <div style={{ flex: 1, overflow: 'auto', padding: '40px' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <h1 style={{ color: T.text.primary, marginBottom: '8px', fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px' }}>Settings</h1>
              <p style={{ color: T.text.secondary, marginBottom: '40px' }}>Configure your AI team's capabilities.</p>

              {/* API Keys Section */}
              <div style={{ marginBottom: '50px' }}>
                <h2 style={{ color: T.text.primary, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 600 }}>
                  API Keys
                  {(apiKeys.has_openai_key || apiKeys.has_anthropic_key) && (
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: T.accent.successMuted, color: T.accent.success, borderRadius: '12px' }}>
                      {apiKeys.has_openai_key && apiKeys.has_anthropic_key ? '2 configured' : '1 configured'}
                    </span>
                  )}
                </h2>
                <p style={{ color: T.text.secondary, fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
                  Your API keys are encrypted and stored securely. You only need to add keys for the AI models you want to use.
                </p>

                {/* OpenAI Card */}
                <div style={{ background: T.bg.secondary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.lg, padding: '24px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ margin: 0, color: T.text.primary, fontSize: '16px', fontWeight: 600 }}>OpenAI</h3>
                        {apiKeys.has_openai_key && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: T.accent.successMuted, color: T.accent.success, borderRadius: '10px' }}>Connected</span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: T.text.secondary, fontSize: '13px' }}>Powers GPT-4, GPT-4 Turbo, and GPT-3.5 models</p>
                    </div>
                    <div style={{ width: '40px', height: '40px', background: PROVIDER_COLORS.openai.bg, borderRadius: T.radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: PROVIDER_COLORS.openai.text, fontSize: '16px', fontWeight: 'bold' }}>AI</span>
                    </div>
                  </div>

                  {apiKeys.has_openai_key ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, padding: '10px 14px', background: T.bg.tertiary, borderRadius: T.radius.md, color: T.text.secondary, fontSize: '14px' }}>
                        sk-...hidden
                      </div>
                      <button onClick={() => removeApiKey('openai')} style={{ padding: '10px 16px', background: T.accent.dangerMuted, border: `1px solid ${T.accent.danger}40`, color: T.accent.danger, borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', transition: T.transition.fast }} onMouseOver={e => e.target.style.background = T.accent.danger} onMouseOut={e => e.target.style.background = T.accent.dangerMuted}>
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
                        style={{ width: '100%', padding: '12px 14px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = T.accent.primary}
                        onBlur={e => e.target.style.borderColor = T.border.primary}
                      />
                      <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '14px', fontSize: '13px', color: T.text.secondary, lineHeight: 1.6 }}>
                        <strong style={{ color: T.text.primary }}>How to get your OpenAI API key:</strong>
                        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                          <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: T.accent.primary }}>platform.openai.com/api-keys</a></li>
                          <li>Sign in or create an OpenAI account</li>
                          <li>Click "Create new secret key"</li>
                          <li>Copy the key (starts with <code style={{ background: T.bg.hover, padding: '2px 6px', borderRadius: '3px', color: T.accent.primaryHover }}>sk-proj-</code>)</li>
                        </ol>
                        <p style={{ margin: '10px 0 0 0', color: T.text.tertiary, fontSize: '12px' }}>
                          Note: OpenAI charges based on usage. New accounts get free credits to start.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Anthropic Card */}
                <div style={{ background: T.bg.secondary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.lg, padding: '24px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ margin: 0, color: T.text.primary, fontSize: '16px', fontWeight: 600 }}>Anthropic</h3>
                        {apiKeys.has_anthropic_key && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: T.accent.successMuted, color: T.accent.success, borderRadius: '10px' }}>Connected</span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: T.text.secondary, fontSize: '13px' }}>Powers Claude 3 Opus and Claude 3 Sonnet models</p>
                    </div>
                    <div style={{ width: '40px', height: '40px', background: PROVIDER_COLORS.anthropic.bg, borderRadius: T.radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: PROVIDER_COLORS.anthropic.text, fontSize: '16px', fontWeight: 'bold' }}>A</span>
                    </div>
                  </div>

                  {apiKeys.has_anthropic_key ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, padding: '10px 14px', background: T.bg.tertiary, borderRadius: T.radius.md, color: T.text.secondary, fontSize: '14px' }}>
                        sk-ant-...hidden
                      </div>
                      <button onClick={() => removeApiKey('anthropic')} style={{ padding: '10px 16px', background: T.accent.dangerMuted, border: `1px solid ${T.accent.danger}40`, color: T.accent.danger, borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', transition: T.transition.fast }} onMouseOver={e => e.target.style.background = T.accent.danger} onMouseOut={e => e.target.style.background = T.accent.dangerMuted}>
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
                        style={{ width: '100%', padding: '12px 14px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = T.accent.primary}
                        onBlur={e => e.target.style.borderColor = T.border.primary}
                      />
                      <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '14px', fontSize: '13px', color: T.text.secondary, lineHeight: 1.6 }}>
                        <strong style={{ color: T.text.primary }}>How to get your Anthropic API key:</strong>
                        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                          <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: T.accent.primary }}>console.anthropic.com/settings/keys</a></li>
                          <li>Sign in or create an Anthropic account</li>
                          <li>Click "Create Key"</li>
                          <li>Copy the key (starts with <code style={{ background: T.bg.hover, padding: '2px 6px', borderRadius: '3px', color: T.accent.primaryHover }}>sk-ant-</code>)</li>
                        </ol>
                        <p style={{ margin: '10px 0 0 0', color: T.text.tertiary, fontSize: '12px' }}>
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
                      background: T.accent.success,
                      color: T.text.onAccent,
                      border: 'none',
                      borderRadius: T.radius.md,
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: savingKeys ? 'not-allowed' : 'pointer',
                      opacity: savingKeys ? 0.7 : 1,
                      transition: T.transition.fast
                    }}
                  >
                    {savingKeys ? 'Saving...' : 'Save API Keys'}
                  </button>
                )}
              </div>

              {/* Memories Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h2 style={{ color: T.text.primary, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 600 }}>
                    Memories
                    {memories.length > 0 && (
                      <span style={{ fontSize: '12px', padding: '4px 10px', background: T.accent.primaryMuted, color: T.accent.primary, borderRadius: '12px' }}>
                        {memories.length} saved
                      </span>
                    )}
                  </h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {memories.length > 0 && (
                      <button onClick={handleExportMemories} style={{ ...styles.btn, background: T.accent.infoMuted, color: T.accent.info, border: `1px solid ${T.accent.info}40`, fontSize: '12px' }}>
                        Export All
                      </button>
                    )}
                    <label style={{ ...styles.btn, background: T.accent.primaryMuted, color: T.accent.primary, border: `1px solid ${T.accent.primary}40`, fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', margin: 0 }}>
                      Import
                      <input type="file" accept=".json" onChange={handleImportMemories} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
                <p style={{ color: T.text.secondary, fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
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
                      style={{ width: '100%', padding: '12px 14px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', boxSizing: 'border-box', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                    />
                  </div>
                )}

                {/* Add Memory Form */}
                <form onSubmit={handleCreateMemory} style={{ marginBottom: '24px', padding: '16px', background: T.bg.secondary, borderRadius: T.radius.lg, border: `1px solid ${T.border.primary}` }}>
                  <div style={{ marginBottom: '12px' }}>
                    <textarea
                      placeholder="Enter a fact you want your AI employees to remember..."
                      value={newMemory.content}
                      onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                      style={{ width: '100%', padding: '12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, minHeight: '80px', fontSize: '14px', resize: 'vertical', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={newMemory.category}
                      onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
                      style={{ padding: '8px 12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', background: T.bg.tertiary, color: T.text.primary }}
                    >
                      <option value="">No category</option>
                      <option value="preference">Preference</option>
                      <option value="fact">Fact</option>
                      <option value="context">Context</option>
                      <option value="instruction">Instruction</option>
                      <option value="other">Other</option>
                    </select>
                    <select
                      value={newMemory.employee_id}
                      onChange={(e) => setNewMemory({ ...newMemory, employee_id: e.target.value })}
                      style={{ padding: '8px 12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', background: T.bg.tertiary, color: T.text.primary }}
                    >
                      <option value="">All employees (shared)</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name} only</option>)}
                    </select>
                    <select
                      value={newMemory.project_id}
                      onChange={(e) => setNewMemory({ ...newMemory, project_id: e.target.value })}
                      style={{ padding: '8px 12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, fontSize: '14px', background: T.bg.tertiary, color: T.text.primary }}
                    >
                      <option value="">All projects</option>
                      {projects.map(p => <option key={p.id} value={p.id}>#{p.name} only</option>)}
                    </select>
                    <button
                      type="submit"
                      disabled={savingMemory || !newMemory.content.trim()}
                      style={{ padding: '10px 18px', background: T.accent.primary, color: T.text.onAccent, border: 'none', borderRadius: T.radius.md, cursor: (savingMemory || !newMemory.content.trim()) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500, opacity: (savingMemory || !newMemory.content.trim()) ? 0.6 : 1, transition: T.transition.fast }}
                    >
                      {savingMemory ? 'Saving...' : 'Add Memory'}
                    </button>
                  </div>
                </form>

                {memories.length === 0 ? (
                  <div style={{ background: T.bg.secondary, borderRadius: T.radius.lg, padding: '30px', textAlign: 'center', border: `1px solid ${T.border.primary}` }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧠</div>
                    <p style={{ color: T.text.secondary, margin: 0, marginBottom: '8px' }}>No memories yet</p>
                    <p style={{ color: T.text.tertiary, fontSize: '13px', margin: 0 }}>
                      Memories are created when you chat with employees. Ask them to "remember" something important.
                    </p>
                  </div>
                ) : (() => {
                  const filteredMemories = memorySearch.trim()
                    ? memories.filter(m =>
                        m.content.toLowerCase().includes(memorySearch.toLowerCase()) ||
                        (m.employee_name && m.employee_name.toLowerCase().includes(memorySearch.toLowerCase())) ||
                        (m.project_name && m.project_name.toLowerCase().includes(memorySearch.toLowerCase())) ||
                        (m.category && m.category.toLowerCase().includes(memorySearch.toLowerCase()))
                      )
                    : memories
                  return filteredMemories.length === 0 ? (
                    <div style={{ background: T.bg.tertiary, borderRadius: T.radius.lg, padding: '30px', textAlign: 'center' }}>
                      <p style={{ color: T.text.secondary, margin: 0 }}>No memories match "{memorySearch}"</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {memorySearch.trim() && (
                        <div style={{ fontSize: '13px', color: T.text.secondary, marginBottom: '4px' }}>
                          Showing {filteredMemories.length} of {memories.length} memories
                        </div>
                      )}
                      {filteredMemories.map(m => (
                        <div key={m.id} style={{ background: T.bg.tertiary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p style={{ margin: 0, color: T.text.primary, lineHeight: 1.5, flex: 1 }}>{m.content}</p>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              style={{ background: 'none', border: 'none', color: T.text.tertiary, cursor: 'pointer', padding: '4px 8px', fontSize: '14px', transition: T.transition.fast }}
                              title="Delete memory"
                            >
                              ×
                            </button>
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {m.category && (
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                background: CATEGORY_COLORS[m.category]?.bg || T.bg.hover,
                                color: CATEGORY_COLORS[m.category]?.text || T.text.secondary
                              }}>
                                {m.category}
                              </span>
                            )}
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: m.project_name ? T.accent.warningMuted : m.employee_name ? T.accent.successMuted : T.accent.infoMuted,
                              color: m.project_name ? T.accent.warning : m.employee_name ? T.accent.success : T.accent.info
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong>{activeChannel.type === 'project' ? '#' : ''}{activeChannel.name}</strong>
                  {activeChannel.type === 'project' && <span style={{ color: T.text.tertiary, fontSize: '14px' }}>Use @name to mention an employee</span>}
                </div>
                {activeChannel.type === 'project' && (() => {
                  const project = projects.find(p => p.id === activeChannel.id)
                  return project?.description ? (
                    <div style={{ fontSize: '12px', color: T.text.tertiary, marginTop: '2px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.description}>
                      {project.description}
                    </div>
                  ) : null
                })()}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} className="chat-header-buttons">
                {messages.length > 0 && (() => {
                  const contextMessages = freshContextFrom !== null ? messages.slice(freshContextFrom) : messages
                  const totalTokens = contextMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
                  const tokenColor = totalTokens > 100000 ? T.accent.danger : totalTokens > 50000 ? T.accent.warning : T.accent.success
                  return (
                    <span style={{ fontSize: '11px', padding: '4px 8px', background: T.bg.tertiary, color: T.text.secondary, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Estimated tokens in context">
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tokenColor }}></span>
                      ~{totalTokens.toLocaleString()} tokens
                    </span>
                  )
                })()}
                {freshContextFrom !== null && (
                  <span style={{ fontSize: '12px', padding: '4px 10px', background: T.accent.warningMuted, color: T.accent.warning, borderRadius: '12px' }}>
                    Fresh context active
                  </span>
                )}
                {messages.length > 0 && (
                  <>
                    <button onClick={handleExportMarkdown} style={{ ...styles.btn, background: T.accent.primaryMuted, color: T.accent.primary, border: `1px solid ${T.accent.primary}40` }} title="Export conversation as Markdown">
                      MD
                    </button>
                    <button onClick={handleExportPDF} style={{ ...styles.btn, background: T.accent.dangerMuted, color: T.accent.danger, border: `1px solid ${T.accent.danger}40` }} title="Export conversation as PDF">
                      PDF
                    </button>
                    {freshContextFrom === null ? (
                      <button onClick={handleStartFresh} style={{ ...styles.btn, background: T.accent.infoMuted, color: T.accent.info, border: `1px solid ${T.accent.info}40` }} title="Clear AI context without deleting messages">
                        Start Fresh
                      </button>
                    ) : (
                      <button onClick={handleResumeContext} style={{ ...styles.btn, background: T.accent.successMuted, color: T.accent.success, border: `1px solid ${T.accent.success}40` }} title="Restore full conversation context">
                        Resume Full
                      </button>
                    )}
                    <button onClick={handleClearChat} style={{ ...styles.btn, background: T.accent.dangerMuted, color: T.accent.danger, border: `1px solid ${T.accent.danger}40` }}>
                      Clear
                    </button>
                  </>
                )}
                {activeChannel.type === 'dm' && (
                  <button
                    onClick={() => { setEditingEmployee(employees.find(e => e.id === activeChannel.id)); setEmployeeForm(employees.find(e => e.id === activeChannel.id) || {}); setShowEmployeeModal(true) }}
                    style={{ ...styles.btn, background: T.bg.tertiary, color: T.text.primary, border: `1px solid ${T.border.primary}` }}
                  >
                    Edit Employee
                  </button>
                )}
                {activeChannel.type === 'project' && (
                  <button
                    onClick={() => { setEditingProject(projects.find(p => p.id === activeChannel.id)); setProjectForm(projects.find(p => p.id === activeChannel.id) || {}); setShowProjectModal(true) }}
                    style={{ ...styles.btn, background: T.bg.tertiary, color: T.text.primary, border: `1px solid ${T.border.primary}` }}
                  >
                    Edit Project
                  </button>
                )}
              </div>
            </div>

            <div style={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
              {/* Tags row */}
              <div style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {conversationTags.map(tag => (
                  <span key={tag} style={{ fontSize: '11px', padding: '4px 10px', background: T.accent.primaryMuted, color: T.accent.primary, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent.primary, padding: 0, fontSize: '12px', opacity: 0.7, transition: T.transition.fast }} onMouseOver={e => e.target.style.opacity = 1} onMouseOut={e => e.target.style.opacity = 0.7} aria-label={`Remove tag ${tag}`}>×</button>
                  </span>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="Add tag..."
                    style={{ padding: '4px 10px', fontSize: '11px', border: `1px solid ${T.border.primary}`, borderRadius: '12px', width: '80px', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = T.accent.primary}
                    onBlur={e => e.target.style.borderColor = T.border.primary}
                  />
                  {newTag && <button onClick={handleAddTag} style={{ background: T.accent.primary, color: T.text.onAccent, border: 'none', borderRadius: '12px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', transition: T.transition.fast }}>+</button>}
                </div>
              </div>

              {/* Project employees (for project channels) */}
              {activeChannel.type === 'project' && (
                <div style={{ marginBottom: '12px', padding: '10px 14px', background: T.bg.secondary, borderRadius: T.radius.md, fontSize: '12px', border: `1px solid ${T.border.subtle}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, color: T.text.secondary }}>Team:</span>
                    {projectEmployees.map(pe => (
                      <span key={pe.id} style={{ padding: '3px 10px', background: T.bg.tertiary, borderRadius: '12px', border: `1px solid ${T.border.primary}`, display: 'flex', alignItems: 'center', gap: '6px', color: T.text.primary }}>
                        {pe.name}
                        <button onClick={() => handleUnassignEmployee(pe.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text.tertiary, padding: 0, fontSize: '12px', transition: T.transition.fast }} onMouseOver={e => e.target.style.color = T.accent.danger} onMouseOut={e => e.target.style.color = T.text.tertiary} aria-label={`Remove ${pe.name} from project`}>×</button>
                      </span>
                    ))}
                    <select
                      onChange={(e) => { if (e.target.value) { handleAssignEmployee(e.target.value); e.target.value = '' } }}
                      style={{ padding: '3px 8px', fontSize: '11px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.sm, background: T.bg.tertiary, color: T.text.primary }}
                      defaultValue=""
                    >
                      <option value="">+ Add</option>
                      {employees.filter(e => !projectEmployees.find(pe => pe.id === e.id)).map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Pinned messages banner */}
              {pinnedMessages.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: T.accent.warningMuted, borderRadius: T.radius.md, border: `1px solid ${T.accent.warning}40` }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: T.accent.warning, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📌 {pinnedMessages.length} Pinned Message{pinnedMessages.length > 1 ? 's' : ''}
                  </div>
                  {pinnedMessages.slice(0, 3).map(pm => (
                    <div key={pm.id} style={{ fontSize: '13px', color: T.text.secondary, padding: '4px 0', borderTop: `1px solid ${T.border.subtle}` }}>
                      <span style={{ fontWeight: 500, color: T.text.primary }}>{pm.role === 'user' ? user.name : getEmployeeName(pm.employee_id)}: </span>
                      {pm.content.length > 100 ? pm.content.slice(0, 100) + '...' : pm.content}
                    </div>
                  ))}
                  {pinnedMessages.length > 3 && (
                    <div style={{ fontSize: '11px', color: T.text.tertiary, marginTop: '4px' }}>
                      +{pinnedMessages.length - 3} more pinned
                    </div>
                  )}
                </div>
              )}
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: T.text.secondary, marginTop: '60px', padding: '40px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                  <p style={{ fontSize: '16px', fontWeight: 500, color: T.text.primary, marginBottom: '8px' }}>Start a conversation</p>
                  <p style={{ fontSize: '14px', color: T.text.tertiary, maxWidth: '300px', margin: '0 auto' }}>
                    Type a message below to chat with {activeChannel?.type === 'dm' ? activeChannel.name : 'your AI team'}. Use @mentions to address specific employees.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id || i} style={{ marginBottom: '20px', display: 'flex', gap: '12px', position: 'relative' }} className="message-container">
                  <div style={{ width: '38px', height: '38px', borderRadius: T.radius.md, background: msg.role === 'user' ? `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})` : `linear-gradient(135deg, ${T.accent.success}, ${T.accent.successHover})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text.onAccent, fontSize: '14px', flexShrink: 0, fontWeight: 600 }}>
                    {msg.role === 'user' ? (user.name?.[0] || 'U') : (msg.employee_id ? getEmployeeName(msg.employee_id)?.[0] : 'A')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: T.text.primary }}>
                        {msg.role === 'user' ? user.name : (msg.employee_id ? getEmployeeName(msg.employee_id) : 'Assistant')}
                      </span>
                      {msg.created_at && (
                        <span style={{ fontSize: '11px', color: T.text.tertiary }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        style={{ background: 'none', border: 'none', color: copiedMessageId === msg.id ? T.accent.success : T.text.tertiary, cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: copiedMessageId === msg.id ? 1 : 0.6, transition: T.transition.fast }}
                        title="Copy message"
                        aria-label="Copy message to clipboard"
                        onMouseEnter={(e) => { if (copiedMessageId !== msg.id) { e.target.style.opacity = 1; e.target.style.color = T.accent.primary }}}
                        onMouseLeave={(e) => { if (copiedMessageId !== msg.id) { e.target.style.opacity = 0.6; e.target.style.color = T.text.tertiary }}}
                      >
                        {copiedMessageId === msg.id ? '✓ Copied' : 'Copy'}
                      </button>
                      {msg.id && !isStreaming && (
                        <button
                          onClick={() => handleTogglePin(msg.id)}
                          style={{ background: 'none', border: 'none', color: msg.pinned ? T.accent.warning : T.text.tertiary, cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: msg.pinned ? 1 : 0.6, transition: T.transition.fast }}
                          title={msg.pinned ? 'Unpin message' : 'Pin message'}
                          aria-label={msg.pinned ? 'Unpin message' : 'Pin message'}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = msg.pinned ? 1 : 0.6}
                        >
                          {msg.pinned ? '📌' : 'Pin'}
                        </button>
                      )}
                      {msg.id && msg.role === 'user' && !isStreaming && (
                        <>
                          <button
                            onClick={() => { setEditingMessage(msg.id); setEditMessageContent(msg.content) }}
                            style={{ background: 'none', border: 'none', color: T.text.tertiary, cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: 0.6, transition: T.transition.fast }}
                            title="Edit message"
                            aria-label="Edit message"
                            onMouseEnter={(e) => { e.target.style.opacity = 1; e.target.style.color = T.accent.primary }}
                            onMouseLeave={(e) => { e.target.style.opacity = 0.6; e.target.style.color = T.text.tertiary }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            style={{ background: 'none', border: 'none', color: T.accent.danger, cursor: 'pointer', padding: '2px 6px', fontSize: '12px', opacity: 0.6, transition: T.transition.fast }}
                            title="Delete message"
                            aria-label="Delete message"
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
                          style={{ width: '100%', padding: '12px', border: `1px solid ${T.border.primary}`, borderRadius: T.radius.md, minHeight: '60px', fontSize: '14px', resize: 'vertical', background: T.bg.tertiary, color: T.text.primary, outline: 'none' }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleEditMessage(msg.id)} style={{ padding: '6px 12px', background: T.accent.primary, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: T.transition.fast }}>Save</button>
                          <button onClick={() => { setEditingMessage(null); setEditMessageContent('') }} style={{ padding: '6px 12px', background: T.bg.tertiary, color: T.text.primary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, color: T.text.primary }}>
                        {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatError && (
                <div
                  role="alert"
                  aria-live="polite"
                  style={{ padding: '15px', background: T.accent.dangerMuted, borderRadius: T.radius.md, color: T.accent.danger, marginBottom: '15px', border: `1px solid ${T.accent.danger}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                >
                  <span>{chatError}</span>
                  <button
                    onClick={() => setChatError(null)}
                    style={{ background: 'none', border: 'none', color: T.accent.danger, cursor: 'pointer', fontSize: '18px', padding: '0 4px', opacity: 0.7, transition: T.transition.fast }}
                    onMouseEnter={e => e.target.style.opacity = 1}
                    onMouseLeave={e => e.target.style.opacity = 0.7}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '15px', borderTop: `1px solid ${T.border.primary}` }}>
              {activeChannel.type === 'dm' && uploadedFiles.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {uploadedFiles.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', background: T.accent.infoMuted, padding: '4px 10px', borderRadius: '15px', fontSize: '12px' }}>
                      <span style={{ marginRight: '6px', color: T.text.primary }}>{f.filename}</span>
                      <button onClick={() => handleDownloadFile(f.id, f.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent.info, padding: '0 4px', fontSize: '12px' }} title="Download">↓</button>
                      <button onClick={() => handleDeleteFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text.tertiary, padding: '0', fontSize: '14px' }} title="Delete">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }} className="chat-input-area">
                {activeChannel.type === 'dm' && (
                  <>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".txt,.md,.json,.csv,.py,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.log,.sql" aria-label="Upload file" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || uploading || uploadedFiles.length >= 5}
                      style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, opacity: (isStreaming || uploading || uploadedFiles.length >= 5) ? 0.6 : 1, cursor: (isStreaming || uploading || uploadedFiles.length >= 5) ? 'not-allowed' : 'pointer', flexShrink: 0, border: `1px solid ${T.border.primary}`, position: 'relative' }}
                      aria-label={`Upload file (${uploadedFiles.length}/5 files)`}
                      title={uploadedFiles.length >= 5 ? 'Maximum 5 files reached' : `Upload file (${uploadedFiles.length}/5)`}
                    >
                      {uploading ? '...' : `+ ${uploadedFiles.length}/5`}
                    </button>
                  </>
                )}
                <select
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  style={{ padding: '8px', border: `1px solid ${T.border.primary}`, borderRadius: '6px', fontSize: '12px', background: modelOverride ? T.accent.primaryMuted : T.bg.tertiary, color: T.text.primary, flexShrink: 0 }}
                  title="Override model for this conversation"
                >
                  <option value="">Default Model</option>
                  <optgroup label="OpenAI">
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </optgroup>
                  <optgroup label="Anthropic">
                    <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus">Claude 3 Opus</option>
                    <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                    <option value="claude-3-haiku">Claude 3 Haiku</option>
                  </optgroup>
                </select>
                <div style={{ flex: 1, minWidth: '0', position: 'relative' }}>
                  <textarea
                    value={chatInput}
                    onChange={handleChatInputChange}
                    onKeyDown={handleChatInputKeyDown}
                    placeholder={activeChannel.type === 'project' ? 'Message #' + activeChannel.name + ' (type @ to mention)' : 'Message ' + activeChannel.name}
                    disabled={isStreaming}
                    rows={1}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: `1px solid ${T.border.primary}`,
                      borderRadius: T.radius.md,
                      fontSize: '14px',
                      background: T.bg.tertiary,
                      color: T.text.primary,
                      outline: 'none',
                      transition: T.transition.fast,
                      boxSizing: 'border-box',
                      resize: 'none',
                      overflow: 'hidden',
                      minHeight: '48px',
                      maxHeight: '200px',
                      lineHeight: '1.5',
                      fontFamily: 'inherit'
                    }}
                    onFocus={e => e.target.style.borderColor = T.accent.primary}
                    onBlur={e => { e.target.style.borderColor = T.border.primary; setTimeout(() => setMentionDropdown({ show: false, matches: [], position: 0, selectedIndex: 0 }), 150) }}
                    onInput={e => {
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                    }}
                  />
                  {/* @mention autocomplete dropdown */}
                  {mentionDropdown.show && activeChannel.type === 'project' && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      marginBottom: '4px',
                      background: T.bg.elevated,
                      border: `1px solid ${T.border.primary}`,
                      borderRadius: T.radius.md,
                      boxShadow: T.shadow.lg,
                      overflow: 'hidden',
                      zIndex: 100
                    }}>
                      {mentionDropdown.matches.map((emp, index) => (
                        <div
                          key={emp.id}
                          onClick={() => handleMentionSelect(emp)}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: index === mentionDropdown.selectedIndex ? T.accent.primaryMuted : 'transparent',
                            borderLeft: index === mentionDropdown.selectedIndex ? `3px solid ${T.accent.primary}` : '3px solid transparent',
                            transition: T.transition.fast
                          }}
                          onMouseEnter={() => setMentionDropdown(prev => ({ ...prev, selectedIndex: index }))}
                        >
                          <span style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: T.radius.sm,
                            background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: T.text.onAccent,
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {emp.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <div style={{ color: T.text.primary, fontWeight: 500 }}>{emp.name}</div>
                            {emp.role && <div style={{ color: T.text.tertiary, fontSize: '12px' }}>{emp.role}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={sendMessage} disabled={isStreaming || !chatInput.trim()} style={{ ...styles.btn, background: T.accent.primary, color: T.text.onAccent, opacity: (isStreaming || !chatInput.trim()) ? 0.6 : 1, cursor: (isStreaming || !chatInput.trim()) ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                  {isStreaming ? 'Sending...' : 'Send'}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: T.text.tertiary, marginTop: '6px', textAlign: 'right' }}>
                <kbd style={{ padding: '2px 6px', background: T.bg.tertiary, borderRadius: '4px', border: `1px solid ${T.border.primary}` }}>Enter</kbd> to send · <kbd style={{ padding: '2px 6px', background: T.bg.tertiary, borderRadius: '4px', border: `1px solid ${T.border.primary}` }}>Shift+Enter</kbd> for new line
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '40px' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h1 style={{ color: T.text.primary, marginBottom: '8px', fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px' }}>Welcome to QuietDesk</h1>
              <p style={{ color: T.text.secondary, marginBottom: '40px' }}>Your AI consulting team, configured by you.</p>

              {/* Team Section */}
              <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: T.text.primary, margin: 0, fontSize: '20px', fontWeight: 600 }}>Your Team</h2>
                  <button
                    onClick={() => { setShowEmployeeModal(true); setEditingEmployee(null); setEmployeeForm({ name: '', role: '', instructions: '', model: 'gpt-4' }) }}
                    style={{ padding: '10px 18px', background: T.accent.primary, color: T.text.onAccent, border: 'none', borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', fontWeight: 500, transition: T.transition.fast }}
                  >
                    + Add Employee
                  </button>
                </div>

                {employees.length === 0 ? (
                  <div style={{ padding: '50px 40px', background: T.bg.secondary, borderRadius: T.radius.lg, textAlign: 'center', border: `1px solid ${T.border.primary}` }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                    <p style={{ fontSize: '16px', fontWeight: 500, color: T.text.primary, margin: '0 0 8px 0' }}>Build your AI team</p>
                    <p style={{ fontSize: '14px', color: T.text.tertiary, margin: '0 0 20px 0', maxWidth: '280px', marginLeft: 'auto', marginRight: 'auto' }}>
                      Create AI employees with unique roles and expertise to help with your work.
                    </p>
                    <button
                      onClick={() => { setShowRoleLibrary(true); fetchRoleLibrary() }}
                      style={{ padding: '10px 20px', background: T.accent.primary, color: T.text.onAccent, border: 'none', borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', fontWeight: 500, transition: T.transition.fast }}
                    >
                      Browse Role Library
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {employees.map(e => (
                      <div
                        key={e.id}
                        style={{
                          background: T.bg.secondary,
                          border: `1px solid ${T.border.primary}`,
                          borderRadius: T.radius.lg,
                          padding: '20px',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.2s, border-color 0.2s'
                        }}
                        onClick={() => setActiveChannel({ type: 'dm', id: e.id, name: e.name })}
                        onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = T.shadow.md; ev.currentTarget.style.borderColor = T.accent.primary }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = T.border.primary }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: T.radius.md,
                            background: `linear-gradient(135deg, ${T.accent.success}, ${T.accent.successHover})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: T.text.onAccent,
                            fontSize: '20px',
                            fontWeight: 600,
                            flexShrink: 0
                          }}>
                            {e.name[0]?.toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '16px', color: T.text.primary, marginBottom: '4px' }}>{e.name}</div>
                            <div style={{ color: T.text.secondary, fontSize: '14px', marginBottom: '8px' }}>{e.role || 'No role assigned'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '11px',
                                padding: '3px 10px',
                                background: e.model?.startsWith('claude') ? PROVIDER_COLORS.anthropic.bg : PROVIDER_COLORS.openai.bg,
                                color: e.model?.startsWith('claude') ? PROVIDER_COLORS.anthropic.text : PROVIDER_COLORS.openai.text,
                                borderRadius: '12px'
                              }}>
                                {e.model || 'gpt-4'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setEditingEmployee(e); setEmployeeForm(e); setShowEmployeeModal(true) }}
                            style={{ background: 'none', border: 'none', color: T.text.tertiary, cursor: 'pointer', padding: '4px', fontSize: '18px', transition: T.transition.fast }}
                            title="Edit employee"
                            onMouseEnter={ev => ev.target.style.color = T.accent.primary}
                            onMouseLeave={ev => ev.target.style.color = T.text.tertiary}
                          >
                            ✎
                          </button>
                        </div>
                        {e.instructions && (
                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${T.border.subtle}`, color: T.text.tertiary, fontSize: '13px', lineHeight: 1.4 }}>
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
                <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '20px', textAlign: 'center', border: `1px solid ${T.border.subtle}` }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: T.accent.primary }}>{employees.length}</div>
                  <div style={{ color: T.text.secondary, fontSize: '14px' }}>Team Members</div>
                </div>
                <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '20px', textAlign: 'center', border: `1px solid ${T.border.subtle}` }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: T.accent.info }}>{projects.length}</div>
                  <div style={{ color: T.text.secondary, fontSize: '14px' }}>Projects</div>
                </div>
                <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '20px', textAlign: 'center', border: `1px solid ${T.border.subtle}` }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: T.accent.warning }}>{memories.length}</div>
                  <div style={{ color: T.text.secondary, fontSize: '14px' }}>Memories</div>
                </div>
                <div style={{ background: T.bg.tertiary, borderRadius: T.radius.md, padding: '20px', textAlign: 'center', border: `1px solid ${T.border.subtle}` }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: apiKeys.has_openai_key || apiKeys.has_anthropic_key ? T.accent.success : T.accent.danger }}>
                    {apiKeys.has_openai_key || apiKeys.has_anthropic_key ? '✓' : '!'}
                  </div>
                  <div style={{ color: T.text.secondary, fontSize: '14px' }}>API Keys</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div style={styles.modal} onClick={() => setShowProjectModal(false)} role="presentation">
          <div ref={projectModalRef} style={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
            <h3 id="project-modal-title" style={{ marginTop: 0 }}>{editingProject ? 'Edit Project' : 'New Project'}</h3>
            <form onSubmit={handleSaveProject}>
              <input type="text" placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} style={styles.input} required />
              <textarea placeholder="Description (optional)" value={projectForm.description || ''} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} style={styles.textarea} />
              <textarea
                placeholder="Project Instructions (optional) - These instructions apply to all AI employees when working in this project. Use variables: {{user_name}}, {{employee_name}}, {{project_name}}, {{date}}, {{day}}"
                value={projectForm.instructions || ''}
                onChange={(e) => setProjectForm({ ...projectForm, instructions: e.target.value })}
                style={{ ...styles.textarea, minHeight: '80px' }}
              />
              {editingProject && (
                <select value={projectForm.status || 'active'} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })} style={styles.input}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ ...styles.btn, background: T.accent.primary, color: T.text.onAccent }}>Save</button>
                <button type="button" onClick={() => setShowProjectModal(false)} style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}` }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div style={styles.modal} onClick={() => setShowEmployeeModal(false)} role="presentation">
          <div ref={employeeModalRef} style={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
            <h3 id="employee-modal-title" style={{ marginTop: 0 }}>{editingEmployee ? 'Edit Employee' : 'New Employee'}</h3>
            <form onSubmit={handleSaveEmployee}>
              <input type="text" placeholder="Name" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} style={styles.input} required disabled={editingEmployee?.is_default} />
              <input type="text" placeholder="Role (e.g., Developer, QA)" value={employeeForm.role || ''} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })} style={styles.input} />
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: T.text.secondary, marginBottom: '4px', display: 'block' }}>Instruction Template</label>
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
                <button type="submit" style={{ ...styles.btn, background: T.accent.primary, color: T.text.onAccent }}>Save</button>
                <button type="button" onClick={() => setShowEmployeeModal(false)} style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}` }}>Cancel</button>
                <div style={{ flex: 1 }}></div>
                {editingEmployee && (
                  <button type="button" onClick={handleExportEmployee} style={{ ...styles.btn, background: T.accent.info, color: T.text.onAccent, fontSize: '12px' }} title="Export configuration">
                    Export
                  </button>
                )}
                <label style={{ ...styles.btn, background: T.accent.primary, color: T.text.onAccent, fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', margin: 0 }}>
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
              <h3 style={{ margin: 0, color: T.text.primary }}>File Preview</h3>
              <button onClick={() => setFilePreview(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: T.text.tertiary }} aria-label="Close file preview">×</button>
            </div>
            <div style={{ marginBottom: '15px', padding: '10px', background: T.bg.tertiary, borderRadius: T.radius.sm }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: T.text.primary }}>{filePreview.name}</div>
              <div style={{ fontSize: '12px', color: T.text.secondary }}>{(filePreview.size / 1024).toFixed(1)} KB</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: T.bg.tertiary, borderRadius: T.radius.sm, padding: '12px', marginBottom: '15px', border: `1px solid ${T.border.subtle}` }}>
              <pre style={{ margin: 0, color: T.text.secondary, fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                {filePreview.content}
                {filePreview.content.length >= 5000 && <span style={{ color: T.text.tertiary }}>... (truncated)</span>}
              </pre>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleFileUpload}
                disabled={uploading}
                style={{ ...styles.btn, background: T.accent.primary, color: T.text.onAccent, flex: 1, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
              <button onClick={() => setFilePreview(null)} style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}` }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Stats Modal */}
      {showUsageModal && (
        <div style={styles.modal} onClick={() => setShowUsageModal(false)} role="presentation">
          <div ref={usageModalRef} style={{ ...styles.modalContent, maxWidth: '600px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="usage-modal-title">
            <h3 id="usage-modal-title" style={{ marginTop: 0, color: T.text.primary }}>API Usage (Last 30 Days)</h3>
            {usageStats ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '20px' }}>
                  <div style={{ background: T.bg.tertiary, padding: '15px', borderRadius: T.radius.md, textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: T.accent.primary }}>{usageStats.total_requests.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: T.text.secondary }}>Total Requests</div>
                  </div>
                  <div style={{ background: T.bg.tertiary, padding: '15px', borderRadius: T.radius.md, textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: T.accent.info }}>{usageStats.total_tokens.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: T.text.secondary }}>Total Tokens</div>
                  </div>
                  <div style={{ background: T.accent.successMuted, padding: '15px', borderRadius: T.radius.md, textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: T.accent.success }}>${usageStats.estimated_total_cost.toFixed(2)}</div>
                    <div style={{ fontSize: '12px', color: T.text.secondary }}>Est. Cost</div>
                  </div>
                </div>
                <h4 style={{ marginBottom: '10px', color: T.text.primary }}>By Model</h4>
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {usageStats.by_model.map(m => (
                    <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border.subtle}` }}>
                      <span style={{ fontWeight: 500, color: T.text.primary }}>{m.model}</span>
                      <span style={{ color: T.text.secondary }}>
                        {m.requests} requests | {(m.input_tokens + m.output_tokens).toLocaleString()} tokens | ${m.estimated_cost.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ color: T.text.secondary }}>Loading usage data...</p>
            )}
            <div style={{ marginTop: '20px' }}>
              <button onClick={() => setShowUsageModal(false)} style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}` }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Role Library Modal */}
      {showRoleLibrary && (
        <div style={styles.modal} onClick={() => setShowRoleLibrary(false)} role="presentation">
          <div ref={roleLibraryRef} style={{ ...styles.modalContent, maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="role-library-title">
            <h3 id="role-library-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px', color: T.text.primary }}>
              Role Library
              <span style={{ fontSize: '12px', padding: '4px 10px', background: T.accent.infoMuted, color: T.accent.info, borderRadius: '12px' }}>
                {roleLibrary.total_employees} active roles
              </span>
            </h3>
            <p style={{ color: T.text.secondary, fontSize: '14px', marginBottom: '20px' }}>
              Add expert roles to your AI team. Each role comes with specialized instructions and boundaries.
            </p>

            {/* Memory Suggestions Alert */}
            {pendingSuggestionsCount > 0 && (
              <div style={{ background: T.accent.warningMuted, border: `1px solid ${T.accent.warning}`, borderRadius: T.radius.md, padding: '12px', marginBottom: '20px' }}>
                <strong style={{ color: T.text.primary }}>Memory Suggestions:</strong> <span style={{ color: T.text.secondary }}>{pendingSuggestionsCount} pending approval</span>
                <div style={{ marginTop: '10px' }}>
                  {memorySuggestions.slice(0, 3).map(s => (
                    <div key={s.id} style={{ background: T.bg.tertiary, padding: '10px', borderRadius: T.radius.sm, marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: T.text.primary }}>{s.content.length > 60 ? s.content.slice(0, 60) + '...' : s.content}</div>
                        <div style={{ fontSize: '11px', color: T.text.secondary }}>Suggested by {s.employee_name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleApproveMemorySuggestion(s.id)} style={{ padding: '4px 10px', background: T.accent.success, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '12px' }}>Approve</button>
                        <button onClick={() => handleRejectMemorySuggestion(s.id)} style={{ padding: '4px 10px', background: T.accent.danger, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '12px' }}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingRoles ? (
              <p style={{ color: T.text.secondary }}>Loading roles...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
                {roleLibrary.templates.map(template => (
                  <div key={template.id} style={{ background: T.bg.tertiary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.lg, padding: '16px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, color: T.text.primary }}>{template.name}</h4>
                        {template.is_default && <span style={{ fontSize: '10px', padding: '2px 6px', background: T.accent.primary, color: T.text.onAccent, borderRadius: '4px', marginLeft: '6px' }}>Default</span>}
                        {template.is_undeletable && <span style={{ fontSize: '10px', padding: '2px 6px', background: T.bg.hover, color: T.text.secondary, borderRadius: '4px', marginLeft: '4px' }}>Required</span>}
                      </div>
                      {template.in_use && (
                        <span style={{ fontSize: '11px', padding: '3px 8px', background: T.accent.successMuted, color: T.accent.success, borderRadius: '10px' }}>
                          {template.employees_using.length} in use
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: T.text.secondary, margin: '8px 0', lineHeight: 1.5 }}>{template.description}</p>

                    {/* What this role does */}
                    {template.boundaries_does.length > 0 && (
                      <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                        <strong style={{ color: T.accent.success }}>Does:</strong>
                        <ul style={{ margin: '4px 0', paddingLeft: '18px', color: T.text.secondary }}>
                          {template.boundaries_does.slice(0, 3).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                          {template.boundaries_does.length > 3 && <li style={{ color: T.text.tertiary }}>+{template.boundaries_does.length - 3} more...</li>}
                        </ul>
                      </div>
                    )}

                    {/* What this role does NOT do */}
                    {template.boundaries_does_not.length > 0 && (
                      <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                        <strong style={{ color: T.accent.danger }}>Does not:</strong>
                        <ul style={{ margin: '4px 0', paddingLeft: '18px', color: T.text.secondary }}>
                          {template.boundaries_does_not.slice(0, 2).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                          {template.boundaries_does_not.length > 2 && <li style={{ color: T.text.tertiary }}>+{template.boundaries_does_not.length - 2} more...</li>}
                        </ul>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {!template.in_use ? (
                        <button
                          onClick={() => handleAddRoleFromTemplate(template.id)}
                          style={{ padding: '6px 14px', background: T.accent.success, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '13px' }}
                        >
                          Add to Team
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAddRoleFromTemplate(template.id)}
                            style={{ padding: '6px 14px', background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}`, borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '13px' }}
                          >
                            Add Another
                          </button>
                          {template.employees_using.map(emp => (
                            <div key={emp.id} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <button
                                onClick={() => handleCloneEmployee(emp.id)}
                                style={{ padding: '4px 8px', background: T.accent.info, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '11px' }}
                                title={`Clone ${emp.name}`}
                              >
                                Clone
                              </button>
                              {!emp.is_default && (
                                <button
                                  onClick={() => handleResetToTemplate(emp.id)}
                                  style={{ padding: '4px 8px', background: T.accent.warning, color: T.text.onAccent, border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', fontSize: '11px' }}
                                  title="Reset to template defaults"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <button onClick={() => setShowRoleLibrary(false)} style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}` }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div style={styles.modal} onClick={() => setConfirmDialog(null)} role="presentation">
          <div ref={confirmDialogRef} style={{ ...styles.modalContent, maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-desc">
            <h3 id="confirm-dialog-title" style={{ marginTop: 0, color: T.text.primary }}>{confirmDialog.title}</h3>
            <p id="confirm-dialog-desc" style={{ color: T.text.secondary, marginBottom: '24px', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDialog(null)}
                style={{ ...styles.btn, background: T.bg.hover, color: T.text.primary, border: `1px solid ${T.border.primary}`, minWidth: '100px' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                style={{
                  ...styles.btn,
                  background: confirmDialog.confirmStyle === 'warning' ? T.accent.warning : T.accent.danger,
                  color: T.text.onAccent,
                  minWidth: '100px'
                }}
              >
                {confirmDialog.confirmText || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
