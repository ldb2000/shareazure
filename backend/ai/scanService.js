const { scanSchedulesDb, mediaAnalysisDb, geolocationDb, settingsDb } = require('../database');
const jobQueue = require('./jobQueue');

async function runScan(scanType, getBlobBuffer) {
  const scan = scanSchedulesDb.getByType(scanType);
  if (!scan) {
    throw new Error(`Unknown scan type: ${scanType}`);
  }

  let filesProcessed = 0;
  let error = null;

  try {
    const { fileOwnershipDb } = require('../database');
    const allFiles = fileOwnershipDb.getAllWithOwners();
    const mediaProcessor = require('./mediaProcessor');

    const filesToProcess = [];

    for (const file of allFiles) {
      if (!file.content_type || !mediaProcessor.isSupported(file.content_type)) continue;

      const mediaType = mediaProcessor.getMediaType(file.content_type);

      switch (scanType) {
        case 'face_recognition': {
          if (mediaType !== 'image' && mediaType !== 'video') continue;
          // Skip if already analyzed with faces
          const analysis = mediaAnalysisDb.getByBlobName(file.blob_name);
          if (analysis && analysis.status === 'completed') {
            const { faceOccurrencesDb } = require('../database');
            const faces = faceOccurrencesDb.getByBlobName(file.blob_name);
            if (faces.length > 0) continue;
          }
          filesToProcess.push(file);
          break;
        }
        case 'auto_tagging': {
          if (mediaType !== 'image' && mediaType !== 'video') continue;
          const analysis = mediaAnalysisDb.getByBlobName(file.blob_name);
          if (analysis && analysis.status === 'completed' && analysis.tags) continue;
          filesToProcess.push(file);
          break;
        }
        case 'geolocation_extraction': {
          if (mediaType !== 'image' && mediaType !== 'video') continue;
          const existing = geolocationDb.getByBlobName(file.blob_name);
          if (existing) continue;
          filesToProcess.push(file);
          break;
        }
        case 'full_analysis': {
          const analysis = mediaAnalysisDb.getByBlobName(file.blob_name);
          if (analysis && analysis.status === 'completed') continue;
          filesToProcess.push(file);
          break;
        }
      }
    }

    // Process files through the job queue
    for (const file of filesToProcess) {
      try {
        if (scanType === 'geolocation_extraction') {
          const geolocationService = require('./geolocationService');
          const buffer = await getBlobBuffer(file.blob_name);
          await geolocationService.extractGeolocation(buffer, file.blob_name);
        } else {
          const analysisOrchestrator = require('./analysisOrchestrator');
          await analysisOrchestrator.analyzeFile(
            file.blob_name,
            file.content_type,
            () => getBlobBuffer(file.blob_name)
          );
        }
        filesProcessed++;
      } catch (e) {
        console.error(`Scan ${scanType} failed for ${file.blob_name}:`, e.message);
      }
    }

    scanSchedulesDb.updateLastRun(scan.id, {
      status: 'completed',
      filesProcessed,
      error: null
    });
  } catch (e) {
    error = e.message;
    scanSchedulesDb.updateLastRun(scan.id, {
      status: 'failed',
      filesProcessed,
      error: e.message
    });
    throw e;
  }

  return { scanType, filesProcessed, error };
}

function shouldRunNow(schedule) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay(); // 0 = Sunday

  switch (schedule) {
    case 'hourly':
      return minute < 1;
    case 'daily':
      return hour === 3 && minute < 1;
    case 'weekly':
      return day === 0 && hour === 3 && minute < 1;
    default:
      return false;
  }
}

function checkScheduledScans(getBlobBuffer) {
  const enabledScans = scanSchedulesDb.getEnabled();

  for (const scan of enabledScans) {
    if (shouldRunNow(scan.schedule)) {
      console.log(`Running scheduled scan: ${scan.scan_type} (${scan.schedule})`);
      runScan(scan.scan_type, getBlobBuffer)
        .then(result => {
          console.log(`Scan ${scan.scan_type} completed: ${result.filesProcessed} files processed`);
        })
        .catch(err => {
          console.error(`Scan ${scan.scan_type} failed:`, err.message);
        });
    }
  }
}

module.exports = {
  runScan,
  shouldRunNow,
  checkScheduledScans
};
