import { connectMongo, savePullRequest, getPullRequest, listPullRequests } from '../backend/src/db/mongo.js';
import { parseUnifiedDiff } from '../backend/src/services/diffParser.js';
import { auditQueue } from '../backend/src/services/queue.js';

async function testIntegration() {
  console.log('1. Testing MongoDB fallback store...');
  await connectMongo();

  console.log('2. Testing Diff Parser...');
  const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 123..456 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+const secret = "123456789";
+export function login() {}
`;
  const parsed = parseUnifiedDiff(sampleDiff);
  if (parsed.length !== 1 || parsed[0].filePath !== 'src/auth.ts') {
    throw new Error('Diff parser failed to parse file');
  }
  console.log('   Diff parser parsed 1 file correctly with', parsed[0].additions, 'additions.');

  console.log('3. Testing Pull Request storage & retrieval...');
  const prRecord = {
    id: 'test/repo#1',
    auditId: 'audit-test-123',
    repoId: 'test/repo',
    prNumber: 1,
    title: 'Test PR',
    author: 'tester',
    status: 'pending_approval',
    files: parsed,
    findings: [
      {
        id: 'sec-1',
        category: 'security',
        file_path: 'src/auth.ts',
        line_number: 1,
        title: 'Hardcoded secret',
        message: 'Secret in code',
        confidence_score: 0.98,
        replies: []
      }
    ],
    generatedTests: [],
    telemetry: { total_tokens: 1500 }
  };

  await savePullRequest(prRecord);
  const fetched = await getPullRequest('test/repo#1');
  if (!fetched || fetched.title !== 'Test PR') {
    throw new Error('PR save or fetch failed');
  }
  console.log('   PR saved and retrieved successfully.');

  console.log('4. Testing Job Queue...');
  let jobRan = false;
  auditQueue.enqueue({
    prId: 'test/repo#1',
    auditId: 'audit-test-123',
    headSha: 'sha1',
    handler: async () => {
      jobRan = true;
    }
  });

  // Wait for queue loop
  await new Promise(r => setTimeout(r, 100));
  if (!jobRan) {
    throw new Error('Queue job did not execute');
  }
  console.log('   Job Queue enqueued and executed handler successfully.');

  console.log('\n✅ All Node.js backend integration checks PASSED successfully!');
  process.exit(0);
}

testIntegration().catch(err => {
  console.error('❌ Integration check failed:', err);
  process.exit(1);
});
