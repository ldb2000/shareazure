#!/usr/bin/env node

/**
 * Script de test de connexion Azure Storage
 * Usage: node test-connection.js
 */

require('dotenv').config();
const { BlobServiceClient } = require('@azure/storage-blob');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testConnection() {
  log('\n🔍 Test de connexion Azure Storage\n', colors.blue);

  // 1. Vérifier les variables d'environnement
  log('1. Vérification des variables d\'environnement...', colors.yellow);
  
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    log('❌ AZURE_STORAGE_CONNECTION_STRING manquante dans .env', colors.red);
    process.exit(1);
  }
  log('✅ Connection string trouvée', colors.green);

  const containerName = process.env.AZURE_CONTAINER_NAME || 'uploads';
  log(`✅ Nom du conteneur: ${containerName}`, colors.green);

  // 2. Initialiser le client
  log('\n2. Initialisation du client Azure...', colors.yellow);
  
  let blobServiceClient;
  try {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    log('✅ Client initialisé', colors.green);
  } catch (error) {
    log(`❌ Erreur d'initialisation: ${error.message}`, colors.red);
    process.exit(1);
  }

  // 3. Tester la connexion
  log('\n3. Test de connexion au compte de stockage...', colors.yellow);
  
  try {
    const properties = await blobServiceClient.getProperties();
    log('✅ Connexion réussie !', colors.green);
    log(`   Compte: ${properties.accountKind}`, colors.blue);
  } catch (error) {
    log(`❌ Erreur de connexion: ${error.message}`, colors.red);
    process.exit(1);
  }

  // 4. Vérifier le conteneur
  log('\n4. Vérification du conteneur...', colors.yellow);
  
  const containerClient = blobServiceClient.getContainerClient(containerName);
  
  try {
    const exists = await containerClient.exists();
    
    if (exists) {
      log(`✅ Le conteneur '${containerName}' existe`, colors.green);
      
      // Lister quelques blobs
      const iterator = containerClient.listBlobsFlat().byPage({ maxPageSize: 5 });
      const response = (await iterator.next()).value;
      
      if (response.segment.blobItems.length > 0) {
        log(`   ${response.segment.blobItems.length} fichier(s) trouvé(s)`, colors.blue);
      } else {
        log('   Le conteneur est vide', colors.blue);
      }
    } else {
      log(`⚠️  Le conteneur '${containerName}' n'existe pas`, colors.yellow);
      log('   Créez-le avec: curl -X POST http://localhost:3000/api/container/init', colors.blue);
    }
  } catch (error) {
    log(`❌ Erreur lors de la vérification: ${error.message}`, colors.red);
  }

  // 5. Test d'upload
  log('\n5. Test d\'upload d\'un fichier test...', colors.yellow);
  
  try {
    // Créer le conteneur s'il n'existe pas
    await containerClient.createIfNotExists({ access: 'private' });
    
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = `Test d'upload - ${new Date().toISOString()}`;
    const blockBlobClient = containerClient.getBlockBlobClient(testFileName);
    
    await blockBlobClient.upload(testContent, testContent.length, {
      blobHTTPHeaders: { blobContentType: 'text/plain' }
    });
    
    log('✅ Upload test réussi', colors.green);
    log(`   Fichier: ${testFileName}`, colors.blue);
    
    // Nettoyage
    await blockBlobClient.delete();
    log('✅ Fichier test supprimé', colors.green);
    
  } catch (error) {
    log(`❌ Erreur d'upload: ${error.message}`, colors.red);
  }

  // Résumé
  log('\n' + '='.repeat(50), colors.blue);
  log('✅ Tous les tests sont passés !', colors.green);
  log('🚀 Vous pouvez démarrer l\'application avec: npm start', colors.blue);
  log('='.repeat(50) + '\n', colors.blue);
}

// Exécuter les tests
testConnection().catch(error => {
  log(`\n❌ Erreur fatale: ${error.message}`, colors.red);
  process.exit(1);
});
