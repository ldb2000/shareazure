const { geolocationDb, settingsDb } = require('../database');

let exifr = null;

async function getExifr() {
  if (!exifr) {
    exifr = require('exifr');
  }
  return exifr;
}

function isEnabled() {
  const enabled = settingsDb.get('geolocationEnabled');
  return enabled !== 'false';
}

function isReverseGeocodingEnabled() {
  const enabled = settingsDb.get('reverseGeocodingEnabled');
  return enabled === 'true';
}

async function extractGeolocation(buffer, blobName) {
  if (!isEnabled()) return null;

  const exifrLib = await getExifr();

  // Extract GPS coordinates
  let gps;
  try {
    gps = await exifrLib.gps(buffer);
  } catch (e) {
    // File has no EXIF GPS data
    return null;
  }

  if (!gps || !gps.latitude || !gps.longitude) {
    return null;
  }

  // Extract additional EXIF data
  let rawExif = {};
  try {
    const parsed = await exifrLib.parse(buffer, {
      pick: ['GPSAltitude', 'GPSAltitudeRef', 'Make', 'Model', 'DateTimeOriginal']
    });
    if (parsed) {
      rawExif = parsed;
    }
  } catch (e) { /* ignore */ }

  const altitude = rawExif.GPSAltitude || null;

  const geoData = {
    blobName,
    latitude: gps.latitude,
    longitude: gps.longitude,
    altitude,
    rawExif
  };

  // Reverse geocoding (if enabled)
  if (isReverseGeocodingEnabled()) {
    try {
      const geocoded = await reverseGeocode(gps.latitude, gps.longitude);
      if (geocoded) {
        geoData.address = geocoded.address;
        geoData.city = geocoded.city;
        geoData.country = geocoded.country;
        geoData.countryCode = geocoded.countryCode;
      }
    } catch (e) {
      console.error(`Reverse geocoding failed for ${blobName}:`, e.message);
    }
  }

  // Store in database
  geolocationDb.create(geoData);

  return geoData;
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ShareAzure/1.0 (file-sharing-app)',
      'Accept-Language': 'fr,en'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const data = await response.json();

  if (!data || !data.address) {
    return null;
  }

  return {
    address: data.display_name || null,
    city: data.address.city || data.address.town || data.address.village || data.address.municipality || null,
    country: data.address.country || null,
    countryCode: data.address.country_code || null
  };
}

function getByBlobName(blobName) {
  return geolocationDb.getByBlobName(blobName);
}

function getAllGeotagged(limit) {
  return geolocationDb.getAll(limit);
}

function getNearby(lat, lng, radiusKm) {
  return geolocationDb.getNearby(lat, lng, radiusKm);
}

function getStats() {
  return geolocationDb.getStats();
}

function deleteByBlobName(blobName) {
  return geolocationDb.delete(blobName);
}

module.exports = {
  extractGeolocation,
  reverseGeocode,
  isEnabled,
  isReverseGeocodingEnabled,
  getByBlobName,
  getAllGeotagged,
  getNearby,
  getStats,
  deleteByBlobName
};
