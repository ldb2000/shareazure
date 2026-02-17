const { execFile } = require('child_process');
const { settingsDb } = require('../database');
const fs = require('fs');
const path = require('path');
const os = require('os');

const QUARANTINE_DIR = path.join(os.tmpdir(), 'shareazure-quarantine');
if (!fs.existsSync(QUARANTINE_DIR)) fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

function isEnabled() {
  const setting = settingsDb.get('virusScanEnabled');
  return setting !== 'false';
}

/**
 * Check if ClamAV is available on the system
 */
function isClamAvAvailable() {
  return fs.existsSync('/usr/bin/clamdscan') || fs.existsSync('/usr/bin/clamscan');
}

/**
 * Scan a buffer for viruses
 * @param {Buffer} buffer - File content
 * @param {string} filename - Original filename
 * @returns {Promise<{clean: boolean, virus?: string, scanTime: number}>}
 */
async function scanBuffer(buffer, filename) {
  if (!isClamAvAvailable()) {
    console.warn('⚠️ ClamAV non installé — scan antivirus ignoré');
    return { clean: true, scanTime: 0, warning: 'ClamAV not installed' };
  }

  const tempPath = path.join(os.tmpdir(), `scan_${Date.now()}_${filename.replace(/[^a-zA-Z0-9.]/g, '_')}`);
  fs.writeFileSync(tempPath, buffer);

  try {
    return await scanFile(tempPath);
  } finally {
    try { fs.unlinkSync(tempPath); } catch(e) {}
  }
}

/**
 * Scan a file path for viruses
 */
function scanFile(filePath) {
  return new Promise((resolve) => {
    if (!isClamAvAvailable()) {
      console.warn('⚠️ ClamAV non installé — scan antivirus ignoré');
      return resolve({ clean: true, scanTime: 0, warning: 'ClamAV not installed' });
    }

    const start = Date.now();

    // Try clamdscan first (faster, daemon mode), fall back to clamscan
    const scanner = fs.existsSync('/usr/bin/clamdscan') ? 'clamdscan' : 'clamscan';
    const args = ['--no-summary', '--stdout', filePath];

    execFile(scanner, args, { timeout: 60000 }, (error, stdout, stderr) => {
      const scanTime = Date.now() - start;

      if (!error) {
        // Exit code 0 = clean
        resolve({ clean: true, scanTime });
      } else if (error.code === 1) {
        // Exit code 1 = virus found
        const match = stdout.match(/: (.+) FOUND/);
        const virusName = match ? match[1] : 'Unknown threat';
        resolve({ clean: false, virus: virusName, scanTime });
      } else {
        // Exit code 2 = error (treat as clean but log warning)
        console.error(`ClamAV scan error for ${filePath}:`, stderr || error.message);
        resolve({ clean: true, scanTime, warning: 'Scan error, treated as clean' });
      }
    });
  });
}

/**
 * Quarantine an infected file
 */
function quarantine(blobName, buffer, virusName) {
  const quarantinePath = path.join(QUARANTINE_DIR, `${Date.now()}_${blobName.replace(/[^a-zA-Z0-9.]/g, '_')}`);
  fs.writeFileSync(quarantinePath, buffer);

  const { db } = require('../database');
  try {
    db.prepare(`
      INSERT INTO virus_quarantine (blob_name, virus_name, quarantine_path, detected_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(blobName, virusName, quarantinePath);
  } catch(e) {
    console.error('Quarantine DB error:', e.message);
  }

  return quarantinePath;
}

module.exports = { isEnabled, isClamAvAvailable, scanBuffer, scanFile, quarantine, QUARANTINE_DIR };
