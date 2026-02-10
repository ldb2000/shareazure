FROM node:18-alpine

# Créer le répertoire de l'application
WORKDIR /app

# Copier les fichiers package
COPY package*.json ./

# Installer les dépendances de production
RUN npm ci --only=production

# Copier le code source
COPY . .

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Utiliser l'utilisateur non-root
USER nodejs

# Exposer le port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Démarrer l'application
CMD ["node", "server.js"]
