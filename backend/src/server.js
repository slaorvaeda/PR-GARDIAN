import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongo, saveWebhookPayload, savePullRequest, getPullRequest, listPullRequests } from './db/mongo.js';
import { parseUnifiedDiff } from './services/diffParser.js';
import { verifyWebhookSignature, postReviewToGitHub } from './services/github.js';
import { auditQueue } from './services/queue.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Connect to MongoDB
connectMongo();

// Active SSE client connections
const sseClients = new Map();

export function broadcastSSE(auditId, eventData) {
  const clients = sseClients.get(auditId);
  if (clients) {
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }
}

// In-memory Engineering Guidelines store (mirrors Postgres)
const engineeringGuidelines = [
  {
    id: 'rule-1',
    category: 'architecture',
    rule_title: 'Layered Domain Boundary',
    rule_description: 'Controllers and Route Handlers must never directly invoke raw database queries; all data access must go through service or repository layers.',
    severity: 'critical'
  },
  {
    id: 'rule-2',
    category: 'security',
    rule_title: 'SQL & Query Injection Guard',
    rule_description: 'All dynamic queries must use parameterized placeholders ($1, ?, ORM binding); string interpolation in database calls is strictly prohibited.',
    severity: 'critical'
  },
  {
    id: 'rule-3',
    category: 'security',
    rule_title: 'Never Expose Raw SQL Errors',
    rule_description: 'Database error messages and internal stack traces must never be leaked directly in HTTP API responses. Wrap in domain exceptions.',
    severity: 'critical'
  },
  {
    id: 'rule-4',
    category: 'security',
    rule_title: 'All Endpoints Must Use Auth Middleware',
    rule_description: 'All mutating API endpoints (/POST, /PUT, /DELETE) must require authenticated session or JWT middleware before execution.',
    severity: 'critical'
  },
  {
    id: 'rule-5',
    category: 'testing',
    rule_title: 'Business Logic Coverage',
    rule_description: 'Any modification or addition of critical business logic, state mutations, or branching calculations requires corresponding unit test coverage.',
    severity: 'warning'
  }
];

// Current session user (OAuth)
let currentSessionUser = {
  login: 'priyanshunayak',
  name: 'Priyanshu Nayak',
  avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  role: 'Staff Reviewer',
  authenticated: true
};

/**
 * Health check & Queue telemetry
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pr-guardian-backend',
    version: '2.0.0',
    aiEngineUrl: AI_ENGINE_URL,
    queueStats: auditQueue.getQueueStats()
  });
});

/**
 * GitHub OAuth Routes
 */
app.get('/api/auth/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    // Development fallback: Auto-authenticate session
    return res.json({
      authUrl: null,
      user: currentSessionUser,
      message: 'Running in local dev authenticated mode'
    });
  }
  const redirectUri = `http://localhost:${PORT}/api/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,read:org,user`;
  res.json({ authUrl: githubAuthUrl });
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || !GITHUB_CLIENT_ID) {
    return res.redirect('http://localhost:3000?auth=success');
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });
    const ghUser = await userRes.json();

    currentSessionUser = {
      login: ghUser.login,
      name: ghUser.name || ghUser.login,
      avatar_url: ghUser.avatar_url,
      role: 'Staff Reviewer',
      accessToken,
      authenticated: true
    };

    res.redirect('http://localhost:3000?auth=success');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('http://localhost:3000?auth=error');
  }
});

app.get('/api/auth/user', (req, res) => {
  res.json(currentSessionUser);
});

/**
 * Engineering Guidelines Endpoints
 */
app.get('/api/guidelines', (req, res) => {
  res.json(engineeringGuidelines);
});

app.post('/api/guidelines', (req, res) => {
  const { rule_title, rule_description, category, severity } = req.body;
  const newRule = {
    id: `rule-${engineeringGuidelines.length + 1}`,
    category: category || 'architecture',
    rule_title,
    rule_description,
    severity: severity || 'critical'
  };
  engineeringGuidelines.push(newRule);
  res.status(201).json(newRule);
});

/**
 * List all PRs
 */
