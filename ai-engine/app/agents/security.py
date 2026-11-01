import re
import uuid
from typing import List, Dict, Any
from app.agents.state import ReviewFinding
from app.config import settings

class SecurityAgent:
    """
    Security Specialist Agent.
    Audits incoming pull request diffs and AST chunks for vulnerabilities,
    credentials, injection attacks, and insecure configurations.
    """

    async def analyze(self, files: List[Dict[str, Any]], context: Dict[str, Any]) -> List[ReviewFinding]:
        findings: List[ReviewFinding] = []

        for file_info in files:
            file_path = file_info.get("file_path", "")
            diff_hunks = file_info.get("diff", "")
            lines = diff_hunks.splitlines()

            line_no = 0
            for raw_line in lines:
                if raw_line.startswith("@@"):
                    # Parse hunk header: @@ -10,4 +12,6 @@
                    m = re.search(r'\+(\d+)', raw_line)
                    if m:
                        line_no = int(m.group(1)) - 1
                    continue

                if raw_line.startswith("+") and not raw_line.startswith("+++"):
                    line_no += 1
                    line_content = raw_line[1:].strip()

                    # 1. SQL Injection / Query String Interpolation Detection
                    if re.search(r'(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*\$\{[^}]+\}', line_content, re.IGNORECASE) or \
                       re.search(r'(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*(\+|\%)\s*[a-zA-Z0-9_]+', line_content, re.IGNORECASE):
                        findings.append(ReviewFinding(
                            id=f"sec-{uuid.uuid4().hex[:8]}",
                            category="security",
                            severity="critical",
                            file_path=file_path,
                            line_number=line_no,
                            title="Potential SQL Injection Detected",
                            message="Direct variable interpolation detected inside a raw database query. Untrusted user input could lead to arbitrary SQL execution.",
                            suggested_fix="Use parameterized query placeholders ($1, ?, or ORM binding) instead of raw template string interpolation.",
                            confidence_score=0.96,
                            rule_id="rule-2"
                        ))

                    # 2. Hardcoded Credentials / Secrets Detection
                    if re.search(r'(api_key|apikey|secret|token|password|jwt_secret)\s*[:=]\s*["\'][A-Za-z0-9_\-\.]{8,}["\']', line_content, re.IGNORECASE):
                        if not re.search(r'(process\.env|os\.environ|settings\.)', line_content):
                            findings.append(ReviewFinding(
                                id=f"sec-{uuid.uuid4().hex[:8]}",
                                category="security",
                                severity="critical",
                                file_path=file_path,
                                line_number=line_no,
                                title="Hardcoded Secret / API Token Exposure",
                                message="Potential hardcoded credential or secret key detected in source code. Secrets committed to git history pose an immediate security risk.",
                                suggested_fix="Move this secret into environment variables or a secrets manager (e.g., AWS Secrets Manager, Vault, or .env).",
                                confidence_score=0.98,
                                rule_id="rule-3"
                            ))

                    # 3. Unsafe Deserialization / eval
                    if re.search(r'\beval\(', line_content) or re.search(r'pickle\.loads\(', line_content):
                        findings.append(ReviewFinding(
                            id=f"sec-{uuid.uuid4().hex[:8]}",
                            category="security",
                            severity="critical",
                            file_path=file_path,
                            line_number=line_no,
                            title="Unsafe Dynamic Code Execution (eval/pickle)",
                            message="Executing dynamic code or deserializing untrusted binary payloads allows remote code execution (RCE).",
                            suggested_fix="Use safe JSON parsers (e.g. JSON.parse / json.loads) with strict schema validation.",
                            confidence_score=0.95
                        ))

                    # 4. Insecure Cookie / Session settings
                    if re.search(r'cookie\s*\(.*httpOnly\s*:\s*false', line_content, re.IGNORECASE):
                        findings.append(ReviewFinding(
                            id=f"sec-{uuid.uuid4().hex[:8]}",
                            category="security",
                            severity="warning",
                            file_path=file_path,
                            line_number=line_no,
                            title="Insecure Cookie: httpOnly Disabled",
                            message="Cookies storing session or authentication state without httpOnly: true can be read by malicious client-side scripts (XSS).",
                            suggested_fix="Enable { httpOnly: true, secure: true, sameSite: 'strict' }.",
                            confidence_score=0.92
                        ))

                elif not raw_line.startswith("-"):
                    line_no += 1

        return findings

security_agent = SecurityAgent()
