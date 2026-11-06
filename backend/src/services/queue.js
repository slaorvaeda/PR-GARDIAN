import EventEmitter from 'events';

/**
 * Asynchronous Ingestion Job Queue Worker.
 * Decouples GitHub Webhook reception from long-running multi-agent execution,
 * ensuring immediate 202 responses (< 100ms) to avoid GitHub's 10-second timeout.
 */
class AuditJobQueue extends EventEmitter {
  constructor(concurrency = 3) {
    super();
    this.concurrency = concurrency;
    this.queue = [];
    this.activeJobs = new Map();
  }

  enqueue(jobData) {
    const jobId = `job-${jobData.auditId}`;
    
    // Check if an existing run is in progress for the same PR and supersede it
    for (const [activeId, activeJob] of this.activeJobs.entries()) {
      if (activeJob.prId === jobData.prId && activeJob.headSha !== jobData.headSha) {
        console.log(`[Queue] Superseding outdated commit ${activeJob.headSha} with ${jobData.headSha} for ${jobData.prId}`);
        this.emit('job:superseded', activeJob);
        this.activeJobs.delete(activeId);
      }
    }

    const job = {
      id: jobId,
      ...jobData,
      status: 'queued',
      enqueuedAt: Date.now()
    };

    this.queue.push(job);
    this.emit('job:enqueued', job);
    this._processNext();
    return job;
  }

  async _processNext() {
    if (this.activeJobs.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    job.status = 'running';
    job.startedAt = Date.now();
    this.activeJobs.set(job.id, job);

    this.emit('job:started', job);

    try {
      if (typeof job.handler === 'function') {
        await job.handler(job);
      }
      job.status = 'completed';
      job.finishedAt = Date.now();
      this.emit('job:completed', job);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      this.emit('job:failed', job, err);
    } finally {
      this.activeJobs.delete(job.id);
      this._processNext();
    }
  }

  getQueueStats() {
    return {
      waiting: this.queue.length,
      active: this.activeJobs.size,
      concurrency: this.concurrency
    };
  }
}

export const auditQueue = new AuditJobQueue(3);
