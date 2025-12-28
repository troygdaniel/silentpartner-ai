# QuietDesk Product Roadmap

This roadmap outlines planned features and improvements for QuietDesk - your virtual consulting team that works in the background.

## Vision

QuietDesk feels like sitting in a room with a team who's actively working on your product. You can watch, interject, and they produce tangible deliverables. It's not a ticketing system. It's not a chatbot. It's a **working session**.

### Core Principles
- **Product-first**: Everything revolves around the products/projects you're building
- **Conversation-driven**: Natural dialogue, not forms and tickets
- **Living deliverables**: Documents evolve through feedback, not static outputs
- **Visible teamwork**: Watch the team discuss and collaborate
- **Low friction**: Just a name to start, details emerge through conversation

---

## Development Notes

**For Claude Code / Codex developers:**
- This project uses Python (FastAPI) backend and React frontend
- All code is in `/backend` and `/frontend/src`
- Deploy via `git push heroku main`
- Test locally with `uvicorn main:app --reload` in backend
- See `Architecture.md` for technical details

---

## Current State (Completed)

### Phase QD-1: Foundation (Complete)
- [x] Data models: Request, Deliverable, TeamMember, RequestMessage
- [x] Pre-instantiated consulting team on signup
- [x] Dashboard API endpoints
- [x] Basic dashboard UI with request/deliverable views

### Phase QD-2: Background Processing (Complete)
- [x] Quincy orchestration (routes to team members)
- [x] Team deliberation workflow
- [x] Real-time progress tracking
- [x] Error handling and retry

---

## Phase QD-3: Simplified UX (IN PROGRESS)

**Goal:** Remove friction, make it feel like a working session.

### QD-3.1 Product-First Dashboard
- [ ] New first-visit experience: "What are you working on?" → single input
- [ ] Product cards in grid layout (2 columns)
- [ ] Each card shows: name, status, last activity
- [ ] "Continue Session" or "Open" button per product
- [ ] "+ New Product" button
- [ ] Team displayed at bottom (informational, not clickable)

### QD-3.2 Conversation View
- [ ] Navigate into a product → full conversation view
- [ ] Team bar at top showing who's on the team
- [ ] Deliverables section (above conversation)
- [ ] Conversation thread (scrollable)
- [ ] Input box at bottom with send button
- [ ] @mention support to address specific team members

### QD-3.3 Quincy Auto-Start
- [ ] When product created, Quincy automatically greets
- [ ] Quincy asks about the product to gather context
- [ ] User can take conversation anywhere they want
- [ ] Quincy loops in team members as needed (visible in thread)

### QD-3.4 Typing Indicators
- [ ] Show "Jordan is typing..." when team member is responding
- [ ] Per-member typing indicators
- [ ] "Team is working..." state when multiple members active

---

## Phase QD-4: Living Deliverables

**Goal:** Deliverables that evolve through conversation and feedback.

### QD-4.1 Deliverable Offers
- [ ] Quincy offers to create deliverables when enough context ("I can draft a Product Brief. Should I?")
- [ ] User clicks "Yes, create it" or "Not yet"
- [ ] User can also request deliverables anytime ("Create a roadmap")
- [ ] Deliverable appears inline in conversation when created

### QD-4.2 Deliverable Types
| Context | Quincy Offers |
|---------|---------------|
| New product, basic description | Product Brief |
| Discussed target users | User Personas |
| Discussed features | Feature Roadmap |
| Discussed competitors | Competitive Analysis |
| Discussed pricing | Pricing Strategy |
| Asked "how should we build this" | Technical Architecture |
| Asked for feedback on idea | UX Audit / Review |

### QD-4.3 Full-Page Deliverable View
- [ ] Click "View" on deliverable → full-page view
- [ ] Markdown rendering with headers, lists, etc.
- [ ] Mermaid diagram rendering (architecture, flows, timelines)
- [ ] "Back" button to return to conversation

### QD-4.4 Inline Commenting
- [ ] Add comments with `>>` prefix or comment button
- [ ] Ask questions within the document
- [ ] Team sees comments and responds
- [ ] Team updates deliverable based on feedback
- [ ] Comments resolve into updated content
- [ ] "Request Update from Team" button

### QD-4.5 Deliverable Display
- [ ] Deliverables section on product page (above conversation)
- [ ] Show status: DRAFT, CURRENT, "2 comments"
- [ ] Always show latest version (no version history cluttering UI)
- [ ] "View discussion" to see related conversation

---

## Phase QD-5: Intelligence & Context

**Goal:** Make the team smarter.

### QD-5.1 Product Context Evolution
- [ ] AI enriches product description based on conversations
- [ ] User can edit product description later
- [ ] Add context over time (URLs, files, notes)
- [ ] Team references previous deliverables in conversation

### QD-5.2 Web Browsing
- [ ] Casey (Research) can browse the web for research requests
- [ ] Product URL analysis
- [ ] Competitor website browsing

### QD-5.3 File Attachments
- [ ] Attach files to conversations
- [ ] Document analysis for audits
- [ ] Image analysis for UX reviews

---

## Phase QD-6: Polish

**Goal:** Refine the experience.

### QD-6.1 Mermaid Diagrams
- [ ] Architecture diagrams in Technical Architecture deliverables
- [ ] User flow diagrams
- [ ] Feature dependency charts
- [ ] Roadmap timelines
- [ ] Entity relationship diagrams

### QD-6.2 Export Options
- [ ] Download deliverable as Markdown
- [ ] Download as PDF
- [ ] Export to Google Docs
- [ ] Export to Google Sheets (for roadmaps)

### QD-6.3 Mobile Experience
- [ ] Responsive product cards
- [ ] Mobile-friendly conversation view
- [ ] Touch-friendly deliverable viewing

---

## Future Considerations

**Ideas for later evaluation:**

- **Voice Interface**: Voice input for conversations
- **Custom Team Members**: Add/customize team composition
- **White-Label**: Custom branding
- **Slack Integration**: Submit requests from Slack
- **Meeting Integration**: Connect to Zoom/Meet for context
- **Real-time Streaming**: Stream team responses as they generate
- **Version History**: See how deliverables evolved (low priority)

---

## Architecture

### Key Models
```
Project (renamed conceptually to "Product")
  - owner_id, name, description
  - Enriched over time through conversations

TeamMember - Pre-instantiated consulting team
  - Quincy (Lead), Jordan (PM), Sam (UX), Riley (Dev)
  - Morgan (Research), Taylor (QA), Casey (Tech)

Request - Now represents a "conversation session" or topic
  - project_id (links to product)
  - Messages flow through this

Deliverable - Living documents
  - request_id, title, content
  - Updated through conversation feedback

RequestMessage - Conversation messages
  - From user or team members
  - is_internal for team deliberation (visible to user)
```

### API Endpoints (Existing + New)
```
GET  /api/dashboard/           - Dashboard overview
POST /api/products/            - Create new product (simple name input)
GET  /api/products/:id         - Product detail with deliverables
GET  /api/products/:id/conversation - Conversation history
POST /api/products/:id/message - Send message in conversation
GET  /api/deliverables/:id     - Full deliverable content
POST /api/deliverables/:id/comment - Add inline comment
```

---

## How to Contribute

When implementing features:
1. Pick an item from the current phase (QD-3)
2. Reference this roadmap for UX decisions
3. Reference Architecture.md for technical guidance
4. Test locally before deploying
5. Update this roadmap to mark progress

**Priority:**
- Focus on QD-3 (Simplified UX) - this is the current sprint
- Keep changes minimal and focused
- Test the happy path thoroughly before edge cases
