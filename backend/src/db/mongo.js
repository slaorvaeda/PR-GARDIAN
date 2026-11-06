import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pr_guardian';

let client = null;
let db = null;
let isConnected = false;

// In-memory collections for resilient local fallback
export const memoryStore = {
  webhooks: [],
  prs: new Map(),
  traces: []
};

export async function connectMongo() {
  try {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db();
    isConnected = true;
    console.log('✅ Connected to MongoDB successfully.');
  } catch (err) {
    isConnected = false;
    console.warn(`⚠️ Could not connect to MongoDB (${err.message}). Using local in-memory store.`);
  }
}

export async function saveWebhookPayload(event, payload) {
  const doc = {
    event,
    payload,
    receivedAt: new Date().toISOString()
  };
  if (isConnected && db) {
    try {
      const res = await db.collection('raw_webhooks').insertOne(doc);
      return res.insertedId.toString();
    } catch (err) {
      console.error('Mongo saveWebhook error:', err);
    }
  }
  memoryStore.webhooks.push(doc);
  return `mem-hook-${memoryStore.webhooks.length}`;
}

export async function savePullRequest(prData) {
  prData.updatedAt = new Date().toISOString();
  if (isConnected && db) {
    try {
      await db.collection('pull_requests').updateOne(
        { id: prData.id },
        { $set: prData },
        { upsert: true }
      );
      return prData;
    } catch (err) {
      console.error('Mongo savePullRequest error:', err);
    }
  }
  memoryStore.prs.set(prData.id, prData);
  return prData;
}

export async function getPullRequest(id) {
  if (isConnected && db) {
    try {
      const pr = await db.collection('pull_requests').findOne({ id });
      if (pr) return pr;
    } catch (err) {
      console.error('Mongo getPullRequest error:', err);
    }
  }
  return memoryStore.prs.get(id) || null;
}

export async function listPullRequests() {
  if (isConnected && db) {
    try {
      return await db.collection('pull_requests').find().sort({ updatedAt: -1 }).toArray();
    } catch (err) {
      console.error('Mongo listPullRequests error:', err);
    }
  }
  return Array.from(memoryStore.prs.values());
}