app.get('/api/prs', async (req, res) => {
  try {
    const prs = await listPullRequests();
    res.json(prs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get PR details by ID
 */
app.get('/api/prs/:id', async (req, res) => {
  try {
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    res.json(pr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Real-Time SSE Endpoint for Frontend
 */
app.get('/api/events/:auditId', (req, res) => {
  const auditId = req.params.auditId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(auditId)) {
    sseClients.set(auditId, new Set());
  }
  sseClients.get(auditId).add(res);

  res.write(`data: ${JSON.stringify({ step: 'connected', message: `Connected to live trace for ${auditId}` })}\n\n`);

  req.on('close', () => {
    const clients = sseClients.get(auditId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(auditId);
    }
  });
});

/**
 * GitHub Webhook Receiver (Non-blocking with Job Queue)
 */
app.post('/api/webhooks/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'] || 'pull_request';
    const payload = req.body;

    // Immediately log raw payload to MongoDB
    await saveWebhookPayload(event, payload);

    if (event === 'pull_request' && ['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      const pr = payload.pull_request;
      const repo = payload.repository;
      const prId = `${repo.full_name}#${pr.number}`;
      const auditId = `audit-${pr.head.sha.slice(0, 8)}-${Date.now()}`;
      const diffContent = payload.diff || '';
      const parsedFiles = parseUnifiedDiff(diffContent);

      const prRecord = {
        id: prId,
        auditId,
        repoId: repo.full_name,
        prNumber: pr.number,
        title: pr.title,
        author: pr.user.login,
        headSha: pr.head.sha,
        status: 'queued',
        files: parsedFiles,
        findings: [],
        generatedTests: [],
        telemetry: {},
        diffSummary: {
          filesCount: parsedFiles.length,
          additions: parsedFiles.reduce((a, b) => a + b.additions, 0),
          deletions: parsedFiles.reduce((a, b) => a + b.deletions, 0)
        }
      };

      await savePullRequest(prRecord);

      // Enqueue in Job Queue
      auditQueue.enqueue({
        prId,
        auditId,
        headSha: pr.head.sha,
        handler: async () => {
          prRecord.status = 'running';
          await savePullRequest(prRecord);
          await triggerAIEngineAudit(prRecord, diffContent);
        }
      });

      // Immediate 202 response to GitHub
      return res.status(202).json({
        message: 'Webhook accepted and queued for multi-agent audit',
        auditId,
        prId,
        queueStatus: auditQueue.getQueueStats()
      });
    }

    res.json({ message: 'Webhook received' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Dispatch to Python AI Engine and stream events back to SSE
 */
async function triggerAIEngineAudit(prRecord, diffContent) {
  const auditId = prRecord.auditId;
  try {
    const runRes = await fetch(`${AI_ENGINE_URL}/audit/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audit_id: auditId,
        repo_id: prRecord.repoId,
        pr_number: prRecord.prNumber,
        title: prRecord.title,
        diff_content: diffContent,
        files_changed: prRecord.files.map(f => ({
          file_path: f.filePath,
          diff: f.diff
        }))
      })
    });

    if (!runRes.ok) throw new Error(`AI Engine rejected audit: ${await runRes.text()}`);

    const streamRes = await fetch(`${AI_ENGINE_URL}/audit/stream/${auditId}`);
    if (streamRes.body) {
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.replace('data: ', ''));
              broadcastSSE(auditId, eventData);

              if (eventData.telemetry) {
                prRecord.telemetry = eventData.telemetry;
              }

              if (eventData.step === 'awaiting_approval' && eventData.data) {
                prRecord.status = 'pending_approval';
                prRecord.findings = eventData.data.findings || [];
                prRecord.generatedTests = eventData.data.generated_tests || [];
                await savePullRequest(prRecord);
              }
            } catch (e) {}
          }
        }
      }
    }
  } catch (err) {
    console.error(`AI Engine error for ${auditId}:`, err);
    broadcastSSE(auditId, { step: 'error', message: `AI Engine connection failed: ${err.message}` });
  }
}

/**
 * Two-Way Thread Conversation: Reply to finding
 */
app.post('/api/prs/:id/reply', async (req, res) => {
  try {
    const { findingId, message, author } = req.body;
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    const replyRes = await fetch(`${AI_ENGINE_URL}/audit/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audit_id: pr.auditId,
        finding_id: findingId,
        message,
        author: author || currentSessionUser.login
      })
    });

    if (!replyRes.ok) {
      const errText = await replyRes.text();
      throw new Error(`AI Engine reply failed: ${errText}`);
    }

    const replyData = await replyRes.json();

    const finding = pr.findings.find(f => f.id === findingId);
    if (finding) {
      if (!finding.replies) finding.replies = [];
      finding.replies.push(replyData.developer_reply);
      finding.replies.push(replyData.ai_reply);
      if (replyData.telemetry) pr.telemetry = replyData.telemetry;
      await savePullRequest(pr);
    }

    broadcastSSE(pr.auditId, {
      step: 'thread_reply',
      message: `Reply received on ${findingId}`,
      data: replyData
    });

    res.json(replyData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Human Approval: Approve & Dispatch to GitHub
 */
app.post('/api/prs/:id/approve', async (req, res) => {
  try {
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    await fetch(`${AI_ENGINE_URL}/audit/resume/${pr.auditId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' })
    });

    const [owner, repo] = pr.repoId.split('/');
    const approvedComments = pr.findings.filter(f => !f.dismissed);
    const ghRes = await postReviewToGitHub(owner, repo, pr.prNumber, {
      commitId: pr.headSha,
      comments: approvedComments,
      summary: `PR-Guardian Human-Approved Audit: ${approvedComments.length} finding(s) verified.`
    });

    pr.status = 'approved';
    pr.githubReview = ghRes;
    await savePullRequest(pr);

    broadcastSSE(pr.auditId, {
      step: 'completed',
      message: `PR Approved! ${approvedComments.length} verified review comments dispatched to GitHub.`
    });

    res.json({ message: 'PR review approved and posted', pr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Human Approval: Reject PR
 */
app.post('/api/prs/:id/reject', async (req, res) => {
  try {
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    await fetch(`${AI_ENGINE_URL}/audit/resume/${pr.auditId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' })
    });

    pr.status = 'rejected';
    await savePullRequest(pr);

    broadcastSSE(pr.auditId, {
      step: 'completed',
      message: 'PR Review rejected by human reviewer. No comments posted.'
    });

    res.json({ message: 'PR review rejected', pr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Edit comment
 */
app.post('/api/prs/:id/edit-comment', async (req, res) => {
  try {
    const { findingId, editedMessage } = req.body;
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    const finding = pr.findings.find(f => f.id === findingId);
    if (finding) {
      finding.message = editedMessage;
      await savePullRequest(pr);

      await fetch(`${AI_ENGINE_URL}/audit/resume/${pr.auditId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit_comment', finding_id: findingId, edited_message: editedMessage })
      });
    }

    res.json({ message: 'Comment updated', pr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Dismiss comment
 */
app.post('/api/prs/:id/dismiss-comment', async (req, res) => {
  try {
    const { findingId } = req.body;
    const pr = await getPullRequest(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    const finding = pr.findings.find(f => f.id === findingId);
    if (finding) {
      finding.dismissed = true;
      await savePullRequest(pr);

      await fetch(`${AI_ENGINE_URL}/audit/resume/${pr.auditId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_comment', finding_id: findingId })
      });
    }

    res.json({ message: 'Comment dismissed', pr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Seed Demo PR v2
 */
app.post('/api/seed-demo', async (req, res) => {
  try {
    const prNumber = Math.floor(Math.random() * 800) + 100;
    const sha = Math.random().toString(36).substring(2, 10);
    const auditId = `audit-${sha}-${Date.now()}`;
    const prId = `acme-corp/payment-gateway#${prNumber}`;

    const demoDiff = `diff --git a/src/controllers/authController.ts b/src/controllers/authController.ts
index 14a8b21..93fbc01 100644
--- a/src/controllers/authController.ts
+++ b/src/controllers/authController.ts
@@ -10,6 +10,14 @@ export class AuthController {
   constructor(private authService: AuthService) {}
 
+  // NEW: Quick user lookup by tenant
+  async getUserByTenant(req: Request, res: Response) {
+    const { tenantId, email } = req.query;
+    // Direct database query in controller violating layered architecture + SQL injection
+    const user = await db.query(\`SELECT * FROM users WHERE tenant = '\${tenantId}' AND email = '\${email}'\`);
+    return res.json({ user });
+  }
+
   async login(req: Request, res: Response) {
     const { email, password } = req.body;
diff --git a/src/config/jwt.ts b/src/config/jwt.ts
index 8b31a10..e7c4f09 100644
--- a/src/config/jwt.ts
+++ b/src/config/jwt.ts
@@ -1,4 +1,5 @@
 export const jwtConfig = {
+  jwt_secret: "super_secret_jwt_production_key_998811",
   expiresIn: "24h"
 };
diff --git a/src/services/billingService.ts b/src/services/billingService.ts
index 510ad6e..cf92c10 100644
--- a/src/services/billingService.ts
+++ b/src/services/billingService.ts
@@ -25,4 +25,18 @@ export class BillingService {
   }
+
+  // Complex tiered volume discount logic (no unit tests included)
+  calculateTieredDiscount(totalAmount: number, userTier: string): number {
+    if (totalAmount <= 0) return 0;
+    let discountRate = 0.05;
+    if (userTier === 'enterprise') {
+      discountRate = totalAmount > 10000 ? 0.25 : 0.15;
+    } else if (userTier === 'growth') {
+      discountRate = totalAmount > 5000 ? 0.12 : 0.08;
+    }
+    return totalAmount * (1 - discountRate);
+  }
 }
`;

    const parsedFiles = parseUnifiedDiff(demoDiff);

    const prRecord = {
      id: prId,
      auditId,
      repoId: 'acme-corp/payment-gateway',
      prNumber,
      title: 'feat: add tenant user lookup and tiered billing discounts',
      author: 'dev-alex',
      headSha: sha,
      status: 'pending_approval',
      files: parsedFiles,
      findings: [],
      generatedTests: [],
      telemetry: {
        total_tokens: 0,
        nodes: {}
      },
      diffSummary: {
        filesCount: parsedFiles.length,
        additions: parsedFiles.reduce((a, b) => a + b.additions, 0),
        deletions: parsedFiles.reduce((a, b) => a + b.deletions, 0)
      }
    };

    await savePullRequest(prRecord);

    auditQueue.enqueue({
      prId,
      auditId,
      headSha: sha,
      handler: async () => {
        await triggerAIEngineAudit(prRecord, demoDiff);
      }
    });

    res.status(201).json({
      message: 'Demo PR seeded and audit enqueued',
      pr: prRecord,
      queueStatus: auditQueue.getQueueStats()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PR-Guardian Backend v2 running on http://localhost:${PORT}`);
});
