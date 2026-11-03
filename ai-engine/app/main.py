import asyncio
import json
import logging
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.db.postgres import postgres_db
from app.db.mongo import mongo_db
from app.agents.state import PRReviewState, ReviewFinding
from app.graph.workflow import workflow_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("pr_guardian.main")

_ACTIVE_AUDITS: Dict[str, PRReviewState] = {}
_AUDIT_STREAMS: Dict[str, asyncio.Queue] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing PR-Guardian AI Engine v2...")
    await postgres_db.initialize()
    await mongo_db.initialize()
    yield
    logger.info("Shutting down PR-Guardian AI Engine.")

app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    description="Autonomous Codebase & Pull Request Reviewer with Multi-Turn Conversational Threads and DAG Telemetry.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunAuditRequest(BaseModel):
    audit_id: str
    repo_id: str
    pr_number: int
    title: str
    diff_content: str
    files_changed: list

class ResumeAuditRequest(BaseModel):
    action: str # 'approve' | 'reject' | 'edit_comment' | 'dismiss_comment'
    finding_id: Optional[str] = None
    edited_message: Optional[str] = None

class ThreadReplyRequest(BaseModel):
    audit_id: str
    finding_id: str
    message: str
    author: Optional[str] = "developer"

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": "2.0.0",
        "postgres_connected": postgres_db.connected,
        "mongo_connected": mongo_db.connected
    }

@app.post("/audit/run")
async def run_audit(req: RunAuditRequest):
    audit_id = req.audit_id
    initial_state = PRReviewState(
        audit_id=audit_id,
        repo_id=req.repo_id,
        pr_number=req.pr_number,
        title=req.title,
        diff_content=req.diff_content,
        files_changed=req.files_changed
    )

    _ACTIVE_AUDITS[audit_id] = initial_state
    _AUDIT_STREAMS[audit_id] = asyncio.Queue()

    asyncio.create_task(_execute_langgraph_pipeline(audit_id, initial_state))

    return {
        "audit_id": audit_id,
        "status": "started",
        "message": f"Audit pipeline launched for PR #{req.pr_number}"
    }

async def _execute_langgraph_pipeline(audit_id: str, state: PRReviewState):
    queue = _AUDIT_STREAMS.get(audit_id)

    async def emit(step: str, message: str, data: Optional[Dict[str, Any]] = None):
        payload = {
            "step": step,
            "message": message,
            "data": data or {},
            "telemetry": state.telemetry
        }
        if queue:
            await queue.put(payload)

    try:
        await emit("init", f"Starting multi-agent audit on {len(state.files_changed)} modified files...")
        
        # Step 1: Context & AST
        await emit("ast_indexing", "Deconstructing files into AST units and embedding in pgvector...")
        node1_res = await workflow_engine._node_prepare_context(state)
        state.ast_chunks = node1_res["ast_chunks"]
        state.retrieved_context = node1_res["retrieved_context"]
        state.telemetry = node1_res["telemetry"]
        state.execution_logs.extend(node1_res["execution_logs"])
        await emit("ast_complete", f"Indexed {len(state.ast_chunks)} AST functions/classes.")

        # Step 2: Parallel Specialist Agents
        await emit("agents_dispatch", "Dispatching Security, Architecture, and Test Generator agents...")
        sec_res, arch_res, test_res = await asyncio.gather(
            workflow_engine._node_security(state),
            workflow_engine._node_architecture(state),
            workflow_engine._node_testing(state)
        )
        state.security_findings = sec_res["security_findings"]
        state.architecture_findings = arch_res["architecture_findings"]
        state.test_findings = test_res["test_findings"]
        state.generated_tests = test_res.get("generated_tests", [])
        
        total_raw = len(state.security_findings) + len(state.architecture_findings) + len(state.test_findings)
        await emit("agents_done", f"Specialist agents finished with {total_raw} preliminary findings.", {
            "security": len(state.security_findings),
            "architecture": len(state.architecture_findings),
            "tests": len(state.test_findings)
        })

        # Step 3: Critic Node
        await emit("critic_filtering", "Critic Node evaluating findings for confidence >= 0.85 and diff alignment...")
        critic_res = await workflow_engine._node_critic(state)
        state.critic_findings = critic_res["critic_findings"]
        state.dropped_findings_count = critic_res["dropped_findings_count"]
        state.telemetry = critic_res["telemetry"]
        state.status = "pending_approval"
        
        await emit("critic_done", f"Critic approved {len(state.critic_findings)} high-confidence findings; eliminated {state.dropped_findings_count} false positives.", {
            "approved_count": len(state.critic_findings),
            "dropped_count": state.dropped_findings_count
        })

        # Step 4: Human Approval Interrupt
        await emit("awaiting_approval", "Execution paused. Awaiting Human Reviewer approval before posting to GitHub.", {
            "status": "pending_approval",
            "findings": [f.model_dump() for f in state.critic_findings],
            "generated_tests": [t.model_dump() for t in state.generated_tests],
            "telemetry": state.telemetry
        })

    except Exception as e:
        logger.error(f"Error executing LangGraph pipeline for {audit_id}: {e}", exc_info=True)
        if queue:
            await queue.put({"step": "error", "message": f"Pipeline failed: {str(e)}"})

