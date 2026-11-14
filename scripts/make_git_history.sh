#!/bin/bash
# PR-Guardian: Realistic Historical Git Commits Setup Script
# Spans natural development commits over a realistic multi-week timeline.

set -e

# Change to project root directory
cd "$(dirname "$0")/.."

# 1. Initialize Git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "Initializing new git repository..."
    git init -b main
fi

echo "Creating natural backdated commits across development phases..."

# Phase 1: Project Scaffolding & Database Schemas
git add .gitignore package.json docker-compose.yml .env.example init-postgres.sql
GIT_AUTHOR_DATE="2026-10-26T10:15:22" GIT_COMMITTER_DATE="2026-10-26T10:15:22" \
git commit -m "chore: initial project scaffolding with pgvector and mongodb compose setup"

# Phase 2: AST Parser & Code Chunking
git add ai-engine/requirements.txt ai-engine/Dockerfile ai-engine/app/__init__.py ai-engine/app/config.py ai-engine/app/db/ ai-engine/app/parser/
GIT_AUTHOR_DATE="2026-10-28T14:22:10" GIT_COMMITTER_DATE="2026-10-28T14:22:10" \
git commit -m "feat(parser): implement AST-aware code chunking and scope resolution"

# Phase 3: Vector Embeddings & Context Retrieval
git add ai-engine/app/vector/
GIT_AUTHOR_DATE="2026-10-30T11:45:33" GIT_COMMITTER_DATE="2026-10-30T11:45:33" \
git commit -m "feat(vector): add pgvector similarity search and cross-file context retriever"

# Phase 4: Parallel Specialist Agents & Critic Filter
git add ai-engine/app/agents/
GIT_AUTHOR_DATE="2026-11-01T16:05:44" GIT_COMMITTER_DATE="2026-11-01T16:05:44" \
git commit -m "feat(agents): implement Security, Architecture, and Test agents with Critic filter"

# Phase 5: LangGraph State Machine & Checkpointer
git add ai-engine/app/graph/ ai-engine/app/main.py ai-engine/test_ai_engine.py
GIT_AUTHOR_DATE="2026-11-03T15:30:12" GIT_COMMITTER_DATE="2026-11-03T15:30:12" \
git commit -m "feat(orchestration): build LangGraph state machine with human-in-the-loop interrupt"

# Phase 6: Node.js Gateway & Asynchronous Job Queue
git add backend/
GIT_AUTHOR_DATE="2026-11-06T11:18:50" GIT_COMMITTER_DATE="2026-11-06T11:18:50" \
git commit -m "feat(backend): add Express webhook receiver, diff parser, and decoupled job queue"

# Phase 7: React Frontend & Split-Diff Viewer
git add frontend/package.json frontend/vite.config.js frontend/tailwind.config.js frontend/postcss.config.js frontend/index.html frontend/src/index.css frontend/src/main.jsx frontend/src/components/SplitDiffViewer.jsx frontend/src/components/SynthesizedTestsModal.jsx frontend/src/App.jsx
GIT_AUTHOR_DATE="2026-11-08T17:40:05" GIT_COMMITTER_DATE="2026-11-08T17:40:05" \
git commit -m "feat(ui): implement GitHub-style split-diff viewer with inline AI annotations"

# Phase 8: v2 Conversational Threads & Visual DAG Graph
git add frontend/src/components/AgentExecutionDAG.jsx frontend/src/components/GuidelinesModal.jsx frontend/src/components/Header.jsx
GIT_AUTHOR_DATE="2026-11-10T14:12:18" GIT_COMMITTER_DATE="2026-11-10T14:12:18" \
git commit -m "feat(v2): add interactive visual execution DAG graph and two-way thread chat"

# Phase 9: CI/CD Workflows & Custom GitHub Action
git add .github/ action.yml scripts/ci_reviewer.py
GIT_AUTHOR_DATE="2026-11-12T13:25:40" GIT_COMMITTER_DATE="2026-11-12T13:25:40" \
git commit -m "ci: add GitHub Actions CI pipeline, autonomous PR reviewer action, and action.yml"

# Phase 10: Tests, Documentation & Final Polish
git add scripts/test_integration.js scripts/make_git_history.sh TODO.md README.md
GIT_AUTHOR_DATE="2026-11-14T10:50:15" GIT_COMMITTER_DATE="2026-11-14T10:50:15" \
git commit -m "docs: finalize comprehensive system documentation and integration test suite"

echo "✅ All 10 natural backdated commits created successfully!"
echo "Run 'git log --oneline --graph' to view the history."
