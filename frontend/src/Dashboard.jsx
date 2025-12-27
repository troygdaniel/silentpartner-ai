import { useState, useEffect, useRef } from 'react'

// Simple markdown renderer (basic implementation)
function renderMarkdown(text) {
  if (!text) return ''

  // Process line by line
  const lines = text.split('\n')
  let html = ''
  let inCodeBlock = false
  let inList = false

  for (let line of lines) {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        html += '</pre>'
        inCodeBlock = false
      } else {
        html += '<pre style="background:#1a1a24;padding:12px;border-radius:6px;overflow-x:auto;margin:8px 0;">'
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      html += line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n'
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      html += `<h3 style="font-size:16px;font-weight:600;margin:16px 0 8px;color:#f0f0f5;">${line.slice(4)}</h3>`
      continue
    }
    if (line.startsWith('## ')) {
      html += `<h2 style="font-size:18px;font-weight:600;margin:20px 0 10px;color:#f0f0f5;">${line.slice(3)}</h2>`
      continue
    }
    if (line.startsWith('# ')) {
      html += `<h1 style="font-size:22px;font-weight:700;margin:24px 0 12px;color:#f0f0f5;">${line.slice(2)}</h1>`
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      html += '<hr style="border:none;border-top:1px solid #2a2a3a;margin:16px 0;">'
      continue
    }

    // List items
    if (line.match(/^[-*] /)) {
      if (!inList) {
        html += '<ul style="margin:8px 0;padding-left:24px;">'
        inList = true
      }
      html += `<li style="margin:4px 0;">${line.slice(2)}</li>`
      continue
    } else if (inList && line.trim() === '') {
      html += '</ul>'
      inList = false
    }

    // Bold and italic
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Inline code
    line = line.replace(/`(.+?)`/g, '<code style="background:#1a1a24;padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>')

    // Regular paragraph
    if (line.trim()) {
      html += `<p style="margin:8px 0;line-height:1.6;">${line}</p>`
    }
  }

  if (inList) html += '</ul>'
  if (inCodeBlock) html += '</pre>'

  return html
}

// Theme (matches App.jsx)
const T = {
  bg: {
    primary: '#0a0a0f',
    secondary: '#12121a',
    tertiary: '#1a1a24',
    elevated: '#1e1e2a'
  },
  text: {
    primary: '#f0f0f5',
    secondary: '#9999aa',
    tertiary: '#666677',
    onAccent: '#ffffff'
  },
  border: {
    primary: '#2a2a3a',
    subtle: '#1e1e2a',
    hover: '#3a3a4a'
  },
  accent: {
    primary: '#6366f1',
    primaryHover: '#818cf8',
    primaryMuted: 'rgba(99, 102, 241, 0.15)',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6'
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px'
  }
}

// Request type colors
const REQUEST_TYPE_COLORS = {
  roadmap: T.accent.primary,
  analysis: T.accent.info,
  audit: T.accent.warning,
  review: T.accent.success,
  research: '#8b5cf6',
  custom: T.text.secondary
}

// Status colors
const STATUS_COLORS = {
  pending: T.accent.warning,
  processing: T.accent.info,
  completed: T.accent.success,
  failed: T.accent.error
}

