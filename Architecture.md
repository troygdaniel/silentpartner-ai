# QuietDesk Architecture

This document describes the technical architecture of QuietDesk to help guide ongoing development.

**For AI Developers (Claude Code, Codex, etc.):** This is your technical reference. See `ProductRoadmap.md` for what to build next.

---

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
│  │  (GPT-4, GPT-4o)    │      │  (Claude 3.5/4)             │   │
│  └─────────────────────┘      └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core QuietDesk Models

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │  team_members   │       │    projects     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, UUID)   │──┐    │ id (PK, UUID)   │       │ id (PK, UUID)   │
│ email           │  │    │ owner_id (FK)───│───────│ owner_id (FK)───│──┐
│ name            │  │    │ role            │       │ name            │  │
│ google_id       │  │    │ name            │       │ description     │  │
│ openai_api_key  │  │    │ title           │       │ status          │  │
│ anthropic_key   │  │    │ instructions    │       │ created_at      │  │
│ created_at      │  │    │ model           │       │ updated_at      │  │
└─────────────────┘  │    │ is_lead         │       └────────┬────────┘  │
                     │    └─────────────────┘                │           │
                     │                                        │           │
┌─────────────────┐  │    ┌─────────────────┐       ┌────────▼────────┐  │
│    requests     │  │    │  deliverables   │       │ request_messages│  │
├─────────────────┤  │    ├─────────────────┤       ├─────────────────┤  │
│ id (PK, UUID)   │  │    │ id (PK, UUID)   │       │ id (PK, UUID)   │  │
│ owner_id (FK)───│──┘    │ request_id (FK) │───────│ request_id (FK) │  │
│ project_id (FK) │───────│ owner_id (FK)   │       │ owner_id (FK)   │  │
│ title           │       │ title           │       │ role            │  │
│ description     │       │ content         │       │ sender_name     │  │
│ request_type    │       │ deliverable_type│       │ content         │  │
│ status          │       │ version         │       │ is_internal     │  │
│ team_involved   │       │ is_draft        │       │ created_at      │  │
│ product_url     │       │ google_sheet_url│       └─────────────────┘  │
│ created_at      │       │ created_at      │                            │
│ started_at      │       └─────────────────┘                            │
│ completed_at    │                                                      │
└─────────────────┘                                                      │
```

### Key Relationships

- **User → TeamMembers**: One-to-many. Pre-instantiated consulting team per user.
- **User → Projects**: One-to-many. Each "product" the user is building.
- **Project → Requests**: One-to-many. Conversation sessions within a product.
- **Request → RequestMessages**: One-to-many. Messages in the conversation thread.
- **Request → Deliverables**: One-to-many. Documents produced from the conversation.

### The Consulting Team (Default)

Created automatically on user signup:

| Name | Role | Title | Purpose |
|------|------|-------|---------|
| Quincy | lead | Project Lead | Orchestrates team, user-facing, routes requests |
| Jordan | product_manager | Product Manager | Roadmaps, PRDs, prioritization |
| Sam | ux_expert | UX Designer | User experience, design feedback |
| Riley | technical_advisor | Technical Advisor | Architecture, feasibility |
| Morgan | research_analyst | Research Analyst | Market research, competitors |
| Taylor | qa_engineer | QA Engineer | Testing, quality assurance |
| Casey | marketing | Marketing Consultant | Positioning, messaging |

---

## Backend Architecture

### Directory Structure

```
backend/
├── main.py                 # FastAPI app, lifespan, static file serving
├── database.py             # Async SQLAlchemy engine, session, migrations
├── models.py               # SQLAlchemy ORM models
├── auth.py                 # JWT token verification, require_auth dependency
├── crypto.py               # Fernet encryption for API keys
├── routes_auth.py          # Google OAuth + team creation on signup
├── routes_dashboard.py     # Dashboard, requests, deliverables
├── routes_processing.py    # Background team deliberation engine
├── routes_chat.py          # Chat streaming (SSE) with OpenAI/Anthropic
├── routes_settings.py      # API key management
├── routes_employees.py     # (Legacy) Employee CRUD
├── routes_projects.py      # Project CRUD
├── routes_messages.py      # Persistent chat history
├── routes_memory.py        # Memory system
├── routes_files.py         # File uploads
└── requirements.txt
```

### Request Flow (QuietDesk Mode)

```
1. User creates product (name only)
         │
         ▼
2. Quincy auto-starts conversation
         │
         ▼
