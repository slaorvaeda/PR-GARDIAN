-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Codebase Vector Store (AST-Aware Chunks & Embeddings)
CREATE TABLE IF NOT EXISTS code_chunks (
    id VARCHAR(128) PRIMARY KEY,
    repo_id VARCHAR(128) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    language VARCHAR(64) DEFAULT 'typescript',
    chunk_type VARCHAR(64) NOT NULL, -- 'function', 'class', 'interface', 'api_route'
    name VARCHAR(256) NOT NULL,
    scope VARCHAR(256),
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    content TEXT NOT NULL,
    signature TEXT,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embedding vector(768), -- default 768-dim embeddings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file ON code_chunks(file_path);

-- 2. Relational Table: Repositories
CREATE TABLE IF NOT EXISTS repositories (
    id VARCHAR(128) PRIMARY KEY, -- e.g. 'acme-corp/payment-gateway'
    name VARCHAR(256) NOT NULL,
    owner VARCHAR(128) NOT NULL,
    default_branch VARCHAR(64) DEFAULT 'main',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Relational Table: Pull Requests
CREATE TABLE IF NOT EXISTS pull_requests (
    id VARCHAR(128) PRIMARY KEY, -- e.g. 'acme-corp/payment-gateway#412'
    repo_id VARCHAR(128) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pr_number INTEGER NOT NULL,
    title VARCHAR(512) NOT NULL,
    author VARCHAR(128) NOT NULL,
    source_branch VARCHAR(128) NOT NULL,
    target_branch VARCHAR(128) NOT NULL,
    head_sha VARCHAR(64) NOT NULL,
    status VARCHAR(64) DEFAULT 'pending_approval', -- 'queued', 'running', 'pending_approval', 'approved', 'rejected'
    diff_summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Relational Table: Review Comments & Threads (Associated with LangGraph thread_id)
CREATE TABLE IF NOT EXISTS review_comments (
    id VARCHAR(128) PRIMARY KEY,
    pr_id VARCHAR(128) NOT NULL,
    thread_id VARCHAR(128) NOT NULL, -- LangGraph thread_id checkpoint
    file_path VARCHAR(512) NOT NULL,
    line_number INTEGER NOT NULL,
    category VARCHAR(64) NOT NULL, -- 'security', 'architecture', 'testing'
    severity VARCHAR(32) DEFAULT 'critical',
    title VARCHAR(256) NOT NULL,
    message TEXT NOT NULL,
    suggested_fix TEXT,
    confidence_score NUMERIC(4,3) DEFAULT 0.95,
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'approved', 'dismissed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Relational Table: Engineering Guidelines (Team Architectural Policies)
CREATE TABLE IF NOT EXISTS engineering_guidelines (
    id VARCHAR(64) PRIMARY KEY,
    repo_id VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    rule_title VARCHAR(256) NOT NULL,
    rule_description TEXT NOT NULL,
    severity VARCHAR(32) DEFAULT 'critical',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Repository
INSERT INTO repositories (id, name, owner, default_branch)
VALUES ('acme-corp/payment-gateway', 'payment-gateway', 'acme-corp', 'main')
ON CONFLICT (id) DO NOTHING;

-- Seed Codified Engineering Guidelines
INSERT INTO engineering_guidelines (id, repo_id, category, rule_title, rule_description, severity)
VALUES 
    ('rule-1', 'acme-corp/payment-gateway', 'architecture', 'Layered Domain Boundary', 'Controllers and Route Handlers must never directly invoke raw database queries; all data access must go through service or repository layers.', 'critical'),
    ('rule-2', 'acme-corp/payment-gateway', 'security', 'SQL & Query Injection Guard', 'All dynamic queries must use parameterized placeholders ($1, ?, ORM binding); string interpolation in database calls is strictly prohibited.', 'critical'),
    ('rule-3', 'acme-corp/payment-gateway', 'security', 'Never Expose Raw SQL Errors', 'Database error messages and internal stack traces must never be leaked directly in HTTP API responses. Wrap in domain exceptions.', 'critical'),
    ('rule-4', 'acme-corp/payment-gateway', 'security', 'All Endpoints Must Use Auth Middleware', 'All mutating API endpoints (/POST, /PUT, /DELETE) must require authenticated session or JWT middleware before execution.', 'critical'),
    ('rule-5', 'acme-corp/payment-gateway', 'testing', 'Business Logic Coverage', 'Any modification or addition of critical business logic, state mutations, or branching calculations requires corresponding unit test coverage.', 'warning')
ON CONFLICT (id) DO NOTHING;