export default function Dashboard({ token, onBack }) {
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [requestTypes, setRequestTypes] = useState([])
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [selectedDeliverable, setSelectedDeliverable] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [toast, setToast] = useState(null)
  const [processingStatus, setProcessingStatus] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [hasApiKeys, setHasApiKeys] = useState(true)
  const pollingRefs = useRef({})

  const API_HEADERS = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  })

  const showToast = (message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Check if user has API keys configured
  const checkApiKeys = async () => {
    try {
      const res = await fetch('/api/settings/api-keys', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setHasApiKeys(data.has_openai || data.has_anthropic)
      }
    } catch (err) {
      console.error('Failed to check API keys:', err)
    }
  }

  // Fetch dashboard data
  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard/', { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        setDashboard(data)

        // Resume polling for any processing requests
        for (const req of data.active_requests || []) {
          if (req.status === 'processing' && !pollingRefs.current[req.id]) {
            pollProcessingStatus(req.id)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch request types
  const fetchRequestTypes = async () => {
    try {
      const res = await fetch('/api/dashboard/request-types', { headers: API_HEADERS() })
      if (res.ok) {
        setRequestTypes(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch request types:', err)
    }
  }

  useEffect(() => {
    fetchDashboard()
    fetchRequestTypes()
    checkApiKeys()

    // Cleanup polling on unmount
    return () => {
      Object.values(pollingRefs.current).forEach(clearTimeout)
    }
  }, [])

  // Trigger processing for a request
  const triggerProcessing = async (requestId) => {
    try {
      const res = await fetch('/api/processing/process', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify({ request_id: requestId })
      })
      if (res.ok) {
        pollProcessingStatus(requestId)
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to start processing', 'error')
      }
    } catch (err) {
      console.error('Failed to trigger processing:', err)
    }
  }

  // Poll for processing status
  const pollProcessingStatus = (requestId) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/processing/status/${requestId}`, { headers: API_HEADERS() })
        if (res.ok) {
          const status = await res.json()
          setProcessingStatus(prev => ({ ...prev, [requestId]: status }))

          if (status.status === 'completed') {
            showToast('Your deliverable is ready!', 'success')
            fetchDashboard()
            delete pollingRefs.current[requestId]
            setTimeout(() => {
              setProcessingStatus(prev => {
                const newStatus = { ...prev }
                delete newStatus[requestId]
                return newStatus
              })
            }, 5000)
          } else if (status.status === 'failed') {
            showToast('Request processing failed. You can retry or delete it.', 'error')
            fetchDashboard()
            delete pollingRefs.current[requestId]
          } else if (status.status === 'processing') {
            pollingRefs.current[requestId] = setTimeout(poll, 2000)
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err)
        delete pollingRefs.current[requestId]
      }
    }
    poll()
  }

  // Submit new request
  const submitRequest = async (formData) => {
    if (!hasApiKeys) {
      showToast('Please configure API keys in Settings first', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/requests', {
        method: 'POST',
        headers: API_HEADERS(),
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        const result = await res.json()
        showToast('Request submitted! Quincy and the team are on it.', 'success')
        setShowNewRequest(false)
        fetchDashboard()
        triggerProcessing(result.id)
      } else {
        const err = await res.json()
        showToast(err.detail || 'Failed to submit request', 'error')
      }
    } catch (err) {
      showToast('Failed to submit request', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete a request
  const deleteRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/dashboard/requests/${requestId}`, {
        method: 'DELETE',
        headers: API_HEADERS()
      })
      if (res.ok) {
        showToast('Request deleted', 'success')
        fetchDashboard()
        setSelectedRequest(null)
      }
    } catch (err) {
      showToast('Failed to delete request', 'error')
    }
  }

  // Retry a failed request
  const retryRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/dashboard/requests/${requestId}/retry`, {
        method: 'POST',
        headers: API_HEADERS()
      })
      if (res.ok) {
        showToast('Retrying request...', 'info')
        fetchDashboard()
        triggerProcessing(requestId)
        setSelectedRequest(null)
      }
    } catch (err) {
      showToast('Failed to retry request', 'error')
    }
  }

  // Fetch deliverable content
  const viewDeliverable = async (id) => {
    try {
      const res = await fetch(`/api/dashboard/deliverables/${id}`, { headers: API_HEADERS() })
      if (res.ok) {
        setSelectedDeliverable(await res.json())
      }
    } catch (err) {
      showToast('Failed to load deliverable', 'error')
    }
  }

  // Fetch request details
  const viewRequest = async (id) => {
    try {
      const res = await fetch(`/api/dashboard/requests/${id}`, { headers: API_HEADERS() })
      if (res.ok) {
        const data = await res.json()
        // Also fetch internal messages
        const msgRes = await fetch(`/api/processing/internal-messages/${id}`, { headers: API_HEADERS() })
        if (msgRes.ok) {
          data.internal_messages = await msgRes.json()
        }
        setSelectedRequest(data)
      }
    } catch (err) {
      showToast('Failed to load request', 'error')
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: T.bg.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: 32, height: 32,
          border: `3px solid ${T.border.primary}`,
          borderTop: `3px solid ${T.accent.primary}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg.primary,
      color: T.text.primary,
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          padding: '12px 20px',
          borderRadius: T.radius.md,
          background: toast.type === 'error' ? T.accent.error :
                      toast.type === 'success' ? T.accent.success : T.accent.info,
          color: T.text.onAccent,
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          maxWidth: 300
        }}>
          {toast.message}
        </div>
      )}

      {/* API Key Warning */}
      {!hasApiKeys && (
        <div style={{
          background: T.accent.warning,
          color: '#000',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 14
        }}>
          Please configure your API keys in Settings to use QuietDesk.
          <button
            onClick={onBack}
            style={{
              marginLeft: 12,
              padding: '4px 12px',
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{
        borderBottom: `1px solid ${T.border.primary}`,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: T.bg.secondary,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            <span style={{ color: T.accent.primary }}>Quiet</span>Desk
          </h1>
          <span style={{ color: T.text.tertiary, fontSize: 14 }}>Dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowNewRequest(true)}
            disabled={!hasApiKeys}
            style={{
              padding: '8px 16px',
              background: hasApiKeys ? T.accent.primary : T.text.tertiary,
              color: T.text.onAccent,
              border: 'none',
              borderRadius: T.radius.md,
              cursor: hasApiKeys ? 'pointer' : 'not-allowed',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: hasApiKeys ? 1 : 0.5
            }}
          >
            <span style={{ fontSize: 18 }}>+</span>
            New Request
          </button>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                padding: '8px 16px',
                background: T.bg.tertiary,
                color: T.text.secondary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.md,
                cursor: 'pointer'
              }}
            >
              Back to Classic
            </button>
          )}
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 16,
          marginBottom: 32
        }}>
          {[
            { label: 'Total Requests', value: dashboard?.stats?.total_requests || 0, color: T.accent.primary },
            { label: 'Completed', value: dashboard?.stats?.completed_requests || 0, color: T.accent.success },
            { label: 'Deliverables', value: dashboard?.stats?.total_deliverables || 0, color: T.accent.info }
          ].map((stat, i) => (
            <div key={i} style={{
              background: T.bg.secondary,
              border: `1px solid ${T.border.primary}`,
              borderRadius: T.radius.lg,
              padding: '16px 20px'
            }}>
              <div style={{ color: T.text.tertiary, fontSize: 12, marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Main Grid - Responsive */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 24
        }}>
          {/* Mobile: Team first on small screens */}
          <div className="team-section-mobile" style={{ display: 'none' }}>
            <TeamSection team={dashboard?.team} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 24
          }} className="main-grid">
            {/* Left Column - Requests & Deliverables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
              {/* Active Requests */}
              <section style={{
                background: T.bg.secondary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.lg,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '16px 20px',
                  borderBottom: `1px solid ${T.border.primary}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Active Requests</h2>
                  <span style={{ color: T.text.tertiary, fontSize: 13 }}>
                    {dashboard?.active_requests?.length || 0} in progress
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  {dashboard?.active_requests?.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: 40,
                      color: T.text.tertiary
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                      <div>No active requests</div>
                      <button
                        onClick={() => setShowNewRequest(true)}
                        disabled={!hasApiKeys}
                        style={{
                          marginTop: 16,
                          padding: '8px 16px',
                          background: T.accent.primaryMuted,
                          color: T.accent.primary,
                          border: 'none',
                          borderRadius: T.radius.md,
                          cursor: hasApiKeys ? 'pointer' : 'not-allowed',
                          opacity: hasApiKeys ? 1 : 0.5
                        }}
                      >
                        Submit your first request
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {dashboard.active_requests.map(req => (
                        <RequestCard
                          key={req.id}
                          request={req}
                          processingStatus={processingStatus[req.id]}
                          onClick={() => viewRequest(req.id)}
                          onRetry={() => retryRequest(req.id)}
                          onDelete={() => deleteRequest(req.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Recent Deliverables */}
              <section style={{
                background: T.bg.secondary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.lg,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '16px 20px',
                  borderBottom: `1px solid ${T.border.primary}`
                }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Deliverables</h2>
                </div>
                <div style={{ padding: 16 }}>
                  {dashboard?.recent_deliverables?.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: 40,
                      color: T.text.tertiary
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                      <div>No deliverables yet</div>
                      <div style={{ fontSize: 13, marginTop: 8 }}>
                        Submit a request and your team will create deliverables
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {dashboard.recent_deliverables.map(del => (
                        <div
                          key={del.id}
                          onClick={() => viewDeliverable(del.id)}
                          style={{
                            padding: 16,
                            background: T.bg.tertiary,
                            borderRadius: T.radius.md,
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = T.bg.elevated}
                          onMouseOut={e => e.currentTarget.style.background = T.bg.tertiary}
                        >
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{del.title}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              background: `${REQUEST_TYPE_COLORS[del.deliverable_type]}20`,
                              color: REQUEST_TYPE_COLORS[del.deliverable_type]
                            }}>
                              {del.deliverable_type}
                            </span>
                            <span style={{ fontSize: 12, color: T.text.tertiary }}>
                              from "{del.request_title}"
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Right Column - Team (desktop) */}
            <div className="team-section-desktop">
              <TeamSection team={dashboard?.team} />
            </div>
          </div>
        </div>
      </div>

      {/* New Request Modal */}
      {showNewRequest && (
        <NewRequestModal
          requestTypes={requestTypes}
          onSubmit={submitRequest}
          onClose={() => setShowNewRequest(false)}
          submitting={submitting}
        />
      )}

      {/* Deliverable Viewer Modal */}
      {selectedDeliverable && (
        <DeliverableViewer
          deliverable={selectedDeliverable}
          onClose={() => setSelectedDeliverable(null)}
        />
      )}

      {/* Request Detail Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onRetry={() => retryRequest(selectedRequest.id)}
          onDelete={() => deleteRequest(selectedRequest.id)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .main-grid {
            grid-template-columns: 1fr !important;
          }
          .team-section-desktop {
            display: none !important;
          }
          .team-section-mobile {
            display: block !important;
          }
        }
      `}</style>
    </div>
  )
}

