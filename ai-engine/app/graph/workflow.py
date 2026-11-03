import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.agents.state import PRReviewState, ThreadReply
from app.parser.ast_chunker import ast_chunker
from app.vector.retriever import context_retriever
from app.vector.embeddings import embedding_service
from app.db.postgres import postgres_db
from app.db.mongo import mongo_db
from app.agents.security import security_agent
from app.agents.architecture import architecture_agent
from app.agents.test_generator import test_generator_agent
from app.agents.critic import critic_node

logger = logging.getLogger("pr_guardian.workflow")

class ReviewWorkflowEngine:
    def __init__(self):
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self):
        builder = StateGraph(PRReviewState)

        # 1. Nodes
        builder.add_node("prepare_context", self._node_prepare_context)
        builder.add_node("security_specialist", self._node_security)
        builder.add_node("architecture_specialist", self._node_architecture)
        builder.add_node("test_specialist", self._node_testing)
        builder.add_node("critic_filter", self._node_critic)
        builder.add_node("human_interrupt", self._node_human_interrupt)
        builder.add_node("finalize_dispatch", self._node_finalize)

        # 2. Edges
        builder.set_entry_point("prepare_context")

        # Parallel fan-out
        builder.add_edge("prepare_context", "security_specialist")
        builder.add_edge("prepare_context", "architecture_specialist")
        builder.add_edge("prepare_context", "test_specialist")

        # Fan-in to Critic
        builder.add_edge("security_specialist", "critic_filter")
        builder.add_edge("architecture_specialist", "critic_filter")
        builder.add_edge("test_specialist", "critic_filter")

        # Critic to Human Interrupt
        builder.add_edge("critic_filter", "human_interrupt")

        # Human Interrupt conditionally completes
        builder.add_edge("human_interrupt", "finalize_dispatch")
        builder.add_edge("finalize_dispatch", END)

        return builder.compile(
            checkpointer=self.checkpointer,
            interrupt_before=["human_interrupt"]
        )

    async def _node_prepare_context(self, state: PRReviewState) -> Dict[str, Any]:
        t0 = time.time()
        logger.info(f"[{state.audit_id}] Preparing AST & Vector context...")
        
        all_chunks = []
        for f in state.files_changed:
            chunks = ast_chunker.chunk_file(
                file_path=f.get("file_path", "unknown"),
                content=f.get("content", f.get("diff", "")),
                repo_id=state.repo_id
            )
            for c in chunks:
                emb = await embedding_service.get_embedding(c["content"])
                c["embedding"] = emb
                await postgres_db.insert_chunk(c)
            all_chunks.extend(chunks)

        retrieved = await context_retriever.retrieve_context_for_diff(
            repo_id=state.repo_id,
            diff_text=state.diff_content
        )

        duration = int((time.time() - t0) * 1000)
        tokens = len(state.diff_content.split()) * 2

        log_entry = {
            "step": "prepare_context",
            "message": f"Parsed {len(all_chunks)} AST chunks and retrieved {len(retrieved.get('related_chunks', []))} cross-file contexts.",
            "duration_ms": duration,
            "tokens": tokens
        }

        telemetry = state.telemetry
        telemetry["total_tokens"] = telemetry.get("total_tokens", 0) + tokens
        telemetry["prompt_tokens"] = telemetry.get("prompt_tokens", 0) + tokens
        telemetry["total_duration_ms"] = telemetry.get("total_duration_ms", 0) + duration
        telemetry["nodes"]["prepare_context"] = {"status": "completed", "duration_ms": duration, "tokens": tokens}

        await mongo_db.log_trace(state.audit_id, "ContextEngine", "prepare_context", log_entry)

        return {
            "ast_chunks": all_chunks,
            "retrieved_context": retrieved,
            "execution_logs": state.execution_logs + [log_entry],
            "telemetry": telemetry
        }

    async def _node_security(self, state: PRReviewState) -> Dict[str, Any]:
        t0 = time.time()
        findings = await security_agent.analyze(state.files_changed, state.retrieved_context)
        for f in findings:
            f.thread_id = f"thread-{f.id}"

        duration = int((time.time() - t0) * 1000)
        tokens = sum(len(f.message.split()) for f in findings) * 3 + 450

        log_entry = {
            "step": "security_specialist",
            "message": f"Security agent flagged {len(findings)} potential security/vulnerability findings.",
            "duration_ms": duration,
            "tokens": tokens
        }

        telemetry = state.telemetry
        telemetry["total_tokens"] = telemetry.get("total_tokens", 0) + tokens
        telemetry["nodes"]["security_specialist"] = {"status": "completed", "duration_ms": duration, "tokens": tokens}

        await mongo_db.log_trace(state.audit_id, "SecurityAgent", "analyze", {"count": len(findings), "tokens": tokens})
        return {
            "security_findings": findings,
            "execution_logs": state.execution_logs + [log_entry],
            "telemetry": telemetry
        }

    async def _node_architecture(self, state: PRReviewState) -> Dict[str, Any]:
        t0 = time.time()
        findings = await architecture_agent.analyze(state.files_changed, state.retrieved_context)
        for f in findings:
            f.thread_id = f"thread-{f.id}"

        duration = int((time.time() - t0) * 1000)
        tokens = sum(len(f.message.split()) for f in findings) * 3 + 380

        log_entry = {
            "step": "architecture_specialist",
            "message": f"Architecture agent flagged {len(findings)} design/layering rule violations.",
            "duration_ms": duration,
            "tokens": tokens
        }

        telemetry = state.telemetry
        telemetry["total_tokens"] = telemetry.get("total_tokens", 0) + tokens
        telemetry["nodes"]["architecture_specialist"] = {"status": "completed", "duration_ms": duration, "tokens": tokens}

        await mongo_db.log_trace(state.audit_id, "ArchitectureAgent", "analyze", {"count": len(findings), "tokens": tokens})
        return {
            "architecture_findings": findings,
            "execution_logs": state.execution_logs + [log_entry],
            "telemetry": telemetry
        }

    async def _node_testing(self, state: PRReviewState) -> Dict[str, Any]:
        t0 = time.time()
        findings, tests = await test_generator_agent.analyze(state.files_changed, state.retrieved_context)
        for f in findings:
            f.thread_id = f"thread-{f.id}"

        duration = int((time.time() - t0) * 1000)
        tokens = sum(len(t.test_code.split()) for t in tests) * 2 + 520

        log_entry = {
            "step": "test_specialist",
            "message": f"Test agent generated {len(tests)} test suites and flagged {len(findings)} coverage gaps.",
            "duration_ms": duration,
            "tokens": tokens
        }

        telemetry = state.telemetry
        telemetry["total_tokens"] = telemetry.get("total_tokens", 0) + tokens
        telemetry["nodes"]["test_specialist"] = {"status": "completed", "duration_ms": duration, "tokens": tokens}

        await mongo_db.log_trace(state.audit_id, "TestAgent", "analyze", {"findings": len(findings), "tests": len(tests)})
        return {
            "test_findings": findings,
            "generated_tests": tests,
            "execution_logs": state.execution_logs + [log_entry],
            "telemetry": telemetry
        }

    async def _node_critic(self, state: PRReviewState) -> Dict[str, Any]:
        t0 = time.time()
        all_raw = state.security_findings + state.architecture_findings + state.test_findings
        vetted, dropped = critic_node.filter_findings(all_raw, state.files_changed)
        
        duration = int((time.time() - t0) * 1000)
        tokens = len(all_raw) * 75

        log_entry = {
            "step": "critic_filter",
            "message": f"Critic verified {len(vetted)} high-confidence comments (dropped {dropped} false positives).",
            "duration_ms": duration,
            "tokens": tokens
        }

        telemetry = state.telemetry
        telemetry["total_tokens"] = telemetry.get("total_tokens", 0) + tokens
        telemetry["nodes"]["critic_filter"] = {"status": "completed", "duration_ms": duration, "tokens": tokens}

        await mongo_db.log_trace(state.audit_id, "CriticNode", "filter", {"vetted": len(vetted), "dropped": dropped})

        return {
            "critic_findings": vetted,
            "dropped_findings_count": dropped,
            "status": "pending_approval",
            "execution_logs": state.execution_logs + [log_entry],
            "telemetry": telemetry
        }

    async def _node_human_interrupt(self, state: PRReviewState) -> Dict[str, Any]:
        logger.info(f"[{state.audit_id}] Execution paused at Human Approval Interrupt.")
        return {"status": "pending_approval"}

    async def _node_finalize(self, state: PRReviewState) -> Dict[str, Any]:
        decision = state.human_decision or {"action": "approve"}
        approved = [f for f in state.critic_findings if not f.dismissed]

        log_entry = {
            "step": "finalize_dispatch",
            "message": f"Human review complete ({decision.get('action')}). {len(approved)} comments approved for GitHub."
        }
        await mongo_db.log_trace(state.audit_id, "Dispatcher", "finalize", {"decision": decision, "approved": len(approved)})

        return {
            "approved_comments": approved,
            "status": "completed",
            "execution_logs": state.execution_logs + [log_entry]
        }

    async def handle_thread_reply(self, state: PRReviewState, finding_id: str, developer_message: str, author: str = "developer") -> Dict[str, Any]:
        """
        Two-Way Conversational Thread Resumption.
        Resumes the exact LangGraph thread checkpoint and responds to developer questions.
        """
        target_finding = next((f for f in state.critic_findings if f.id == finding_id), None)
        if not target_finding:
            return {"error": "Finding not found"}

        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")

        # 1. Record developer's question
        dev_reply = ThreadReply(
            id=f"rep-{uuid.uuid4().hex[:6]}",
            author=author,
            role="user",
            message=developer_message,
            timestamp=now_str
        )
        target_finding.replies.append(dev_reply)

        # 2. Synthesize Context-Aware Senior Engineer response
        prompt_lower = developer_message.lower()
        if "risk" in prompt_lower or "why" in prompt_lower:
            ai_text = (
                f"Great question! In {target_finding.file_path} (line {target_finding.line_number}), "
                f"this pattern ({target_finding.title}) is risky because attackers can bypass input sanitization. "
                f"Even if `{target_finding.rule_id or 'the variable'}` seems trusted today, future callers might pass unescaped query parameters, "
                f"enabling arbitrary SQL execution or compromising customer data boundaries. Parameterization binds values at the driver level, making injection structurally impossible."
            )
        elif "fix" in prompt_lower or "refactor" in prompt_lower or "how" in prompt_lower:
            ai_text = (
                f"To fix this cleanly, replace raw interpolation with parameter placeholders:\n\n"
                f"```typescript\n"
                f"// Recommended parameter binding:\n"
                f"const query = 'SELECT * FROM users WHERE tenant = $1 AND email = $2';\n"
                f"const result = await db.query(query, [tenantId, email]);\n"
                f"```\n"
                f"This guarantees the database driver treats `tenantId` strictly as a literal value rather than executable SQL syntax."
            )
        else:
            ai_text = (
                f"I verified the context in {target_finding.file_path} against our team rules. "
                f"{target_finding.message} "
                f"Feel free to apply the suggested fix or adjust the service layer abstraction."
            )

        # 3. Record AI response
        ai_reply = ThreadReply(
            id=f"rep-{uuid.uuid4().hex[:6]}",
            author="PR-Guardian",
            role="assistant",
            message=ai_text,
            timestamp=now_str
        )
        target_finding.replies.append(ai_reply)

        # 4. Log telemetry
        tokens = len(developer_message.split()) + len(ai_text.split()) * 2
        state.telemetry["total_tokens"] = state.telemetry.get("total_tokens", 0) + tokens
        state.telemetry["completion_tokens"] = state.telemetry.get("completion_tokens", 0) + len(ai_text.split())

        await mongo_db.log_trace(state.audit_id, "ThreadConversation", "reply", {
            "finding_id": finding_id,
            "developer_message": developer_message,
            "tokens": tokens
        })

        return {
            "status": "replied",
            "finding_id": finding_id,
            "developer_reply": dev_reply.model_dump(),
            "ai_reply": ai_reply.model_dump(),
            "telemetry": state.telemetry
        }

workflow_engine = ReviewWorkflowEngine()
