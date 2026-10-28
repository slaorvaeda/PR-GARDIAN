import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.config import settings

logger = logging.getLogger("pr_guardian.mongo")

# Fallback in-memory collections
_MEMORY_WEBHOOKS: List[Dict[str, Any]] = []
_MEMORY_PATCHES: List[Dict[str, Any]] = []
_MEMORY_TRACES: List[Dict[str, Any]] = []

class MongoManager:
    def __init__(self):
        self.connected = False
        self._client = None
        self._db = None

    async def initialize(self):
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            self._client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=2000)
            # Ping database
            await self._client.admin.command('ping')
            self._db = self._client.get_database()
            self.connected = True
            logger.info("Connected to MongoDB successfully.")
        except Exception as e:
            self.connected = False
            logger.warning(f"Could not connect to MongoDB ({e}). Operating in memory/fallback mode.")

    async def save_webhook_payload(self, event_type: str, payload: Dict[str, Any]) -> str:
        doc = {
            "event_type": event_type,
            "payload": payload,
            "received_at": datetime.now(timezone.utc).isoformat()
        }
        if self.connected and self._db is not None:
            try:
                res = await self._db["raw_webhooks"].insert_one(doc)
                return str(res.inserted_id)
            except Exception as e:
                logger.error(f"Failed to write to MongoDB raw_webhooks: {e}")
        
        _MEMORY_WEBHOOKS.append(doc)
        return f"mem-hook-{len(_MEMORY_WEBHOOKS)}"

    async def save_git_patch(self, pr_id: str, patch_content: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        doc = {
            "pr_id": pr_id,
            "patch": patch_content,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        if self.connected and self._db is not None:
            try:
                res = await self._db["git_patches"].insert_one(doc)
                return str(res.inserted_id)
            except Exception as e:
                logger.error(f"Failed to write to MongoDB git_patches: {e}")
        
        _MEMORY_PATCHES.append(doc)
        return f"mem-patch-{len(_MEMORY_PATCHES)}"

    async def log_trace(self, audit_id: str, agent_name: str, step: str, details: Dict[str, Any]):
        doc = {
            "audit_id": audit_id,
            "agent_name": agent_name,
            "step": step,
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        if self.connected and self._db is not None:
            try:
                await self._db["execution_traces"].insert_one(doc)
                return
            except Exception as e:
                logger.error(f"Failed to write to MongoDB execution_traces: {e}")
        
        _MEMORY_TRACES.append(doc)

    async def get_traces_for_audit(self, audit_id: str) -> List[Dict[str, Any]]:
        if self.connected and self._db is not None:
            try:
                cursor = self._db["execution_traces"].find({"audit_id": audit_id})
                results = []
                async for d in cursor:
                    d["_id"] = str(d["_id"])
                    results.append(d)
                return results
            except Exception as e:
                logger.error(f"Failed to read from MongoDB execution_traces: {e}")
        
        return [t for t in _MEMORY_TRACES if t.get("audit_id") == audit_id]

mongo_db = MongoManager()
