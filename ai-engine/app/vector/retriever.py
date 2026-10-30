import re
from typing import List, Dict, Any
from app.db.postgres import postgres_db
from app.vector.embeddings import embedding_service

class ContextRetriever:
    """
    Retrieves global codebase context and codified architectural rules
    relevant to the lines changed in a Pull Request.
    """

    async def retrieve_context_for_diff(self, repo_id: str, diff_text: str) -> Dict[str, Any]:
        # 1. Extract modified symbols / identifiers from diff
        symbols = self._extract_modified_symbols(diff_text)
        
        # 2. Get embeddings for diff summary
        query_text = f"{' '.join(symbols)} \n {diff_text[:2000]}"
        query_embedding = await embedding_service.get_embedding(query_text)

        # 3. Search pgvector for related functions / callers in the repo
        related_chunks = await postgres_db.search_similar_chunks(
            repo_id=repo_id,
            query_embedding=query_embedding,
            limit=5
        )

        # 4. Fetch team / repository architectural rules
        repo_rules = await postgres_db.get_repo_rules(repo_id)

        return {
            "symbols_detected": symbols,
            "related_chunks": related_chunks,
            "repo_rules": repo_rules
        }

    def _extract_modified_symbols(self, diff_text: str) -> List[str]:
        # Extract function calls, class names, and variable assignments in added/modified lines
        added_lines = [line[1:] for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++")]
        corpus = " ".join(added_lines)
        matches = re.findall(r'\b[A-Za-z_][A-Za-z0-9_]{3,}\b', corpus)
        
        # Filter common keywords
        common_keywords = {"const", "function", "return", "import", "export", "async", "await", "class", "public", "private", "string", "number", "boolean", "true", "false", "null", "undefined"}
        filtered = list(set([m for m in matches if m not in common_keywords]))
        return filtered[:15]

context_retriever = ContextRetriever()
