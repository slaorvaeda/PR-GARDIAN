import crypto from 'crypto';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'dev_secret';

export function verifyWebhookSignature(payload, signature) {
  if (!signature || !GITHUB_WEBHOOK_SECRET) return true; // dev mode allow
  const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function postReviewToGitHub(owner, repo, pullNumber, reviewPayload) {
  if (!GITHUB_TOKEN) {
    console.log(`[GitHub Service] (Simulated) Posted review to ${owner}/${repo}#${pullNumber} with ${reviewPayload.comments.length} comments.`);
    return {
      id: Math.floor(Math.random() * 100000),
      html_url: `https://github.com/${owner}/${repo}/pull/${pullNumber}#pullrequestreview-simulated`,
      state: 'APPROVED',
      comments_count: reviewPayload.comments.length,
      simulated: true
    };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      commit_id: reviewPayload.commitId,
      body: reviewPayload.summary || 'PR-Guardian Automated Security & Architecture Audit Review',
      event: reviewPayload.event || 'COMMENT',
      comments: reviewPayload.comments.map(c => ({
        path: c.file_path,
        line: c.line_number,
        side: 'RIGHT',
        body: `### 🛡️ PR-Guardian [${c.category.toUpperCase()}]\n**${c.title}**\n\n${c.message}\n\n${c.suggested_fix ? `**Suggested Fix:**\n\`\`\`suggestion\n${c.suggested_fix}\n\`\`\`` : ''}`
      }))
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}
