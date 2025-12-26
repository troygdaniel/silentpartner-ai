from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey, LargeBinary, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    google_access_token = Column(String, nullable=True)  # Encrypted Google access token
    google_refresh_token = Column(String, nullable=True)  # Encrypted Google refresh token
    google_token_expires_at = Column(DateTime, nullable=True)  # When access token expires
    is_active = Column(Boolean, default=True)
    openai_api_key = Column(String, nullable=True)  # Encrypted BYO key for OpenAI
    anthropic_api_key = Column(String, nullable=True)  # Encrypted BYO key for Anthropic
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employees = relationship("Employee", back_populates="owner", cascade="all, delete-orphan")
    shared_memories = relationship("Memory", back_populates="owner", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True)  # e.g., "Project Manager", "Developer", "QA"
    instructions = Column(Text, nullable=True)  # Combined instructions (legacy, still used for display)
    user_instructions = Column(Text, nullable=True)  # User's custom additions/overrides
    role_template_id = Column(UUID(as_uuid=True), ForeignKey("role_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    role_template_version = Column(Integer, nullable=True)  # Version of template when cloned
    model = Column(String, default="gpt-4")  # AI model to use
    is_default = Column(Boolean, default=False)  # True for the default PM (undeletable)
    starred = Column(Boolean, default=False)  # Starred/bookmarked conversation
    archived = Column(Boolean, default=False)  # Archived conversation (hidden by default)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="employees")
    memories = relationship("Memory", back_populates="employee", cascade="all, delete-orphan")
    role_template = relationship("RoleTemplate")


class Memory(Base):
    __tablename__ = "memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)  # NULL = shared
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)  # NULL = not project-scoped
    content = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # Category/tag: preference, fact, context, instruction, other
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="shared_memories")
    employee = relationship("Employee", back_populates="memories")
    project = relationship("Project", back_populates="memories")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)  # Project-specific instructions for AI employees
    status = Column(String, default="active")  # active, completed, archived
    starred = Column(Boolean, default=False)  # Starred/bookmarked conversation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="projects")
    messages = relationship("Message", back_populates="project", cascade="all, delete-orphan")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    memories = relationship("Memory", back_populates="project")


class Message(Base):
    """Persistent chat messages for both project channels and direct messages."""
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)  # NULL = direct message
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)  # For DMs or @mentions
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    pinned = Column(Boolean, default=False)  # Pinned/important message
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="messages")
    employee = relationship("Employee")


class ProjectFile(Base):
    """Persistent file storage for projects."""
    __tablename__ = "project_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # Text content only
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="files")


class DMFile(Base):
    """Persistent file storage for direct messages."""
    __tablename__ = "dm_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee")


class ProjectEmployee(Base):
    """Many-to-many relationship between projects and employees."""
    __tablename__ = "project_employees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ConversationTag(Base):
    """Tags for organizing conversations."""
    __tablename__ = "conversation_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=True, index=True)
    tag = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UsageLog(Base):
    """Track API usage for statistics."""
    __tablename__ = "usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    model = Column(String, nullable=False)
    provider = Column(String, nullable=False)  # "openai" or "anthropic"
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class RoleTemplate(Base):
    """System-provided role templates (versioned). Users clone these to create employees."""
    __tablename__ = "role_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String, unique=True, nullable=False, index=True)  # e.g., "project-manager"
    name = Column(String, nullable=False)  # e.g., "Project Manager"
    description = Column(Text, nullable=True)  # What this role does
    purpose = Column(Text, nullable=True)  # Primary purpose/goal
    boundaries_does = Column(Text, nullable=True)  # What this role DOES (JSON array or newline-separated)
    boundaries_does_not = Column(Text, nullable=True)  # What this role does NOT do
    instructions = Column(Text, nullable=True)  # Default system instructions
    recommended_integrations = Column(Text, nullable=True)  # JSON array of integration slugs for Phase 5
    recommended_model = Column(String, default="gpt-4")  # Suggested AI model
    is_default = Column(Boolean, default=False)  # True for Project Manager (auto-created)
    is_undeletable = Column(Boolean, default=False)  # True for Project Manager (can't be removed)
    version = Column(Integer, default=1)  # Template version for safe updates
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MemorySuggestion(Base):
    """Suggested memory updates from roles, awaiting user approval."""
    __tablename__ = "memory_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    content = Column(Text, nullable=False)  # Suggested memory content
    category = Column(String, nullable=True)  # Suggested category
    status = Column(String, default="pending")  # pending, approved, rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
