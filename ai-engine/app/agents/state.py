from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ThreadReply(BaseModel):
    id: str
    author: str # 'developer' | 'PR-Guardian'
    role: str # 'user' | 'assistant'
    message: str
    timestamp: str

class ReviewFinding(BaseModel):
    id: str
    thread_id: Optional[str] = None
    category: str # 'security' | 'architecture' | 'testing'
    severity: str # 'critical' | 'warning' | 'info'
    file_path: str
    line_number: int # 1-based target line in new file
    title: str
    message: str
    suggested_fix: Optional[str] = None
    confidence_score: float = Field(default=0.9, ge=0.0, le=1.0)
    rule_id: Optional[str] = None
    is_approved: bool = True
    dismissed: bool = False
    replies: List[ThreadReply] = []

class SynthesizedTest(BaseModel):
    id: str
    file_path: str
    test_framework: str # 'vitest' | 'jest' | 'pytest'
    test_code: str
    target_function: str
    description: str

class ExecutionNodeTelemetry(BaseModel):
    node_name: str
    status: str # 'pending' | 'running' | 'completed' | 'failed'
    duration_ms: int = 0
    tokens_consumed: int = 0
    message: str = ""

class PRReviewState(BaseModel):
    audit_id: str
    repo_id: str
    pr_number: int
    title: str
    diff_content: str
    files_changed: List[Dict[str, Any]] = []
    
    # Context
    ast_chunks: List[Dict[str, Any]] = []
    retrieved_context: Dict[str, Any] = {}

    # Parallel Specialist Findings
    security_findings: List[ReviewFinding] = []
    architecture_findings: List[ReviewFinding] = []
    test_findings: List[ReviewFinding] = []
    generated_tests: List[SynthesizedTest] = []

    # Critic Filtered Output
    critic_findings: List[ReviewFinding] = []
    dropped_findings_count: int = 0

    # Human-in-the-Loop Interrupt State
    status: str = "running" # 'running' | 'pending_approval' | 'approved' | 'rejected' | 'completed'
    human_decision: Optional[Dict[str, Any]] = None
    approved_comments: List[ReviewFinding] = []

    # Real-time event log for SSE
    execution_logs: List[Dict[str, Any]] = []

    # Granular DAG and Token Telemetry
    telemetry: Dict[str, Any] = {
        "total_tokens": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_duration_ms": 0,
        "nodes": {}
    }
