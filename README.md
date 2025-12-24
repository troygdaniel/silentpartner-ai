# SilentPartner

Your AI consulting team, configured by you.

SilentPartner is a web application that lets you create and manage a team of AI employees, each with their own personality, expertise, and instructions. Chat with them directly or collaborate in project channels using @mentions.

## Features

- **AI Team Management**: Create AI employees with custom names, roles, instructions, and model preferences (GPT-4, Claude 3, etc.)
- **Project Channels**: Slack-like channels for project discussions with @mention support to route questions to specific team members
- **Direct Messages**: One-on-one conversations with individual AI employees
- **Persistent Chat History**: All conversations are saved and accessible across sessions
- **Memory System**: Store facts and context that your AI team remembers across all conversations
- **File Uploads**: Attach files to conversations for context-aware responses
- **Bring Your Own Keys**: Use your own OpenAI and Anthropic API keys (encrypted and stored securely)
- **Google OAuth**: Secure authentication with your Google account

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Authentication**: Google OAuth 2.0 + JWT
- **AI Providers**: OpenAI API, Anthropic API
- **Deployment**: Heroku

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL database
- Google OAuth credentials
- OpenAI and/or Anthropic API keys

### Environment Variables

Create a `.env` file in the backend directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/silentpartner
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ENCRYPTION_KEY=your-32-byte-encryption-key
```

### Local Development

1. **Install backend dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Install frontend dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Start the backend**:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

4. **Start the frontend** (in a separate terminal):
   ```bash
   cd frontend
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

### Deployment to Heroku

1. **Create a Heroku app**:
   ```bash
   heroku create your-app-name
   ```

2. **Add PostgreSQL**:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

3. **Set environment variables**:
   ```bash
   heroku config:set JWT_SECRET=your-secret
   heroku config:set GOOGLE_CLIENT_ID=your-client-id
   heroku config:set GOOGLE_CLIENT_SECRET=your-client-secret
   heroku config:set ENCRYPTION_KEY=your-encryption-key
   ```

4. **Add buildpacks**:
   ```bash
   heroku buildpacks:add heroku/nodejs
   heroku buildpacks:add heroku/python
   ```

5. **Deploy**:
   ```bash
   git push heroku main
   ```

## Project Structure

```
silentpartner/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── database.py          # Database configuration
│   ├── models.py            # SQLAlchemy models
│   ├── auth.py              # JWT authentication
│   ├── crypto.py            # API key encryption
│   ├── routes_auth.py       # Google OAuth routes
│   ├── routes_employees.py  # Employee CRUD
│   ├── routes_projects.py   # Project CRUD
│   ├── routes_chat.py       # Chat streaming
│   ├── routes_memory.py     # Memory management
│   ├── routes_messages.py   # Message persistence
│   ├── routes_files.py      # File uploads (DMs)
│   ├── routes_project_files.py  # Project file storage
│   ├── routes_settings.py   # API key management
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.jsx          # Main React component
│   ├── package.json
│   └── vite.config.js
├── Procfile                 # Heroku process config
└── package.json             # Root package for build
```

## Usage

1. **Sign in** with your Google account
2. **Add API keys** in Settings (OpenAI and/or Anthropic)
3. **Create employees** with custom names, roles, and instructions
4. **Start chatting** via Direct Messages or create Projects for team collaboration
5. **Use @mentions** in project channels to direct questions to specific employees

## License

MIT
