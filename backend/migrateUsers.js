const bcrypt = require('bcrypt');
const { usersDb } = require('./database');

/**
 * Migre les utilisateurs hardcodés vers la base de données
 * Cette fonction est idempotente : elle ne créera pas de doublons
 */
async function migrateHardcodedUsers() {
  console.log('🔄 Migration des utilisateurs hardcodés...');

  // Utilisateurs à migrer (correspondant aux ADMIN_USERS et USERS de server.js)
  const hardcodedUsers = [
    {
      username: 'admin',
      email: 'admin@shareazure.local',
      password: 'admin123',
      role: 'admin',
      fullName: 'Administrateur'
    },
    {
      username: 'user',
      email: 'user@shareazure.local',
      password: 'user123',
      role: 'user',
      fullName: 'Utilisateur Standard'
    },
    {
      username: 'april',
      email: 'april@april.fr',
      password: 'april123',
      role: 'april_user',
      fullName: 'Utilisateur APRIL'
    }
  ];

  let migrated = 0;
  let skipped = 0;

  for (const user of hardcodedUsers) {
    try {
      // Vérifier si l'utilisateur existe déjà
      const existing = usersDb.getByUsername(user.username);

      if (existing) {
        console.log(`  ⏭️  ${user.username} existe déjà (ID: ${existing.id})`);
        skipped++;
        continue;
      }

      // Hasher le mot de passe
      const passwordHash = await bcrypt.hash(user.password, 10);

      // Créer l'utilisateur
      const result = usersDb.create({
        username: user.username,
        email: user.email,
        passwordHash: passwordHash,
        role: user.role,
        fullName: user.fullName
      });

      console.log(`  ✅ ${user.username} migré (ID: ${result.lastInsertRowid}, rôle: ${user.role})`);
      migrated++;

    } catch (error) {
      console.error(`  ❌ Erreur lors de la migration de ${user.username}:`, error.message);
    }
  }

  console.log(`✅ Migration terminée : ${migrated} créé(s), ${skipped} ignoré(s)`);

  return { migrated, skipped };
}

/**
 * Crée un utilisateur APRIL de test si besoin
 */
async function ensureAprilUserExists() {
  try {
    const aprilUser = usersDb.getByUsername('april');
    if (!aprilUser) {
      console.log('⚠️  Aucun utilisateur APRIL trouvé, création d\'un utilisateur de test...');
      const passwordHash = await bcrypt.hash('april123', 10);

      const result = usersDb.create({
        username: 'april',
        email: 'april@april.fr',
        passwordHash: passwordHash,
        role: 'april_user',
        fullName: 'Utilisateur APRIL'
      });

      console.log(`✅ Utilisateur APRIL créé (ID: ${result.lastInsertRowid})`);
      return result.lastInsertRowid;
    }
    return aprilUser.id;
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'utilisateur APRIL:', error.message);
    return null;
  }
}

/**
 * Affiche les statistiques des utilisateurs
 */
function displayUserStats() {
  try {
    const allUsers = usersDb.getAll();

    console.log('\n📊 Statistiques des utilisateurs :');
    console.log(`   Total : ${allUsers.length} utilisateur(s)`);

    const byRole = allUsers.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    for (const [role, count] of Object.entries(byRole)) {
      console.log(`   - ${role} : ${count}`);
    }

    console.log('\n👤 Utilisateurs actifs :');
    allUsers.filter(u => u.is_active).forEach(user => {
      console.log(`   - ${user.username} (${user.role}) - ${user.email}`);
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'affichage des stats:', error.message);
  }
}

// Si exécuté directement
if (require.main === module) {
  (async () => {
    await migrateHardcodedUsers();
    await ensureAprilUserExists();
    displayUserStats();
    process.exit(0);
  })();
}

module.exports = {
  migrateHardcodedUsers,
  ensureAprilUserExists,
  displayUserStats
};
