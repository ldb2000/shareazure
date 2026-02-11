const { settingsDb, aiCostTrackingDb } = require('../database');

let ComputerVisionClient, ApiKeyCredentials;
let client;

function getClient() {
  if (!client) {
    if (!process.env.AZURE_VISION_ENDPOINT || !process.env.AZURE_VISION_KEY) {
      throw new Error('AZURE_VISION_ENDPOINT and AZURE_VISION_KEY environment variables are required');
    }
    const cv = require('@azure/cognitiveservices-computervision');
    const msRest = require('@azure/ms-rest-js');
    ComputerVisionClient = cv.ComputerVisionClient;
    ApiKeyCredentials = msRest.ApiKeyCredentials;

    const credentials = new ApiKeyCredentials({
      inHeader: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_VISION_KEY }
    });
    client = new ComputerVisionClient(credentials, process.env.AZURE_VISION_ENDPOINT);
  }
  return client;
}

function trackCost(operation, blobName) {
  const costPerTransaction = 0.001;
  try {
    aiCostTrackingDb.log({
      service: 'azure_vision',
      model: 'azure-vision-4.0',
      operation,
      inputTokens: 0,
      outputTokens: 0,
      cost: costPerTransaction,
      blobName
    });
  } catch (e) {
    console.error('Error tracking Azure Vision cost:', e.message);
  }
}

async function detectFaces(imageBuffer, blobName) {
  const azureClient = getClient();
  const { Readable } = require('stream');
  const stream = Readable.from(imageBuffer);

  const result = await azureClient.analyzeImageInStream(stream, {
    visualFeatures: ['Faces']
  });

  trackCost('detectFaces', blobName);

  const faces = [];
  if (result.faces) {
    for (const face of result.faces) {
      faces.push({
        boundingBox: face.faceRectangle,
        age: face.age,
        gender: face.gender
      });
    }
  }

  return faces;
}

async function detectObjects(imageBuffer, blobName) {
  const azureClient = getClient();
  const { Readable } = require('stream');
  const stream = Readable.from(imageBuffer);

  const result = await azureClient.detectObjectsInStream(stream);

  trackCost('detectObjects', blobName);

  const objects = [];
  if (result.objects) {
    for (const obj of result.objects) {
      objects.push({
        name: obj.object || 'unknown',
        confidence: obj.confidence || 0,
        boundingBox: obj.rectangle
      });
    }
  }

  return objects;
}

async function ocr(imageBuffer, blobName) {
  const azureClient = getClient();
  const { Readable } = require('stream');
  const stream = Readable.from(imageBuffer);

  // Use Read API (async operation)
  const readResponse = await azureClient.readInStream(stream);

  // Extract operation ID from URL
  const operationUrl = readResponse.operationLocation;
  const operationId = operationUrl.split('/').pop();

  // Poll for results
  let readResult;
  let status = 'running';
  while (status === 'running' || status === 'notStarted') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    readResult = await azureClient.getReadResult(operationId);
    status = readResult.status;
  }

  trackCost('ocr', blobName);

  const lines = [];
  if (readResult.analyzeResult && readResult.analyzeResult.readResults) {
    for (const page of readResult.analyzeResult.readResults) {
      for (const line of page.lines || []) {
        lines.push({
          text: line.text,
          boundingBox: line.boundingBox,
          words: (line.words || []).map(w => ({
            text: w.text,
            confidence: w.confidence,
            boundingBox: w.boundingBox
          }))
        });
      }
    }
  }

  return {
    text: lines.map(l => l.text).join('\n'),
    lines
  };
}

async function analyzeImage(imageBuffer, blobName) {
  const azureClient = getClient();
  const { Readable } = require('stream');

  // Analyze with multiple features
  const stream1 = Readable.from(Buffer.from(imageBuffer));
  const analysisResult = await azureClient.analyzeImageInStream(stream1, {
    visualFeatures: ['Categories', 'Tags', 'Description', 'Faces', 'Objects', 'Color']
  });

  trackCost('analyzeImage', blobName);

  // Get OCR separately
  let ocrText = '';
  try {
    const ocrResult = await ocr(imageBuffer, blobName);
    ocrText = ocrResult.text;
  } catch (e) {
    console.error('OCR failed:', e.message);
  }

  return {
    caption: analysisResult.description && analysisResult.description.captions && analysisResult.description.captions[0]
      ? {
          text: analysisResult.description.captions[0].text,
          confidence: analysisResult.description.captions[0].confidence
        }
      : null,
    tags: (analysisResult.tags || []).map(t => ({
      name: t.name,
      confidence: t.confidence
    })),
    objects: (analysisResult.objects || []).map(o => ({
      name: o.object || 'unknown',
      confidence: o.confidence || 0,
      boundingBox: o.rectangle
    })),
    people: (analysisResult.faces || []).map(f => ({
      boundingBox: f.faceRectangle,
      age: f.age,
      gender: f.gender
    })),
    colors: analysisResult.color ? {
      dominantForeground: analysisResult.color.dominantColorForeground,
      dominantBackground: analysisResult.color.dominantColorBackground,
      dominantColors: analysisResult.color.dominantColors,
      accentColor: analysisResult.color.accentColor,
      isBW: analysisResult.color.isBWImg
    } : null,
    categories: (analysisResult.categories || []).map(c => ({
      name: c.name,
      score: c.score
    })),
    ocrText
  };
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const azureVisionEnabled = settingsDb.get('azureVisionEnabled');
  return aiEnabled !== 'false' && azureVisionEnabled !== 'false' &&
    !!process.env.AZURE_VISION_ENDPOINT && !!process.env.AZURE_VISION_KEY;
}

module.exports = {
  detectFaces,
  detectObjects,
  ocr,
  analyzeImage,
  isEnabled
};