// Team Section Component
function TeamSection({ team }) {
  return (
    <section style={{
      background: T.bg.secondary,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      overflow: 'hidden',
      position: 'sticky',
      top: 24
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${T.border.primary}`
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your Team</h2>
      </div>
      <div style={{ padding: 16 }}>
        {team?.map(member => (
          <div key={member.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 0',
            borderBottom: `1px solid ${T.border.subtle}`
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: T.radius.md,
              background: member.is_lead ? T.accent.primary : T.accent.primaryMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              color: member.is_lead ? T.text.onAccent : T.accent.primary,
              flexShrink: 0
            }}>
              {member.name[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {member.name}
                {member.is_lead && (
                  <span style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    background: T.accent.primaryMuted,
                    color: T.accent.primary,
                    borderRadius: 8
                  }}>
                    LEAD
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: T.text.tertiary }}>{member.title}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// Request Card Component
function RequestCard({ request, processingStatus, onClick, onRetry, onDelete }) {
  const progressMembers = processingStatus?.progress || []

  return (
    <div style={{
      padding: 16,
      background: T.bg.tertiary,
      borderRadius: T.radius.md,
      cursor: 'pointer'
    }} onClick={onClick}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: progressMembers.length > 0 || request.status === 'failed' ? 12 : 0,
        gap: 12
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{request.title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
              background: `${REQUEST_TYPE_COLORS[request.request_type]}20`,
              color: REQUEST_TYPE_COLORS[request.request_type]
            }}>
              {request.request_type}
            </span>
            {request.project_name && (
              <span style={{ fontSize: 12, color: T.text.tertiary }}>
                {request.project_name}
              </span>
            )}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: STATUS_COLORS[request.status],
          fontSize: 13,
          flexShrink: 0
        }}>
          <div style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: STATUS_COLORS[request.status],
            animation: request.status === 'processing' ? 'pulse 2s infinite' : 'none'
          }} />
          {request.status}
        </div>
      </div>

      {/* Failed request actions */}
      {request.status === 'failed' && (
        <div style={{
          display: 'flex',
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${T.border.subtle}`
        }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onRetry}
            style={{
              padding: '6px 12px',
              background: T.accent.primary,
              color: T.text.onAccent,
              border: 'none',
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Retry
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: T.accent.error,
              border: `1px solid ${T.accent.error}`,
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Processing Progress */}
      {progressMembers.length > 0 && (
        <div style={{
          paddingTop: 12,
          borderTop: `1px solid ${T.border.subtle}`
        }}>
          <div style={{
            fontSize: 11,
            color: T.text.tertiary,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Team Progress
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {progressMembers.map((member, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: T.accent.primaryMuted,
                  borderRadius: 12,
                  fontSize: 12
                }}
              >
                <span style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: T.accent.success
                }} />
                <span style={{ color: T.accent.primary }}>{member.team_member}</span>
              </div>
            ))}
            {processingStatus?.status === 'processing' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: T.bg.elevated,
                borderRadius: 12,
                fontSize: 12,
                color: T.text.tertiary
              }}>
                <div style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: T.accent.info,
                  animation: 'pulse 1s infinite'
                }} />
                Working...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// New Request Modal Component
