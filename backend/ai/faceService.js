const { faceProfilesDb, faceOccurrencesDb, settingsDb } = require('../database');

function createProfile(data) {
  const result = faceProfilesDb.create({
    name: data.name,
    sampleEncoding: data.sampleEncoding || null,
    createdBy: data.createdBy || null
  });
  return faceProfilesDb.getById(result.lastInsertRowid);
}

function getAllProfiles() {
  return faceProfilesDb.getAll();
}

function getProfile(id) {
  return faceProfilesDb.getById(id);
}

function updateProfile(id, data) {
  faceProfilesDb.update(id, { name: data.name });
  return faceProfilesDb.getById(id);
}

function deleteProfile(id) {
  return faceProfilesDb.delete(id);
}

function mergeProfiles(targetId, sourceId) {
  return faceProfilesDb.merge(targetId, sourceId);
}

function getFilesByProfile(profileId) {
  return faceOccurrencesDb.getByProfile(profileId);
}

function addOccurrence(data) {
  const result = faceOccurrencesDb.create(data);
  if (data.faceProfileId) {
    faceProfilesDb.updatePhotoCount(data.faceProfileId);
  }
  return result;
}

function getOccurrencesByBlobName(blobName) {
  return faceOccurrencesDb.getByBlobName(blobName);
}

function assignFaceToProfile(occurrenceId, profileId) {
  const { db } = require('../database');
  const stmt = db.prepare(`UPDATE face_occurrences SET face_profile_id = ? WHERE id = ?`);
  stmt.run(profileId, occurrenceId);
  faceProfilesDb.updatePhotoCount(profileId);
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const faceEnabled = settingsDb.get('faceRecognitionEnabled');
  return aiEnabled !== 'false' && faceEnabled !== 'false';
}

function getMinConfidence() {
  return parseFloat(settingsDb.get('faceMinConfidence')) || 0.7;
}

module.exports = {
  createProfile,
  getAllProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  mergeProfiles,
  getFilesByProfile,
  addOccurrence,
  getOccurrencesByBlobName,
  assignFaceToProfile,
  isEnabled,
  getMinConfidence
};