3. User sends message in conversation
         │
         ▼
4. Processing engine:
   a. Quincy analyzes message
   b. Routes to relevant team members
   c. Team members respond (visible in thread)
   d. Quincy offers deliverables when ready
         │
         ▼
5. User accepts deliverable offer
         │
         ▼
6. Team generates deliverable
         │
         ▼
7. Deliverable appears in conversation + deliverables section
```

### Conversation Processing

```
User Message
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Quincy (Orchestrator)                          │
│  - Understands user intent                      │
│  - Decides who to involve                       │
│  - Loops in team members                        │
└───────────────────┬─────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐    ┌────────┐      ┌────────┐
│ Jordan │    │  Sam   │      │ Riley  │
│  (PM)  │    │  (UX)  │      │ (Dev)  │
└───┬────┘    └───┬────┘      └───┬────┘
    │             │               │
    └─────────────┼───────────────┘
                  ▼
         Team responses appear
         in conversation thread
                  │
                  ▼
         Quincy offers deliverable
         when enough context
```

---

## Frontend Architecture

### Component Structure

```
frontend/src/
├── App.jsx           # Main app, auth, classic mode
├── Dashboard.jsx     # QuietDesk dashboard (products, conversation)
└── index.jsx         # Entry point
```

### Dashboard State

```javascript
// Key state in Dashboard.jsx
const [products, setProducts] = useState([])           // User's products
const [activeProduct, setActiveProduct] = useState(null) // Currently viewing
const [conversation, setConversation] = useState([])   // Messages in thread
const [deliverables, setDeliverables] = useState([])   // Product deliverables
const [teamTyping, setTeamTyping] = useState({})       // Who's typing
```

### View States

```
products.length === 0      → First visit: "What are you working on?"
products.length > 0        → Product grid
activeProduct !== null     → Conversation view
viewingDeliverable !== null → Full-page deliverable viewer
```

---

## API Endpoints

### QuietDesk Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/` | Dashboard overview (products, stats) |
| GET | `/api/dashboard/team` | Get user's consulting team |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/products/` | Create product (just name) |
| GET | `/api/products/` | List all products |
| GET | `/api/products/{id}` | Product detail with deliverables |
| PUT | `/api/products/{id}` | Update product (name, description) |
| DELETE | `/api/products/{id}` | Delete product |

### Conversation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/{id}/conversation` | Get conversation messages |
| POST | `/api/products/{id}/message` | Send message (triggers team) |
| GET | `/api/products/{id}/typing` | SSE stream for typing indicators |

### Deliverables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deliverables/{id}` | Full deliverable content |
| POST | `/api/deliverables/{id}/comment` | Add inline comment |
| POST | `/api/deliverables/{id}/update` | Request team to update |

### Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/processing/process` | Trigger team processing |
| GET | `/api/processing/status/{request_id}` | Get processing status |
| GET | `/api/processing/internal-messages/{id}` | Team deliberation messages |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/api-keys` | Check which keys are set |
| PUT | `/api/settings/api-keys` | Update API keys |

---

## Security

### API Key Storage
- User API keys encrypted with Fernet
- Decrypted only when making AI API calls

### Authentication
- JWT tokens (7-day expiry)
- All API routes require valid JWT
- Google OAuth for login

### Data Isolation
- All queries filter by `owner_id`
- Users only see their own data

---

## Deployment

### Heroku Configuration

```
Buildpacks:
1. heroku/nodejs (builds frontend)
2. heroku/python (runs backend)

Procfile:
web: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT

Add-ons:
- Heroku Postgres
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ENCRYPTION_KEY` | 32-byte key for Fernet encryption |

### Deploy Commands

```bash
# Deploy to Heroku
git add -A && git commit -m "description" && git push heroku main

# Check logs
heroku logs --tail --app silentpartner

# Run database commands
heroku run "python -c '...'" --app silentpartner
```

---

## Development

### Local Setup

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Testing Changes

1. Make code changes
2. Test locally with `uvicorn main:app --reload`
3. Verify in browser at `http://localhost:8000`
4. Commit and push to Heroku

### Code Style

- Python: Standard PEP 8
- JavaScript: React functional components, hooks
- Keep components focused and small
- Add comments for complex logic

---

## Legacy Mode (Classic)

The original "SilentPartner" mode is still available:
- Create custom AI employees
- Project channels with @mentions
- Direct messages
- Custom instructions per employee

Access via "Back to Classic" button in Dashboard.
