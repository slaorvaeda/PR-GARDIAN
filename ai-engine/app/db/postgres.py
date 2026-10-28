import json
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from app.config import settings

logger = logging.getLogger("pr_guardian.postgres")

# In-memory resilient store for fallback mode when external Postgres container is not running
_MEMORY_CODE_CHUNKS: List[Dict[str, Any]] = []
_MEMORY_REPO_RULES: List[Dict[str, Any]] = [
    {
        "id": "rule-1",
        "repo_id": "default",
        "category": "architecture",
        "title": "Layered Domain Boundary",
        "rule_description": "Controllers and Route Handlers must never directly invoke raw database queries; all data access must go through service or repository layers.",
        "severity": "critical"
    },
    {
        "id": "rule-2",
        "repo_id": "default",
        "category": "security",
        "title": "SQL & Query Injection Guard",
        "rule_description": "All dynamic queries must use parameterized placeholders or ORM-bound parameters; string interpolation in database calls is strictly prohibited.",
        "severity": "critical"
    },
    {
        "id": "rule-3",
        "repo_id": "default",
        "category": "security",
        "title": "Secrets & Credential Exposure",
        "rule_description": "Hardcoded API tokens, private keys, passwords, or test credentials must never be committed to source files.",
        "severity": "critical"
    },
    {
        "id": "rule-4",
        "repo_id": "default",
        "category": "testing",
        "title": "Business Logic Coverage",
        "rule_description": "Any modification or addition of critical business logic, state mutations, or branching calculations requires corresponding unit test coverage.",
        "severity": "warning"
    }
]

class PostgresManager:
    def __init__(self):
        self.connected = False
        self._pool = None

    async def initialize(self):
        try:
            import asyncpg
            self._pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=1,
                max_size=10,
                timeout=3.0
            )
            async with self._pool.acquire() as conn:
                await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            self.connected = True
            logger.info("Connected to PostgreSQL with pgvector successfully.")
        except Exception as e:
            self.connected = False
            logger.warning(f"Could not connect to PostgreSQL ({e}). Operating in memory/fallback mode.")

    async def insert_chunk(self, chunk: Dict[str, Any]):
        if self.connected and self._pool:
            try:
                emb_str = f"[{','.join(str(x) for x in chunk.get('embedding', []))}]" if chunk.get('embedding') else None
                async with self._pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO code_chunks 
                        (id, repo_id, file_path, chunk_type, name, scope, start_line, end_line, content, signature, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector)
                        ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding = EXCLUDED.embedding,
                            start_line = EXCLUDED.start_line,
                            end_line = EXCLUDED.end_line;
                    """, chunk['id'], chunk['repo_id'], chunk['file_path'], chunk['chunk_type'],
                       chunk['name'], chunk.get('scope'), chunk['start_line'], chunk['end_line'],
                       chunk['content'], chunk.get('signature'), emb_str)
                return
            except Exception as e:
                logger.error(f"Postgres insert failed: {e}. Falling back to memory.")

        # In-memory fallback
        _MEMORY_CODE_CHUNKS.append(chunk)

    async def search_similar_chunks(self, repo_id: str, query_embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        if self.connected and self._pool and query_embedding:
            try:
                emb_str = f"[{','.join(str(x) for x in query_embedding)}]"
                async with self._pool.acquire() as conn:
                    rows = await conn.fetch("""
                        SELECT id, repo_id, file_path, chunk_type, name, scope, start_line, end_line, content, signature,
                               1 - (embedding <=> $1::vector) as similarity
                        FROM code_chunks
                        WHERE repo_id = $2 AND embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector ASC
                        LIMIT $3;
                    """, emb_str, repo_id, limit)
                    return [dict(r) for r in rows]
            except Exception as e:
                logger.error(f"Vector search failed: {e}. Falling back to memory search.")

        # In-memory cosine similarity
        if not _MEMORY_CODE_CHUNKS or not query_embedding:
            return []

        q_vec = np.array(query_embedding, dtype=float)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return _MEMORY_CODE_CHUNKS[:limit]

        scored = []
        for c in _MEMORY_CODE_CHUNKS:
            if c.get("repo_id") == repo_id and c.get("embedding"):
                c_vec = np.array(c["embedding"], dtype=float)
                c_norm = np.linalg.norm(c_vec)
                sim = np.dot(q_vec, c_vec) / (q_norm * c_norm) if c_norm > 0 else 0
                scored.append((sim, c))
            else:
                scored.append((0.5, c))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:limit]]

    async def get_repo_rules(self, repo_id: str) -> List[Dict[str, Any]]:
        if self.connected and self._pool:
            try:
                async with self._pool.acquire() as conn:
                    rows = await conn.fetch("SELECT * FROM repo_rules WHERE repo_id = $1 OR repo_id = 'default';", repo_id)
                    if rows:
                        return [dict(r) for r in rows]
            except Exception as e:
                logger.warning(f"Failed to fetch rules from Postgres: {e}")
        return [r for r in _MEMORY_REPO_RULES if r.get("repo_id") in (repo_id, "default")]

postgres_db = PostgresManager()