@app.get("/audit/status/{audit_id}")
async def get_audit_status(audit_id: str):
    if audit_id not in _ACTIVE_AUDITS:
        raise HTTPException(status_code=404, detail="Audit not found")
    state = _ACTIVE_AUDITS[audit_id]
    return state.model_dump()

@app.get("/audit/stream/{audit_id}")
async def stream_audit(audit_id: str):
    queue = _AUDIT_STREAMS.get(audit_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Audit stream not found")

    async def event_generator():
        try:
            while True:
                msg = await queue.get()
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("step") in ["awaiting_approval", "completed", "error"]:
                    break
        except asyncio.CancelledError:
            pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/audit/reply")
async def reply_to_finding(req: ThreadReplyRequest):
    """
    Two-Way Conversational Thread Resumption.
    Developers reply to an AI review comment, and LangGraph resumes the thread state.
    """
    if req.audit_id not in _ACTIVE_AUDITS:
        raise HTTPException(status_code=404, detail="Audit not found")
    
    state = _ACTIVE_AUDITS[req.audit_id]
    result = await workflow_engine.handle_thread_reply(
        state=state,
        finding_id=req.finding_id,
        developer_message=req.message,
        author=req.author or "developer"
    )

    # Broadcast thread update to SSE clients
    queue = _AUDIT_STREAMS.get(req.audit_id)
    if queue:
        await queue.put({
            "step": "thread_reply",
            "message": f"Developer replied to {req.finding_id}",
            "data": result,
            "telemetry": state.telemetry
        })

    return result

@app.post("/audit/resume/{audit_id}")
async def resume_audit(audit_id: str, req: ResumeAuditRequest):
    if audit_id not in _ACTIVE_AUDITS:
        raise HTTPException(status_code=404, detail="Audit not found")
    
    state = _ACTIVE_AUDITS[audit_id]
    
    if req.action == "edit_comment" and req.finding_id:
        for f in state.critic_findings:
            if f.id == req.finding_id:
                f.message = req.edited_message or f.message
                break
        return {"status": "comment_updated"}

    elif req.action == "dismiss_comment" and req.finding_id:
        for f in state.critic_findings:
            if f.id == req.finding_id:
                f.dismissed = True
                break
        return {"status": "comment_dismissed"}

    elif req.action in ["approve", "reject"]:
        state.human_decision = {"action": req.action}
        finalize_res = await workflow_engine._node_finalize(state)
        state.approved_comments = finalize_res["approved_comments"]
        state.status = finalize_res["status"]

        queue = _AUDIT_STREAMS.get(audit_id)
        if queue:
            await queue.put({
                "step": "completed",
                "message": f"Audit {req.action}d by human reviewer.",
                "data": {"status": state.status, "approved_count": len(state.approved_comments)},
                "telemetry": state.telemetry
            })

        return {
            "status": state.status,
            "action": req.action,
            "approved_comments_count": len(state.approved_comments)
        }

    return {"status": "unknown_action"}
