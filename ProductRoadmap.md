# QuietDesk Product Roadmap

## For AI Developers (Claude Code, Codex)

**How to use this file:**
1. Find an unclaimed task in the current phase
2. Change `[ ]` to `[IN PROGRESS - your name]`
3. Commit this change before starting work
4. When done, change to `[x]` and commit with your code changes
5. If blocked, add `[BLOCKED - reason]` and move on

**Example:**
```
- [ ] Build product creation endpoint              ← Available
- [IN PROGRESS - Claude] Build conversation API   ← Being worked on
- [x] Create database models                       ← Done
- [BLOCKED - needs clarification] Add @mentions    ← Stuck
```

---

## Vision

QuietDesk feels like sitting in a room with a team who's actively working on your product. You can watch, interject, and they produce tangible deliverables. It's not a ticketing system. It's not a chatbot. It's a **working session**.

### Core Principles
- **Product-first**: Everything revolves around the products you're building
- **Conversation-driven**: Natural dialogue, not forms and tickets
- **Living deliverables**: Documents evolve through feedback
- **Visible teamwork**: Watch the team discuss and collaborate
- **Low friction**: Just a name to start, details emerge through conversation

---

## Completed Work

### Phase QD-1: Foundation ✓
- [x] Data models: Request, Deliverable, TeamMember, RequestMessage
- [x] Pre-instantiated consulting team on signup
- [x] Dashboard API endpoints
- [x] Basic dashboard UI

### Phase QD-2: Background Processing ✓
- [x] Quincy orchestration (routes to team members)
- [x] Team deliberation workflow
- [x] Real-time progress tracking
- [x] Error handling and retry

---

## Phase QD-3: Simplified UX (CURRENT SPRINT)

**Goal:** Remove friction, make it feel like a working session.

### QD-3.1 Product-First Dashboard
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| New first-visit view: "What are you working on?" input | [ ] | | Single text input + Start button |
| Product cards grid (2 columns) | [ ] | | Show name, status, last activity |
| "Continue Session" / "Open" button per card | [ ] | | Navigate to conversation |
| "+ New Product" button in header | [ ] | | For users with existing products |
| Team displayed at bottom (read-only) | [ ] | | Names and roles, not clickable |
| Remove old request/deliverable sections | [ ] | | Clean up legacy UI |

### QD-3.2 Conversation View
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Product conversation page layout | [ ] | | Team bar, deliverables, convo, input |
| Team bar at top showing members | [ ] | | Horizontal list of team |
| Deliverables section (above conversation) | [ ] | | Cards with status, open button |
| Conversation thread (scrollable) | [ ] | | Messages from user + team |
| Message input box + send button | [ ] | | Bottom of screen |
| "Back to products" navigation | [ ] | | Return to dashboard |

### QD-3.3 Quincy Auto-Start
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Create conversation on product creation | [ ] | | Automatic, not user-triggered |
| Quincy greeting message | [ ] | | "Hi! Tell me about [product name]..." |
| Trigger team routing when user responds | [ ] | | Quincy decides who to involve |
| Show team member responses in thread | [ ] | | Visible to user, not hidden |

### QD-3.4 Typing Indicators
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| "Jordan is typing..." indicator | [ ] | | Per-team-member |
| Typing state management | [ ] | | Track who's currently generating |
| Clear typing when response arrives | [ ] | | Clean state transition |

### Backend Work for QD-3
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| `POST /api/products/` - create product | [ ] | | Just name, auto-create conversation |
| `GET /api/products/` - list products | [ ] | | With status, last activity |
| `GET /api/products/{id}` - product detail | [ ] | | With deliverables list |
| `GET /api/products/{id}/conversation` - messages | [ ] | | All messages in thread |
| `POST /api/products/{id}/message` - send message | [ ] | | Trigger team processing |
| Quincy greeting on product creation | [ ] | | First message in conversation |
| Modify processing to show team responses | [ ] | | Not just internal, visible |

---

## Phase QD-4: Living Deliverables (NEXT)

**Goal:** Deliverables that evolve through conversation and feedback.

### QD-4.1 Deliverable Offers
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Quincy detects when enough context | [ ] | | AI determines readiness |
| Offer message: "Should I create a [type]?" | [ ] | | Clickable buttons in thread |
| "Yes, create it" triggers generation | [ ] | | User acceptance flow |
| "Not yet" continues conversation | [ ] | | User control |
| User can request deliverables anytime | [ ] | | "Create a roadmap" in chat |

### QD-4.2 Deliverable in Conversation
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Deliverable card appears in thread | [ ] | | When generated |
| Preview snippet in card | [ ] | | First few lines |
| "View Full" button | [ ] | | Opens full-page view |
| "Give Feedback" button | [ ] | | Opens comment mode |

### QD-4.3 Full-Page Deliverable View
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Full-page deliverable viewer | [ ] | | Clean reading experience |
| Markdown rendering | [ ] | | Headers, lists, bold, etc. |
| Mermaid diagram rendering | [ ] | | Architecture, flows |
| "Back" button to conversation | [ ] | | Return navigation |

### QD-4.4 Inline Commenting
| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Add comment button in viewer | [ ] | | Triggers comment mode |
| `>>` prefix for inline comments | [ ] | | User types feedback inline |
| Team sees and responds to comments | [ ] | | AI processes feedback |
| "Request Update" button | [ ] | | Trigger team to revise |
| Updated deliverable replaces old | [ ] | | Always show latest |

---

## Phase QD-5: Intelligence & Context (FUTURE)

### QD-5.1 Product Context
- [ ] AI enriches product description from conversation
- [ ] User can edit product description
- [ ] Add URLs, files, notes to product
- [ ] Team references previous deliverables

### QD-5.2 Web Browsing
- [ ] Casey can browse web for research
- [ ] Product URL analysis
- [ ] Competitor browsing

### QD-5.3 File Attachments
- [ ] Attach files to conversation
- [ ] Document analysis
- [ ] Image analysis for UX reviews

---

## Phase QD-6: Polish (FUTURE)

### QD-6.1 Diagrams
- [ ] Mermaid architecture diagrams
- [ ] User flow diagrams
- [ ] Roadmap timelines

### QD-6.2 Export
- [ ] Download as Markdown
- [ ] Download as PDF
- [ ] Export to Google Docs/Sheets

### QD-6.3 Mobile
- [ ] Responsive product cards
- [ ] Mobile conversation view
- [ ] Touch-friendly deliverables

---

## Notes for Developers

### Key Files to Modify

**Frontend:**
- `frontend/src/Dashboard.jsx` - Main dashboard component (rewrite for new UX)
- `frontend/src/App.jsx` - Keep auth, settings, classic mode toggle

**Backend:**
- `backend/routes_dashboard.py` - Existing endpoints to extend
- `backend/routes_processing.py` - Modify for visible team responses
- `backend/models.py` - May need tweaks

### Architecture Reference
See `Architecture.md` for:
- Database schema
- API endpoint patterns
- Processing flow diagrams
- Deployment instructions

### Testing
1. Test locally: `cd backend && uvicorn main:app --reload`
2. Frontend dev: `cd frontend && npm run dev`
3. Deploy: `git push heroku main`
4. Check logs: `heroku logs --tail --app silentpartner`

### Commit Style
```
Short description of change

- Detail 1
- Detail 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Questions / Blockers

Add any questions or blockers here for the human to address:

| Question | Asked By | Status | Answer |
|----------|----------|--------|--------|
| (none yet) | | | |
