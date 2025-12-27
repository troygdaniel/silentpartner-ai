# QuietDesk Product Roadmap

This roadmap outlines planned features and improvements for QuietDesk (formerly SilentPartner) - a consulting firm in your pocket.

## Vision

QuietDesk provides users with a virtual consulting team that works behind the scenes. Users submit requests, the team deliberates, and delivers polished outputs (reports, roadmaps, analyses) - without requiring users to manage the inner workings.

---

## Current State (v1.0) - Legacy "SilentPartner" Mode

**Core Features Shipped (Classic Mode):**
- Google OAuth authentication
- AI employee creation with custom instructions
- Project channels with @mention routing
- Direct messages with individual employees
- Persistent chat history
- Memory system (shared, employee-specific, project-specific)
- File uploads (persistent for both DMs and projects)
- Multi-provider support (OpenAI + Anthropic)
- BYOK (Bring Your Own Keys) model
- Built-in role library (Project Manager, Product Manager, QA, UX, etc.)
- Google Sheets integration

---

## Phase QD-1: QuietDesk Foundation (In Progress)

**Goal:** Transform from chat-centric to deliverable-centric UX.

### QD-1.1 Core Architecture
- [x] New data models: Request, Deliverable, TeamMember, RequestMessage
- [x] Pre-instantiated consulting team on user signup
- [x] Dashboard API endpoints (/api/dashboard/*)
- [x] Request submission and tracking
- [x] Deliverable storage and retrieval

### QD-1.2 The Team (Default Configuration)
Pre-instantiated team with names and roles:
- [x] Quincy (Project Manager) - Lead, user-facing orchestrator
- [x] Jordan (Product Manager) - Roadmaps, PRDs, prioritization
- [x] Sam (Technical Advisor) - Architecture, feasibility
- [x] Riley (QA Engineer) - Testing, quality assurance
- [x] Morgan (UX Expert) - Design, usability
- [x] Taylor (Marketing Consultant) - Positioning, messaging
- [x] Casey (Research Analyst) - Market research, competitors

### QD-1.3 Request Types
- [x] Roadmap - Product roadmaps with phases and features
- [x] Analysis - Competitive, market, or technical analysis
- [x] Audit - Review existing feature/product for issues
- [x] Review - Feedback on ideas, docs, or designs
- [x] Research - Topic investigation
- [x] Custom - Open-ended requests

### QD-1.4 Dashboard UI
- [x] Dashboard view with stats, active requests, recent deliverables
- [x] Team member display
- [x] Request submission modal
- [x] Deliverable viewer
- [x] Toggle between Dashboard and Classic mode

---

## Phase QD-2: Background Processing (Complete)

**Goal:** Enable team deliberation and async request handling.

### QD-2.1 Orchestration Engine
- [x] Quincy orchestration logic (routes requests to appropriate team members)
- [x] Background job queue for team deliberation
- [x] Team member consultation workflow
- [x] Response synthesis from multiple team members

### QD-2.2 Progress & Notifications
- [x] Real-time progress tracking ("Quincy is consulting with Jordan...")
- [x] Status updates during processing
- [x] Completion notification
- [x] Error handling and retry logic

### QD-2.3 Deliberation Transparency
- [x] Option to view team deliberation (internal messages)
- [x] Team contribution summary in deliverables
- [x] "Who contributed" metadata

---

## Phase QD-3: Deliverable Excellence

**Goal:** Make deliverables the primary, high-quality output.

### QD-3.1 Templates & Formatting
- [ ] Deliverable templates per type (PRD template, Analysis template, etc.)
- [ ] Consistent markdown formatting
- [ ] Section headers and structure
- [ ] Executive summary generation

### QD-3.2 Export Options
- [ ] Download as Markdown
- [ ] Download as PDF
- [ ] Export to Google Docs
- [ ] Export to Google Sheets (for roadmaps)
- [ ] Copy to clipboard

### QD-3.3 Versioning & Iteration
- [ ] Request revisions ("Please update section X")
- [ ] Version history for deliverables
- [ ] Compare versions
- [ ] Rollback to previous version

---

## Phase QD-4: Intelligence & Context

**Goal:** Make the team smarter with better context.

### QD-4.1 Web Browsing
- [ ] Casey (Research Analyst) can browse the web
- [ ] Product URL analysis
- [ ] Competitor website browsing
- [ ] Search integration for research requests

### QD-4.2 Project Context
- [ ] Project-scoped requests
- [ ] Team remembers previous deliverables
- [ ] Cross-request context ("As we discussed in the roadmap...")
- [ ] Project knowledge base

### QD-4.3 File Context
- [ ] Attach files to requests
- [ ] Document analysis for audits
- [ ] Image analysis for UX reviews
- [ ] Code analysis for technical reviews

---

## Phase QD-5: UX Polish

**Goal:** Refine the user experience.

### QD-5.1 Chat Improvements (for follow-up conversations)
- [ ] Large prompts collapse with "Show more"
- [ ] Full-width text input like ChatGPT
- [ ] Improved markdown rendering
- [ ] Better code highlighting

### QD-5.2 Dashboard Enhancements
- [ ] Request filtering and sorting
- [ ] Deliverable search
- [ ] Bulk actions
- [ ] Keyboard shortcuts

### QD-5.3 Mobile Experience
- [ ] Responsive dashboard
- [ ] Mobile-friendly request submission
- [ ] Push notifications for completed requests

---

## Legacy Phases (From SilentPartner)

These remain available for users who prefer the classic mode:

### Phase 1-3: Complete
- Error handling, toast notifications
- Chat improvements (timestamps, edit/delete, markdown)
- File handling and persistence
- Mobile responsiveness
- Model expansion (GPT-4 Turbo, Claude 3.5, etc.)
- Context management and summarization
- Role library and templates
- Project enhancements and collaboration
- Export to Markdown/PDF
- Usage statistics

### Phase 4: Advanced File Support (Future)
- PDF text extraction
- Word/Excel support
- GitHub integration
- RAG integration

### Phase 5: Integrations (Partial)
- [x] Google Sheets create/update
- [ ] Slack integration
- [ ] Email integration
- [ ] API access

### Phase 6: Multi-User & Teams (Future)
- Team workspaces
- Shared resources
- Audit & compliance

### Phase 7: Performance (Future)
- WebSocket real-time updates
- Message pagination
- Database optimization

---

## Future Considerations

**Ideas for later evaluation:**

- **Voice Interface**: Voice input for request submission
- **AI Agents**: Team members that can take actions (browse web, run code)
- **Custom Team Members**: Add/customize team composition
- **White-Label**: Custom branding ("Your Company's Consulting Team")
- **Slack/Teams Bot**: Submit requests directly from Slack
- **Mobile Apps**: Native iOS/Android applications
- **Meeting Integration**: Connect to Zoom/Meet for context

---

## Architecture Notes

### New Models (QuietDesk)
```
TeamMember - Pre-instantiated consulting team
  - owner_id, role, name, title, instructions, model, is_lead

Request - User-submitted requests
  - owner_id, project_id, title, description, request_type
  - status (pending, processing, completed, failed)
  - team_involved, product_url, attachments

Deliverable - Output artifacts
  - request_id, title, content, deliverable_type
  - google_sheet_id/url, version, is_draft

RequestMessage - Conversation thread per request
  - request_id, role, sender_name, content
  - is_internal (for team deliberation)
```

### API Endpoints
- `GET /api/dashboard/` - Dashboard overview
- `GET /api/dashboard/team` - Get user's team
- `POST /api/dashboard/requests` - Submit new request
- `GET /api/dashboard/requests` - List requests
- `GET /api/dashboard/requests/:id` - Request details
- `GET /api/dashboard/deliverables` - List deliverables
- `GET /api/dashboard/deliverables/:id` - Deliverable content
- `GET /api/dashboard/request-types` - Available request types

---

## How to Contribute

When implementing features:
1. Pick an item from the current phase (QD-1 or QD-2)
2. Create a feature branch
3. Update this roadmap to mark progress
4. Reference Architecture.md for technical guidance
5. Test locally before deploying

**Priority:**
- QD phases take priority over legacy phases
- Focus on delivering value through the new dashboard-first UX
- Classic mode remains available but is not the focus
