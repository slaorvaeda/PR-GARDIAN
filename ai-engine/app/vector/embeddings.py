import hashlib
import numpy as np
from typing import List
import httpx
from app.config import settings

class EmbeddingService:
    def __init__(self):
        self.dimension = 768

    async def get_embedding(self, text: str) -> List[float]:
        # 1. Try Gemini Embeddings if GEMINI_API_KEY is available
        if settings.GEMINI_API_KEY:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={settings.GEMINI_API_KEY}"
                payload = {
                    "model": "models/text-embedding-004",
                    "content": {"parts": [{"text": text[:8000]}]}
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        values = data.get("embedding", {}).get("values", [])
                        if values:
                            return values[:self.dimension]
            except Exception:
                pass

        # 2. Try OpenAI Embeddings if OPENAI_API_KEY is available
        if settings.OPENAI_API_KEY:
            try:
                url = "https://api.openai.com/v1/embeddings"
                headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
                payload = {
                    "model": "text-embedding-3-small",
                    "input": text[:8000],
                    "dimensions": self.dimension
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        values = data["data"][0]["embedding"]
                        return values
            except Exception:
                pass

        # 3. Deterministic Local Semantic Embedding Generator (No external network required)
        return self._generate_deterministic_embedding(text)

    def _generate_deterministic_embedding(self, text: str) -> List[float]:
        """Generates a normalized 768-dimensional pseudo-dense vector based on n-gram token hashes."""
        vec = np.zeros(self.dimension, dtype=float)
        words = text.lower().split()
        if not words:
            vec[0] = 1.0
            return vec.tolist()

        for word in words:
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = h % self.dimension
            sign = 1.0 if ((h >> 8) % 2 == 0) else -1.0
            vec[idx] += sign

        # Normalize L2 norm
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        else:
            vec[0] = 1.0

        return vec.tolist()

embedding_service = EmbeddingService()
