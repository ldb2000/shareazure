const fs = require('fs');
const { settingsDb, aiCostTrackingDb, transcriptionsDb } = require('../database');

let OpenAI;
let client;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    OpenAI = require('openai');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

function getWhisperModel() {
  return process.env.OPENAI_WHISPER_MODEL || settingsDb.get('whisperModel') || 'whisper-1';
}

function trackCost(duration, model, blobName) {
  // Whisper pricing: $0.006 per minute
  const costPerMinute = 0.006;
  const cost = (duration / 60) * costPerMinute;

  try {
    aiCostTrackingDb.log({
      service: 'whisper',
      model,
      operation: 'transcribe',
      inputTokens: 0,
      outputTokens: 0,
      cost,
      blobName
    });
  } catch (e) {
    console.error('Error tracking Whisper cost:', e.message);
  }

  return cost;
}

async function transcribe(audioPath, blobName, options = {}) {
  const openai = getClient();
  const model = getWhisperModel();
  const language = options.language || settingsDb.get('whisperLanguage') || 'fr';

  // Create or update transcription record
  let existing = transcriptionsDb.getByBlobName(blobName);
  if (!existing) {
    transcriptionsDb.create({ blobName, language, model });
  }
  transcriptionsDb.update(blobName, { status: 'processing' });

  try {
    const fileStream = fs.createReadStream(audioPath);

    const response = await openai.audio.transcriptions.create({
      model,
      file: fileStream,
      language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });

    const segments = (response.segments || []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text
    }));

    const duration = response.duration || 0;
    trackCost(duration, model, blobName);

    transcriptionsDb.update(blobName, {
      text: response.text,
      segments: segments,
      duration,
      language: response.language || language,
      model,
      status: 'completed'
    });

    return {
      text: response.text,
      segments,
      duration,
      language: response.language || language
    };
  } catch (error) {
    transcriptionsDb.update(blobName, {
      status: 'failed',
      errorMessage: error.message
    });
    throw error;
  }
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const transcriptionEnabled = settingsDb.get('transcriptionEnabled');
  return aiEnabled !== 'false' && transcriptionEnabled !== 'false' && !!process.env.OPENAI_API_KEY;
}

module.exports = {
  transcribe,
  isEnabled
};
