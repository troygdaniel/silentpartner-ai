# SilentPartner Architecture

This document describes the technical architecture of SilentPartner to help guide ongoing development.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Heroku                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    FastAPI Backend                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │   Routes    │  │    Auth     │  │  Static Files   │  │    │
│  │  │  /api/*     │  │  JWT+OAuth  │  │  React Bundle   │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────┘  │    │
│  │         │                │                               │    │
│  │  ┌──────▼────────────────▼──────┐                       │    │
│  │  │      SQLAlchemy (Async)      │                       │    │
│  │  └──────────────┬───────────────┘                       │    │
│  └─────────────────┼───────────────────────────────────────┘    │
│                    │                                             │
│  ┌─────────────────▼───────────────────────────────────────┐    │
│  │              PostgreSQL (Heroku Postgres)                │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External APIs                               │
│  ┌─────────────────────┐      ┌─────────────────────────────┐   │
│  │     OpenAI API      │      │      Anthropic API          │   │
│  │  (GPT-4, GPT-3.5)   │      │  (Claude 3 Opus/Sonnet)     │   │
│  └─────────────────────┘      └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │   employees     │       │    projects     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, UUID)   │──┐    │ id (PK, UUID)   │       │ id (PK, UUID)   │
│ email           │  │    │ owner_id (FK)───│───────│ owner_id (FK)───│──┐
│ name            │  │    │ name            │       │ name            │  │
│ google_id       │  │    │ role            │       │ description     │  │
│ is_active       │  │    │ instructions    │       │ status          │  │
│ openai_api_key  │  │    │ model           │       │ created_at      │  │
│ anthropic_key   │  │    │ is_default      │       │ updated_at      │  │
│ created_at      │  │    │ created_at      │       └────────┬────────┘  │
│ updated_at      │  │    │ updated_at      │                │           │
└─────────────────┘  │    └────────┬────────┘                │           │
                     │             │                          │           │
                     │             │                          │           │
┌─────────────────┐  │    ┌────────▼────────┐       ┌────────▼────────┐  │
│    memories     │  │    │    messages     │       │  project_files  │  │
├─────────────────┤  │    ├─────────────────┤       ├─────────────────┤  │
│ id (PK, UUID)   │  │    │ id (PK, UUID)   │       │ id (PK, UUID)   │  │
│ owner_id (FK)───│──┘    │ owner_id (FK)───│───────│ project_id (FK) │──┘
│ employee_id(FK) │───────│ project_id (FK) │       │ owner_id (FK)   │
│ project_id (FK) │───────│ employee_id(FK) │       │ filename        │
│ content         │       │ role            │       │ content         │
│ created_at      │       │ content         │       │ size            │
│ updated_at      │       │ created_at      │       │ created_at      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Key Relationships

- **User → Employees**: One-to-many. Each user owns multiple AI employees.
- **User → Projects**: One-to-many. Each user owns multiple projects.
- **User → Memories**: One-to-many. Memories can be shared, employee-specific, or project-specific.
- **Project → Messages**: One-to-many. Project channels contain messages.
- **Employee → Messages**: One-to-many (optional). DMs and @mentions link to employees.
- **Project → ProjectFiles**: One-to-many. Files uploaded to projects.

### Memory Scoping

Memories have a hierarchical scope:
1. **Shared** (`employee_id=NULL, project_id=NULL`): Available to all employees in all contexts
2. **Employee-specific** (`employee_id=X, project_id=NULL`): Only for a specific employee
3. **Project-specific** (`project_id=X`): Only within a specific project

## Backend Architecture

### Directory Structure

```
backend/
├── main.py                 # FastAPI app, lifespan, static file serving
├── database.py             # Async SQLAlchemy engine, session, migrations
├── models.py               # SQLAlchemy ORM models
├── auth.py                 # JWT token verification, require_auth dependency
├── crypto.py               # Fernet encryption for API keys
├── routes_auth.py          # Google OAuth flow, token generation
├── routes_employees.py     # Employee CRUD operations
├── routes_projects.py      # Project CRUD operations
├── routes_chat.py          # Chat streaming (SSE) with OpenAI/Anthropic
├── routes_memory.py        # Memory CRUD + context injection helpers
├── routes_messages.py      # Persistent chat history
├── routes_files.py         # Session-based file uploads (DMs)
├── routes_project_files.py # Persistent project file storage
├── routes_settings.py      # API key management
└── requirements.txt
```

### Request Flow

```
1. Request arrives at FastAPI
         │
         ▼
2. Static file? → Serve from /static
         │ No
         ▼
3. API route matched
         │
         ▼
4. require_auth dependency validates JWT
         │
         ▼
5. get_db dependency provides async session
         │
         ▼
6. Route handler processes request
         │
         ▼
7. For chat: Stream SSE response from AI provider
```

### Authentication Flow

```
1. User clicks "Sign in with Google"
         │
         ▼
2. Redirect to Google OAuth
         │
         ▼
3. Google redirects back with code
         │
         ▼
4. Backend exchanges code for tokens
         │
         ▼
5. Get user info from Google
         │
         ▼
6. Create/update user in database
         │
         ▼
7. Generate JWT with user ID
         │
         ▼
8. Redirect to frontend with JWT in URL
         │
         ▼
9. Frontend stores JWT in localStorage
```

### Chat Streaming

```
1. Frontend sends POST /api/chat
         │
         ▼
2. Validate employee ownership
         │
         ▼
3. Decrypt user's API key
         │
         ▼
4. Build system prompt:
   - Employee instructions
   - Relevant memories (shared + role + project)
   - Uploaded files content
         │
         ▼
5. Determine provider (OpenAI vs Anthropic)
         │
         ▼
6. Stream response via SSE
         │
         ▼
7. Frontend renders chunks in real-time
         │
         ▼
8. Save complete message to database
```

## Frontend Architecture

### Component Structure

The frontend is a single-file React application (`App.jsx`) with the following logical sections:

```
App.jsx
├── State Management (useState hooks)
│   ├── Auth state (user, loading)
│   ├── Data state (projects, employees, memories, apiKeys)
│   ├── Navigation state (activeChannel, showSettings)
│   ├── Chat state (messages, chatInput, isStreaming)
│   └── Modal state (showProjectModal, editingEmployee, etc.)
│
├── Data Fetching (useEffect + fetch functions)
│   ├── fetchProjects()
│   ├── fetchEmployees()
│   ├── fetchMessages()
│   ├── fetchMemories()
│   └── fetchApiKeys()
│
├── Event Handlers
│   ├── CRUD operations (handleSaveProject, handleDeleteEmployee, etc.)
│   ├── Chat (sendMessage with SSE parsing)
│   ├── File upload (handleFileUpload)
│   └── API keys (saveApiKeys, removeApiKey)
│
└── Render
    ├── Login screen (if !user)
    ├── Sidebar (projects, DMs, user footer)
    ├── Main content area
    │   ├── Settings view
    │   ├── Chat view (messages + input)
    │   └── Dashboard/home view
    └── Modals (project, employee)
```

### Navigation Model

```
activeChannel = null  → Dashboard (home view)
activeChannel = { type: 'project', id, name }  → Project channel
activeChannel = { type: 'dm', id, name }  → Direct message
showSettings = true  → Settings panel
```

### State Flow

```
User Action → Update State → Re-render → API Call → Update State
     │                                        │
     └────────────────────────────────────────┘
                  (optimistic updates)
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/status` | Check if OAuth is configured |
| GET | `/api/auth/google` | Initiate Google OAuth flow |
| GET | `/api/auth/callback` | OAuth callback handler |
| GET | `/api/auth/me` | Get current user info |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | List all employees |
| POST | `/api/employees` | Create employee |
| GET | `/api/employees/{id}` | Get employee |
| PUT | `/api/employees/{id}` | Update employee |
| DELETE | `/api/employees/{id}` | Delete employee |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/{id}` | Get project |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project (cascades) |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Stream chat response (SSE) |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages/project/{id}` | Get project messages |
| GET | `/api/messages/dm/{id}` | Get DM messages |
| POST | `/api/messages` | Save a message |
| DELETE | `/api/messages/project/{id}` | Clear project messages |
| DELETE | `/api/messages/dm/{id}` | Clear DM messages |

### Memories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memories` | List memories (filterable) |
| GET | `/api/memories/all` | List all memories |
| POST | `/api/memories` | Create memory |
| PUT | `/api/memories/{id}` | Update memory |
| DELETE | `/api/memories/{id}` | Delete memory |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload/{employee_id}` | Upload file (DM session) |
| DELETE | `/api/files/{employee_id}/{file_id}` | Delete file |
| POST | `/api/project-files/upload/{project_id}` | Upload project file |
| GET | `/api/project-files/{project_id}` | List project files |
| DELETE | `/api/project-files/{project_id}/{file_id}` | Delete project file |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/api-keys` | Check which keys are set |
| PUT | `/api/settings/api-keys` | Update API keys |

## Security Considerations

### API Key Storage
- User API keys are encrypted using Fernet symmetric encryption
- Encryption key is stored in `ENCRYPTION_KEY` environment variable
- Keys are decrypted only when making API calls

### Authentication
- JWT tokens expire after 7 days
- Tokens are signed with `JWT_SECRET` environment variable
- All API routes (except auth) require valid JWT

### Data Isolation
- All queries filter by `owner_id` to ensure users only see their own data
- Foreign key constraints prevent orphaned records

## Deployment

### Heroku Configuration

```
Buildpacks:
1. heroku/nodejs (builds frontend)
2. heroku/python (runs backend)

Procfile:
web: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT

Add-ons:
- Heroku Postgres (Essential-0 or higher)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Heroku) |
| `JWT_SECRET` | Secret key for JWT signing |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ENCRYPTION_KEY` | 32-byte key for Fernet encryption |

### Build Process

```
1. npm install (root package.json)
2. npm run build (triggers frontend build)
3. pip install -r backend/requirements.txt
4. uvicorn starts, serves static files + API
```

## Future Considerations

### Scalability
- Consider Redis for session storage if scaling horizontally
- Add connection pooling for database
- Implement rate limiting for API endpoints

### Features
- Real-time updates via WebSockets
- Team/organization support (multi-user workspaces)
- More AI providers (Google, Cohere, etc.)
- File type support beyond text (images, PDFs)
- Export/import functionality

### Performance
- Add database indexes as query patterns emerge
- Implement pagination for messages and memories
- Cache frequently accessed data
- Consider splitting frontend into multiple components

### Monitoring
- Add structured logging
- Implement error tracking (Sentry)
- Add performance monitoring
- Create admin dashboard for usage metrics
