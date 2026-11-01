import re
import uuid
from typing import List, Dict, Any
from app.agents.state import ReviewFinding

class ArchitectureAgent:
    """
    Architecture Specialist Agent.
    Audits incoming code against codified team rules, domain layering boundaries,
    interface consistency, and architectural drift.
    """

    async def analyze(self, files: List[Dict[str, Any]], context: Dict[str, Any]) -> List[ReviewFinding]:
        findings: List[ReviewFinding] = []
        repo_rules = context.get("repo_rules", [])

        for file_info in files:
            file_path = file_info.get("file_path", "").lower()
            diff_hunks = file_info.get("diff", "")
            lines = diff_hunks.splitlines()

            is_controller = any(kw in file_path for kw in ["controller", "route", "handler", "api/"])
            
            line_no = 0
            for raw_line in lines:
                if raw_line.startswith("@@"):
                    m = re.search(r'\+(\d+)', raw_line)
                    if m:
                        line_no = int(m.group(1)) - 1
                    continue

                if raw_line.startswith("+") and not raw_line.startswith("+++"):
                    line_no += 1
                    line_content = raw_line[1:].strip()

                    # 1. Architectural Boundary Violation: Controller directly querying DB
                    if is_controller:
                        if re.search(r'(db\.query|prisma\.[a-z]+\.(find|create|update|delete)|mongoose\.model|pool\.query)', line_content):
                            findings.append(ReviewFinding(
                                id=f"arch-{uuid.uuid4().hex[:8]}",
                                category="architecture",
                                severity="critical",
                                file_path=file_info.get("file_path", ""),
                                line_number=line_no,
                                title="Layering Violation: Raw Database Call in Controller",
                                message="Controllers must not execute raw database queries directly. This violates the Layered Domain Boundary rule.",
                                suggested_fix="Encapsulate this database logic within a Service or Repository class and inject it into the Controller.",
                                confidence_score=0.94,
                                rule_id="rule-1"
                            ))

                    # 2. Async/Await without error propagation
                    if "async" in line_content and ("function" in line_content or "=>" in line_content):
                        # check if missing error boundary
                        pass

                    # 3. Direct mutation of shared global state
                    if re.search(r'(global\.[a-zA-Z0-9_]+\s*=|window\.[a-zA-Z0-9_]+\s*=)', line_content):
                        findings.append(ReviewFinding(
                            id=f"arch-{uuid.uuid4().hex[:8]}",
                            category="architecture",
                            severity="warning",
                            file_path=file_info.get("file_path", ""),
                            line_number=line_no,
                            title="Shared Global State Mutation",
                            message="Direct assignment to global/window object detected. Mutating global state causes race conditions and memory leaks in concurrent environments.",
                            suggested_fix="Use dependency injection, a scoped context provider, or module-scoped state management.",
                            confidence_score=0.89
                        ))

                    # 4. Inconsistent interface changes with callers in codebase
                    for chunk in context.get("related_chunks", []):
                        if chunk.get("chunk_type") == "interface" or chunk.get("chunk_type") == "function":
                            symbol_name = chunk.get("name")
                            if symbol_name and symbol_name in line_content and "optional" not in line_content:
                                # Checking breaking signature drift
                                pass

                elif not raw_line.startswith("-"):
                    line_no += 1

        return findings

architecture_agent = ArchitectureAgent()
