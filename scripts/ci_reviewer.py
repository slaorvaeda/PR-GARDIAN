import sys
import os
import json
import asyncio

# Ensure ai-engine is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ai-engine")))

from app.parser.ast_chunker import ast_chunker
from app.agents.security import security_agent
from app.agents.architecture import architecture_agent
from app.agents.test_generator import test_generator_agent
from app.agents.critic import critic_node

async def run_ci_review(diff_file_path: str):
    if not os.path.exists(diff_file_path):
        print(f"Error: diff file not found at {diff_file_path}", file=sys.stderr)
        sys.exit(1)

    with open(diff_file_path, "r", encoding="utf-8") as f:
        raw_diff = f.read()

    if not raw_diff.strip():
        print("Empty diff, no changes to audit.")
        with open("review_summary.md", "w") as out:
            out.write("### 🛡️ PR-Guardian: No source changes detected in this PR.\n")
        return

    # Deconstruct diff by files
    files = []
    current_file = None
    current_lines = []

    for line in raw_diff.splitlines():
        if line.startswith("diff --git "):
            if current_file:
                files.append({"file_path": current_file, "diff": "\n".join(current_lines)})
            parts = line.split()
            current_file = parts[-1].replace("b/", "")
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_file:
        files.append({"file_path": current_file, "diff": "\n".join(current_lines)})

    print(f"Auditing {len(files)} modified files...")

    # AST chunks
    ast_chunks = []
    for f in files:
        chunks = ast_chunker.chunk_file(f["file_path"], f["diff"], "repo")
        ast_chunks.extend(chunks)

    context = {"repo_rules": [
        {"id": "rule-1", "title": "Layered Domain Boundary"},
        {"id": "rule-2", "title": "SQL & Query Injection Guard"},
        {"id": "rule-3", "title": "Never Expose Raw SQL Errors"},
        {"id": "rule-4", "title": "All Endpoints Must Use Auth Middleware"}
    ]}

    # Run specialist agents in parallel
    sec_findings, arch_findings, (test_findings, tests) = await asyncio.gather(
        security_agent.analyze(files, context),
        architecture_agent.analyze(files, context),
        test_generator_agent.analyze(files, context)
    )

    all_raw = sec_findings + arch_findings + test_findings
    vetted, dropped = critic_node.filter_findings(all_raw, files)

    # Format Markdown Report
    lines = [
        "## 🛡️ PR-Guardian Autonomous Audit Report",
        "",
        f"**Status:** {'⚠️ Action Required' if vetted else '✅ All Checks Passed'}",
        f"- **AST Units Indexed:** {len(ast_chunks)}",
        f"- **Vetted Findings:** {len(vetted)}",
        f"- **Critic False Positives Dropped:** {dropped}",
        f"- **Synthesized Unit Test Suites:** {len(tests)}",
        "",
        "---"
    ]

    if vetted:
        lines.append("### 🔍 Verified Findings")
        for f in vetted:
            badge = "🔴 Security" if f.category == "security" else ("🟣 Architecture" if f.category == "architecture" else "🔵 Testing")
            lines.append(f"#### {badge}: {f.title} (`{f.file_path}:L{f.line_number}`)")
            lines.append(f"- **Confidence:** {int(f.confidence_score * 100)}%")
            lines.append(f"- **Details:** {f.message}")
            if f.suggested_fix:
                lines.append(f"```suggestion\n{f.suggested_fix}\n```")
            lines.append("")
    else:
        lines.append("### ✅ No security, architectural, or test coverage risks detected!")

    if tests:
        lines.append("---")
        lines.append("### 🧪 Auto-Synthesized Unit Test Suite")
        for t in tests:
            lines.append(f"**Target:** `{t.target_function}()` in `{t.file_path}` ({t.test_framework})")
            lines.append(f"```{t.test_framework}\n{t.test_code}\n```")

    lines.append("")
    lines.append("> *Audit performed by [PR-Guardian](https://github.com/langchain-ai/langgraph) with AST-aware chunking and pgvector.*")

    with open("review_summary.md", "w", encoding="utf-8") as out:
        out.write("\n".join(lines))

    print(f"Generated review summary with {len(vetted)} findings.")

if __name__ == "__main__":
    diff_path = sys.argv[1] if len(sys.argv) > 1 else "pr.diff"
    asyncio.run(run_ci_review(diff_path))
