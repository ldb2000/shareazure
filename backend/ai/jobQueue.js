const { settingsDb } = require('../database');

let PQueue;
let queue;
const jobStatus = new Map();

async function getQueue() {
  if (!queue) {
    if (!PQueue) {
      PQueue = (await import('p-queue')).default;
    }
    const concurrency = parseInt(settingsDb.get('maxConcurrentAnalysis')) || 3;
    queue = new PQueue({ concurrency });
  }
  return queue;
}

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function addJob(fn, metadata = {}) {
  const jobId = generateJobId();
  const q = await getQueue();

  jobStatus.set(jobId, {
    id: jobId,
    status: 'queued',
    metadata,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null
  });

  q.add(async () => {
    const job = jobStatus.get(jobId);
    job.status = 'processing';
    job.startedAt = new Date().toISOString();

    try {
      const result = await fn();
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date().toISOString();
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date().toISOString();
    }
  });

  return jobId;
}

function getJobStatus(jobId) {
  return jobStatus.get(jobId) || null;
}

function getMetrics() {
  let queued = 0, processing = 0, completed = 0, failed = 0;
  for (const job of jobStatus.values()) {
    if (job.status === 'queued') queued++;
    else if (job.status === 'processing') processing++;
    else if (job.status === 'completed') completed++;
    else if (job.status === 'failed') failed++;
  }
  return { queued, processing, completed, failed, total: jobStatus.size };
}

function cleanup(maxAge = 3600000) {
  const now = Date.now();
  for (const [id, job] of jobStatus.entries()) {
    if (job.completedAt && (now - new Date(job.completedAt).getTime()) > maxAge) {
      jobStatus.delete(id);
    }
  }
}

// Cleanup old jobs every 10 minutes
const cleanupInterval = setInterval(() => cleanup(), 600000);
if (cleanupInterval.unref) cleanupInterval.unref();

module.exports = {
  addJob,
  getJobStatus,
  getMetrics,
  cleanup
};