function NewRequestModal({ requestTypes, onSubmit, onClose, submitting }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    request_type: 'custom',
    product_url: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.description.trim()) return
    onSubmit(formData)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16
    }} onClick={onClose}>
      <div style={{
        background: T.bg.secondary,
        borderRadius: T.radius.xl,
        width: '100%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflow: 'auto',
        border: `1px solid ${T.border.primary}`
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${T.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New Request</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: T.text.tertiary,
              cursor: 'pointer',
              fontSize: 20
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* Request Type */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, color: T.text.secondary, fontSize: 13 }}>
              Request Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
              {requestTypes.map(type => (
                <button
                  key={type.type}
                  type="button"
                  onClick={() => setFormData({ ...formData, request_type: type.type })}
                  style={{
                    padding: '12px 8px',
                    background: formData.request_type === type.type ? T.accent.primaryMuted : T.bg.tertiary,
                    border: `1px solid ${formData.request_type === type.type ? T.accent.primary : T.border.primary}`,
                    borderRadius: T.radius.md,
                    color: formData.request_type === type.type ? T.accent.primary : T.text.primary,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{type.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, color: T.text.secondary, fontSize: 13 }}>
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief title for your request"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: T.bg.tertiary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.md,
                color: T.text.primary,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, color: T.text.secondary, fontSize: 13 }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what you need. Include any relevant context, requirements, or constraints."
              rows={6}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: T.bg.tertiary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.md,
                color: T.text.primary,
                fontSize: 14,
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Product URL (optional) */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, color: T.text.secondary, fontSize: 13 }}>
              Product URL (optional)
            </label>
            <input
              type="url"
              value={formData.product_url}
              onChange={e => setFormData({ ...formData, product_url: e.target.value })}
              placeholder="https://your-product.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: T.bg.tertiary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.md,
                color: T.text.primary,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: 12, color: T.text.tertiary, marginTop: 6 }}>
              If provided, the team can browse your product for context
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: T.bg.tertiary,
                border: `1px solid ${T.border.primary}`,
                borderRadius: T.radius.md,
                color: T.text.secondary,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.title.trim() || !formData.description.trim()}
              style={{
                padding: '10px 20px',
                background: submitting ? T.text.tertiary : T.accent.primary,
                border: 'none',
                borderRadius: T.radius.md,
                color: T.text.onAccent,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                opacity: submitting ? 0.7 : 1
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Deliverable Viewer Modal
function DeliverableViewer({ deliverable, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16
    }} onClick={onClose}>
      <div style={{
        background: T.bg.secondary,
        borderRadius: T.radius.xl,
        width: '100%',
        maxWidth: 900,
        maxHeight: '90vh',
        overflow: 'hidden',
        border: `1px solid ${T.border.primary}`,
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${T.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{deliverable.title}</h2>
            <div style={{ fontSize: 13, color: T.text.tertiary, marginTop: 4 }}>
              From request: {deliverable.request_title}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {deliverable.google_sheet_url && (
              <a
                href={deliverable.google_sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '8px 16px',
                  background: T.accent.success,
                  color: T.text.onAccent,
                  borderRadius: T.radius.md,
                  textDecoration: 'none',
                  fontSize: 13
                }}
              >
                Open in Sheets
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: T.text.tertiary,
                cursor: 'pointer',
                fontSize: 24
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content with Markdown rendering */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 24
        }}>
          <div
            style={{
              background: T.bg.tertiary,
              borderRadius: T.radius.md,
              padding: 24,
              fontSize: 14,
              lineHeight: 1.6,
              color: T.text.primary
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(deliverable.content) }}
          />
        </div>
      </div>
    </div>
  )
}

// Request Detail Modal
function RequestDetailModal({ request, onClose, onRetry, onDelete }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16
    }} onClick={onClose}>
      <div style={{
        background: T.bg.secondary,
        borderRadius: T.radius.xl,
        width: '100%',
        maxWidth: 700,
        maxHeight: '90vh',
        overflow: 'hidden',
        border: `1px solid ${T.border.primary}`,
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${T.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{request.title}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                background: `${REQUEST_TYPE_COLORS[request.request_type]}20`,
                color: REQUEST_TYPE_COLORS[request.request_type]
              }}>
                {request.request_type}
              </span>
              <span style={{
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                background: `${STATUS_COLORS[request.status]}20`,
                color: STATUS_COLORS[request.status]
              }}>
                {request.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: T.text.tertiary,
              cursor: 'pointer',
              fontSize: 24
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: T.text.secondary }}>Description</h3>
            <div style={{
              background: T.bg.tertiary,
              borderRadius: T.radius.md,
              padding: 16,
              whiteSpace: 'pre-wrap'
            }}>
              {request.description}
            </div>
          </div>

          {/* Product URL */}
          {request.product_url && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: T.text.secondary }}>Product URL</h3>
              <a href={request.product_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent.primary }}>
                {request.product_url}
              </a>
            </div>
          )}

          {/* Team Involved */}
          {request.team_involved && request.team_involved.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: T.text.secondary }}>Team Involved</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {request.team_involved.map((role, i) => (
                  <span key={i} style={{
                    padding: '4px 10px',
                    background: T.accent.primaryMuted,
                    color: T.accent.primary,
                    borderRadius: 12,
                    fontSize: 12
                  }}>
                    {role.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Internal Messages (Team Deliberation) */}
          {request.internal_messages && request.internal_messages.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: T.text.secondary }}>Team Deliberation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {request.internal_messages.map((msg, i) => (
                  <div key={i} style={{
                    background: T.bg.tertiary,
                    borderRadius: T.radius.md,
                    padding: 16
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      alignItems: 'center'
                    }}>
                      <span style={{ fontWeight: 500, color: T.accent.primary }}>
                        {msg.sender_name}
                      </span>
                      <span style={{ fontSize: 11, color: T.text.tertiary }}>
                        {msg.team_member_role?.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      maxHeight: 200,
                      overflow: 'auto'
                    }}>
                      {msg.content.slice(0, 500)}{msg.content.length > 500 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deliverables */}
          {request.deliverables && request.deliverables.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: T.text.secondary }}>Deliverables</h3>
              {request.deliverables.map((del, i) => (
                <div key={i} style={{
                  padding: 12,
                  background: T.bg.tertiary,
                  borderRadius: T.radius.md,
                  marginBottom: 8
                }}>
                  {del.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {request.status === 'failed' && (
          <div style={{
            padding: '16px 24px',
            borderTop: `1px solid ${T.border.primary}`,
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={onDelete}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: T.accent.error,
                border: `1px solid ${T.accent.error}`,
                borderRadius: T.radius.md,
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
            <button
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                background: T.accent.primary,
                color: T.text.onAccent,
                border: 'none',
                borderRadius: T.radius.md,
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
