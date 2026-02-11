const { settingsDb, aiCostTrackingDb } = require('../database');

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

function getModel() {
  return process.env.OPENAI_MODEL || settingsDb.get('openaiModel') || 'gpt-4o';
}

function trackCost(operation, inputTokens, outputTokens, model, blobName) {
  const costPer1kInput = 0.005; // GPT-4o input
  const costPer1kOutput = 0.015; // GPT-4o output
  const cost = (inputTokens / 1000 * costPer1kInput) + (outputTokens / 1000 * costPer1kOutput);

  try {
    aiCostTrackingDb.log({
      service: 'openai',
      model,
      operation,
      inputTokens,
      outputTokens,
      cost,
      blobName
    });
  } catch (e) {
    console.error('Error tracking AI cost:', e.message);
  }

  return cost;
}

async function analyzeImage(imageBuffer, blobName) {
  const openai = getClient();
  const model = getModel();
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this image in detail. Provide:
1. A concise description (1-2 sentences)
2. A list of relevant tags (comma-separated, lowercase)
3. The main subject/category
4. Any notable elements (people, objects, text, landmarks, emotions)
5. Suggested colors (dominant colors)

Respond in JSON format:
{
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "category": "...",
  "elements": { "people": 0, "objects": [...], "text": "...", "landmarks": [...], "emotions": [...] },
  "colors": ["..."]
}`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'auto'
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  const usage = response.usage || {};
  trackCost('analyzeImage', usage.prompt_tokens || 0, usage.completion_tokens || 0, model, blobName);

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

async function generateTags(imageBuffer, blobName) {
  const openai = getClient();
  const model = getModel();
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Generate a list of descriptive tags for this image. Return only a JSON array of lowercase strings, max 20 tags. Example: ["sunset", "beach", "ocean", "sky"]'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
              detail: 'low'
            }
          }
        ]
      }
    ],
    max_tokens: 300,
    response_format: { type: 'json_object' }
  });

  const usage = response.usage || {};
  trackCost('generateTags', usage.prompt_tokens || 0, usage.completion_tokens || 0, model, blobName);

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : parsed.tags || [];
}

async function describeScene(imageBuffer, blobName) {
  const openai = getClient();
  const model = getModel();
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in 2-3 detailed sentences. Focus on what is happening, the environment, and any notable details.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
              detail: 'auto'
            }
          }
        ]
      }
    ],
    max_tokens: 300
  });

  const usage = response.usage || {};
  trackCost('describeScene', usage.prompt_tokens || 0, usage.completion_tokens || 0, model, blobName);

  return response.choices[0].message.content;
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const openaiEnabled = settingsDb.get('openaiEnabled');
  return aiEnabled !== 'false' && openaiEnabled !== 'false' && !!process.env.OPENAI_API_KEY;
}

module.exports = {
  analyzeImage,
  generateTags,
  describeScene,
  isEnabled
};
