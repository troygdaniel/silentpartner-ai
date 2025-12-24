# SilentPartner Product Roadmap

This roadmap outlines planned features and improvements, organized into iterative releases.

## Current State (v1.0)

**Core Features Shipped:**
- Google OAuth authentication
- AI employee creation with custom instructions
- Project channels with @mention routing
- Direct messages with individual employees
- Persistent chat history
- Memory system (shared, employee-specific, project-specific)
- File uploads (persistent for both DMs and projects)
- Multi-provider support (OpenAI + Anthropic)
- BYOK (Bring Your Own Keys) model

---

## Phase 1: Polish & Reliability ✅ (Complete)

**Goal:** Improve stability and user experience for existing features.

### 1.1 Error Handling & Feedback
- [x] Toast notifications for success/error states ✅
- [x] Better error messages when API keys are invalid ✅
- [x] Retry logic for failed API calls ✅
- [x] Loading states for all async operations ✅

### 1.2 Chat Improvements
- [x] Message timestamps displayed in UI ✅
- [x] Edit/delete individual messages ✅
- [x] Copy message to clipboard button ✅
- [x] Markdown rendering for AI responses ✅
- [x] Code syntax highlighting in responses ✅
- [x] Clear chat history button ✅

### 1.3 File Handling
- [x] Persist DM file uploads (currently session-only) ✅
- [x] File preview before upload ✅
- [ ] Support larger files with chunking
- [x] Download uploaded files ✅

### 1.4 Mobile Responsiveness
- [x] Collapsible sidebar on mobile ✅
- [x] Touch-friendly interactions ✅
- [x] Responsive chat input area ✅

---

## Phase 2: Enhanced AI Capabilities ✅ (Complete)

**Goal:** Make AI employees smarter and more capable.

### 2.1 Model Expansion
- [x] Add GPT-4 Turbo option ✅
- [x] Add Claude 3.5 Sonnet ✅
- [x] Add Claude 3 Haiku (faster, cheaper option) ✅
- [x] Add GPT-4o and GPT-4o Mini ✅
- [x] Model selection per conversation (not just per employee) ✅

### 2.2 Context Management
- [x] Token count display for conversations ✅
- [x] Automatic conversation summarization for long chats ✅
- [x] "Start fresh" button to clear context without deleting history ✅

### 2.3 Advanced Instructions
- [x] Instruction templates/presets ✅
- [x] Variables in instructions (e.g., {{user_name}}) ✅
- [x] Conditional instructions based on project ✅
- [x] Import/export employee configurations ✅

### 2.4 Memory Enhancements
- [x] Manual memory creation from UI ✅
- [x] Delete individual memories from UI ✅
- [x] Memory categories/tags ✅
- [x] Memory search ✅
- [x] Bulk memory import/export ✅

---

## Phase 3: Collaboration Features

**Goal:** Enable team usage and better project management.

### 3.1 Project Enhancements
- [x] Project status tracking (active, on-hold, completed) ✅
- [x] Project descriptions visible in UI ✅
- [x] Pin important messages in channels ✅
- [ ] Project-specific employee assignments

### 3.2 Conversation Organization
- [x] Search across all conversations ✅
- [x] Star/bookmark important conversations ✅
- [ ] Conversation tagging
- [x] Archive old conversations ✅

### 3.3 Export & Reporting
- [x] Export conversation to Markdown ✅
- [ ] Export conversation to PDF
- [ ] Usage statistics dashboard
- [ ] API cost tracking per employee/project

---

## Phase 4: Advanced File Support

**Goal:** Handle diverse file types and larger content.

### 4.1 Document Processing
- [ ] PDF text extraction and analysis
- [ ] Word document support
- [ ] Spreadsheet parsing (CSV, Excel)
- [ ] Image description via vision models

### 4.2 Code Support
- [ ] Syntax-aware code file handling
- [ ] GitHub repository import
- [ ] Code diff display in responses
- [ ] Run code snippets (sandboxed)

### 4.3 Knowledge Base
- [ ] Folder-based file organization
- [ ] Semantic search across files
- [ ] Auto-chunking large documents
- [ ] RAG (Retrieval Augmented Generation) integration

---

## Phase 5: Integrations

**Goal:** Connect SilentPartner to external tools and services.

### 5.1 Communication
- [ ] Slack integration (forward messages)
- [ ] Email integration (send/receive)
- [ ] Webhook support for notifications

### 5.2 Productivity
- [ ] Google Drive file import
- [ ] Notion page import
- [ ] Calendar integration for scheduling context

### 5.3 Developer Tools
- [ ] API access for external apps
- [ ] Zapier/Make integration
- [ ] CLI tool for power users

---

## Phase 6: Multi-User & Teams

**Goal:** Support organizations with multiple users.

### 6.1 Team Workspaces
- [ ] Organization/workspace creation
- [ ] Invite team members via email
- [ ] Role-based access control (admin, member, viewer)
- [ ] Shared employees across team

### 6.2 Shared Resources
- [ ] Shared memory pools
- [ ] Shared project files
- [ ] Team-wide instruction templates
- [ ] Centralized API key management (admin-only)

### 6.3 Audit & Compliance
- [ ] Activity logs
- [ ] Data retention policies
- [ ] Export all user data (GDPR)
- [ ] SSO integration (SAML, OIDC)

---

## Phase 7: Real-Time & Performance

**Goal:** Make the app faster and more responsive.

### 7.1 Real-Time Updates
- [ ] WebSocket connection for live updates
- [ ] Typing indicators
- [ ] Real-time message sync across tabs
- [ ] Push notifications (browser)

### 7.2 Performance Optimization
- [ ] Message pagination (load older on scroll)
- [ ] Virtual scrolling for long conversations
- [ ] Database query optimization
- [ ] Redis caching layer

### 7.3 Infrastructure
- [ ] Horizontal scaling support
- [ ] Background job processing
- [ ] Rate limiting per user
- [ ] CDN for static assets

---

## Future Considerations

**Ideas for later evaluation:**

- **Voice Interface**: Voice input/output for conversations
- **AI Agents**: Employees that can take actions (browse web, run code)
- **Marketplace**: Share/sell employee configurations
- **White-Label**: Custom branding for organizations
- **On-Premise**: Self-hosted deployment option
- **Mobile Apps**: Native iOS/Android applications
- **Offline Mode**: Queue messages when offline

---

## How to Contribute

When implementing features:
1. Pick an item from the current phase
2. Create a feature branch
3. Update this roadmap to mark progress
4. Reference Architecture.md for technical guidance
5. Test locally before deploying

**Priority Legend:**
- Items at the top of each section are higher priority
- Phases should be completed roughly in order
- Within a phase, sections can be worked in parallel
