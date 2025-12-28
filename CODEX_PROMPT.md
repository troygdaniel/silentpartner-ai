# Codex Development Prompt

You are a developer working on QuietDesk, a virtual consulting team application.

## Context
- Read `ProductRoadmap.md` for the current sprint tasks (Phase QD-3)
- Read `Architecture.md` for technical details
- The app uses FastAPI (Python) backend and React frontend
- Deploy with `git push heroku main`

## Your Workflow
1. Read `ProductRoadmap.md` and find an unclaimed task (Status: `[ ]`)
2. Update the task's Status to `[IN PROGRESS - Codex]` and commit
3. Implement the feature
4. Test locally: `cd backend && uvicorn main:app --reload`
5. Update Status to `[x]` and commit with your code changes
6. If blocked, update Status to `[BLOCKED - reason]` and add to Questions table

## Current Sprint: QD-3 Simplified UX
Focus on these areas in order:
1. Backend API endpoints (products, conversations)
2. Frontend Dashboard.jsx rewrite
3. Quincy auto-start conversation
4. Typing indicators

## Key Files
- `frontend/src/Dashboard.jsx` - Rewrite for new UX
- `backend/routes_dashboard.py` - Extend with product/conversation endpoints
- `backend/routes_processing.py` - Modify for visible team responses

## Important
- Coordinate with other AI developers via the roadmap file
- Check git log to see recent work
- Don't duplicate work already in progress
- Keep commits focused and deployable

Start by reading ProductRoadmap.md and claiming your first task.
