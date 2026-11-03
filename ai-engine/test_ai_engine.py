import asyncio
from app.agents.state import PRReviewState
from app.graph.workflow import workflow_engine

async def main():
    sample_diff = """diff --git a/src/controllers/authController.ts b/src/controllers/authController.ts
index 14a8b21..93fbc01 100644
--- a/src/controllers/authController.ts
+++ b/src/controllers/authController.ts
@@ -10,6 +10,14 @@ export class AuthController {
   constructor(private authService: AuthService) {}
 
+  async getUserByTenant(req: Request, res: Response) {
+    const { tenantId, email } = req.query;
+    const user = await db.query(`SELECT * FROM users WHERE tenant = '${tenantId}' AND email = '${email}'`);
+    return res.json({ user });
+  }
+
   async login(req: Request, res: Response) {
"""

    state = PRReviewState(
        audit_id="test-audit-v2",
        repo_id="acme/test-repo",
        pr_number=99,
        title="Test PR v2 Conversational & Telemetry",
        diff_content=sample_diff,
        files_changed=[{
            "file_path": "src/controllers/authController.ts",
            "diff": sample_diff
        }]
    )

    print("1. Preparing AST & context...")
    ctx = await workflow_engine._node_prepare_context(state)
    state.ast_chunks = ctx["ast_chunks"]
    state.retrieved_context = ctx["retrieved_context"]

    print("2. Running Specialist Agents in parallel...")
    sec, arch, test = await asyncio.gather(
        workflow_engine._node_security(state),
        workflow_engine._node_architecture(state),
        workflow_engine._node_testing(state)
    )
    state.security_findings = sec["security_findings"]
    state.architecture_findings = arch["architecture_findings"]
    state.test_findings = test["test_findings"]

    print("3. Running Critic Filter Node...")
    critic = await workflow_engine._node_critic(state)
    state.critic_findings = critic["critic_findings"]
    state.dropped_findings_count = critic["dropped_findings_count"]

    print(f"   Critic approved: {len(state.critic_findings)} findings.")
    first_finding = state.critic_findings[0]
    print(f"   Target finding: [{first_finding.category.upper()}] {first_finding.title}")

    print("4. Testing Conversational Thread Resumption (@PR-Guardian explain why this is risky)...")
    reply_res = await workflow_engine.handle_thread_reply(
        state=state,
        finding_id=first_finding.id,
        developer_message="@PR-Guardian explain why this is risky and how to parameterize it."
    )

    print(f"   Developer asked: {reply_res['developer_reply']['message']}")
    print(f"   AI responded: {reply_res['ai_reply']['message'][:120]}...")
    print(f"   Total telemetry tokens: {state.telemetry['total_tokens']}")

    assert len(first_finding.replies) == 2, "Expected 2 replies in thread (user question + AI answer)"
    print("\n✅ v2 Conversational Thread & Telemetry validation passed!")

if __name__ == "__main__":
    asyncio.run(main())
