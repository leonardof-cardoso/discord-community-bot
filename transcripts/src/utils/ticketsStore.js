const fs = require('fs');
const path = require('path');
const STORE_PATH = path.join(__dirname, '..', '..', 'tickets.json');
const LOCK_PATH = path.join(__dirname, '..', '..', 'tickets.lock');

// Sistema de lock para prevenir concorrência
const activeLocks = new Map();

async function acquireLock(key, timeout = 10000) {
  const lockKey = `ticket_${key}`;
  
  if (activeLocks.has(lockKey)) {
    return false; // Lock já existe
  }
  
  activeLocks.set(lockKey, Date.now());
  
  // Remover lock automaticamente após timeout
  setTimeout(() => {
    activeLocks.delete(lockKey);
  }, timeout);
  
  return true;
}

function releaseLock(key) {
  const lockKey = `ticket_${key}`;
  activeLocks.delete(lockKey);
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}'); } catch (e) { return {}; }
}

function writeStore(s) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
}

function getOpenTicket(guildId, userId, channelId = null) {
  const s = readStore();
  if (!s[guildId]) return null;
  
  // Se channelId fornecido, buscar por canal
  if (channelId) {
    return s[guildId].byChannel && s[guildId].byChannel[channelId] ? s[guildId].byChannel[channelId] : null;
  }
  
  // Caso contrário, buscar por usuário
  return s[guildId].byUser && s[guildId].byUser[userId] ? s[guildId].byUser[userId] : null;
}

async function safeAddOpenTicket(guildId, userId, channelId, meta = {}) {
  const lockKey = `${guildId}_${userId}`;
  
  // Tentar adquirir lock
  if (!await acquireLock(lockKey)) {
    throw new Error('DUPLICATE_TICKET_CREATION_BLOCKED');
  }
  
  try {
    // Double-check após adquirir lock
    const existing = getOpenTicket(guildId, userId);
    if (existing) {
      releaseLock(lockKey);
      throw new Error('USER_ALREADY_HAS_TICKET');
    }
    
    // Proceder com criação
    const result = addOpenTicket(guildId, userId, channelId, meta);
    releaseLock(lockKey);
    return result;
    
  } catch (error) {
    releaseLock(lockKey);
    throw error;
  }
}

function addOpenTicket(guildId, userId, channelId, meta = {}) {
  const s = readStore();
  s[guildId] = s[guildId] || { byUser: {}, byChannel: {}, nextTicketId: 1, history: [], userStats: {} };
  const ticketData = {
    userId,
    channelId,
    ticketNumber: meta.ticketNumber || 1,
    type: meta.type || 'unknown',
    openerId: meta.openerId || userId,
    createdAt: meta.createdAt || Date.now(),
    responsibleId: null, // quem assumiu o ticket
    claimedAt: null,     // quando foi assumido
    ...meta
  };
  s[guildId].byUser[userId] = ticketData;
  s[guildId].byChannel[channelId] = ticketData;
  
  // Atualizar estatísticas do usuário
  if (!s[guildId].userStats[userId]) {
    s[guildId].userStats[userId] = {
      totalTickets: 0,
      lastTicketAt: null,
      username: meta.username || 'Usuário Desconhecido'
    };
  }
  s[guildId].userStats[userId].totalTickets++;
  s[guildId].userStats[userId].lastTicketAt = Date.now();
  if (meta.username) {
    s[guildId].userStats[userId].username = meta.username;
  }
  
  writeStore(s);
}

function getAndIncrementTicketId(guildId) {
  const s = readStore();
  s[guildId] = s[guildId] || { byUser: {}, byChannel: {}, nextTicketId: 1, history: [], userStats: {} };
  const id = s[guildId].nextTicketId || 1;
  s[guildId].nextTicketId = id + 1;
  writeStore(s);
  return id;
}

function removeOpenTicketByChannel(guildId, channelId) {
  const s = readStore();
  if (!s[guildId] || !s[guildId].byChannel) return null;
  const info = s[guildId].byChannel[channelId];
  if (!info) return null;
  const userId = info.userId;
  // capture info to return
  const ret = { ...info, userId, closedAt: Date.now() };
  
  // Salvar no histórico antes de remover
  s[guildId] = s[guildId] || { byUser: {}, byChannel: {}, nextTicketId: 1, history: [], userStats: {} };
  s[guildId].history = s[guildId].history || [];
  s[guildId].history.push(ret);
  
  delete s[guildId].byChannel[channelId];
  if (s[guildId].byUser && s[guildId].byUser[userId]) delete s[guildId].byUser[userId];
  writeStore(s);
  return ret;
}

module.exports = { 
  getOpenTicket, 
  addOpenTicket,
  safeAddOpenTicket,
  removeOpenTicketByChannel, 
  getAndIncrementTicketId,
  updateTicket,
  claimTicket,
  getTicketByChannel,
  getUserStats,
  getTopPlayers,
  migrateOldTickets,
  acquireLock,
  releaseLock
};

function updateTicket(guildId, channelId, updates) {
  const s = readStore();
  if (!s[guildId] || !s[guildId].byChannel || !s[guildId].byChannel[channelId]) return null;
  
  const ticket = s[guildId].byChannel[channelId];
  const userId = ticket.userId;
  
  // Update both references
  Object.assign(ticket, updates);
  if (s[guildId].byUser[userId]) {
    Object.assign(s[guildId].byUser[userId], updates);
  }
  
  writeStore(s);
  return ticket;
}

function getTicketByChannel(guildId, channelId) {
  const s = readStore();
  if (!s[guildId] || !s[guildId].byChannel) return null;
  return s[guildId].byChannel[channelId] || null;
}

function claimTicket(guildId, channelId, responsibleId) {
  return updateTicket(guildId, channelId, {
    responsibleId,
    claimedAt: Date.now()
  });
}

function getUserStats(guildId, userId) {
  const s = readStore();
  if (!s[guildId] || !s[guildId].userStats) return null;
  return s[guildId].userStats[userId] || null;
}

function getTopPlayers(guildId, limit = 10) {
  const s = readStore();
  if (!s[guildId]) return [];

  // Auto-migração: verificar se há dados antigos não processados
  const needsMigration = (
    (!s[guildId].userStats || Object.keys(s[guildId].userStats).length === 0) &&
    (
      (s[guildId].history && s[guildId].history.length > 0) ||
      (s[guildId].byChannel && Object.keys(s[guildId].byChannel).length > 0) ||
      (s[guildId].byUser && Object.keys(s[guildId].byUser).length > 0)
    )
  );

  if (needsMigration) {
    console.log('[TICKETS] Auto-migração detectada, processando dados antigos...');
    migrateOldTickets(guildId);
    // Re-ler os dados após migração
    const updatedStore = readStore();
    s[guildId] = updatedStore[guildId];
  }
  
  if (!s[guildId].userStats) return [];
  
  const stats = Object.entries(s[guildId].userStats)
    .map(([userId, data]) => ({
      userId,
      totalTickets: data.totalTickets || 0,
      lastTicketAt: data.lastTicketAt,
      username: data.username || 'Usuário Desconhecido'
    }))
    .sort((a, b) => b.totalTickets - a.totalTickets)
    .slice(0, limit);
    
  return stats;
}

function migrateOldTickets(guildId) {
  const s = readStore();
  if (!s[guildId]) return { migrated: 0, message: 'Nenhum dado encontrado para este servidor' };

  // Inicializar estrutura se não existir
  s[guildId].userStats = s[guildId].userStats || {};
  s[guildId].history = s[guildId].history || [];

  let migrated = 0;
  const userTicketCounts = {};

  // Processar histórico existente
  if (s[guildId].history && s[guildId].history.length > 0) {
    s[guildId].history.forEach(ticket => {
      const userId = ticket.userId || ticket.openerId;
      if (userId) {
        userTicketCounts[userId] = (userTicketCounts[userId] || 0) + 1;
        migrated++;
      }
    });
  }

  // Processar tickets ativos
  if (s[guildId].byChannel) {
    Object.values(s[guildId].byChannel).forEach(ticket => {
      const userId = ticket.userId || ticket.openerId;
      if (userId) {
        userTicketCounts[userId] = (userTicketCounts[userId] || 0) + 1;
        migrated++;
      }
    });
  }

  // Processar tickets por usuário (dados antigos)
  if (s[guildId].byUser) {
    Object.entries(s[guildId].byUser).forEach(([userId, ticket]) => {
      if (!userTicketCounts[userId]) {
        userTicketCounts[userId] = 1;
        migrated++;
      }
    });
  }

  // Atualizar userStats com os dados migrados
  Object.entries(userTicketCounts).forEach(([userId, count]) => {
    if (!s[guildId].userStats[userId]) {
      s[guildId].userStats[userId] = {
        totalTickets: 0,
        lastTicketAt: null,
        username: 'Usuário Migrado'
      };
    }

    // Se o usuário já tem stats, somar com os tickets antigos encontrados
    const currentTotal = s[guildId].userStats[userId].totalTickets || 0;
    s[guildId].userStats[userId].totalTickets = Math.max(currentTotal, count);

    // Tentar encontrar a data do último ticket
    let lastTicket = null;
    
    // Verificar no histórico
    if (s[guildId].history) {
      const userHistory = s[guildId].history.filter(t => (t.userId || t.openerId) === userId);
      if (userHistory.length > 0) {
        const latest = userHistory.reduce((latest, current) => {
          const currentTime = current.createdAt || current.closedAt || 0;
          const latestTime = latest.createdAt || latest.closedAt || 0;
          return currentTime > latestTime ? current : latest;
        });
        lastTicket = latest.createdAt || latest.closedAt;
      }
    }

    // Verificar nos tickets ativos
    if (s[guildId].byChannel) {
      Object.values(s[guildId].byChannel).forEach(ticket => {
        if ((ticket.userId || ticket.openerId) === userId) {
          const ticketTime = ticket.createdAt || Date.now();
          if (!lastTicket || ticketTime > lastTicket) {
            lastTicket = ticketTime;
          }
        }
      });
    }

    if (lastTicket && (!s[guildId].userStats[userId].lastTicketAt || lastTicket > s[guildId].userStats[userId].lastTicketAt)) {
      s[guildId].userStats[userId].lastTicketAt = lastTicket;
    }
  });

  writeStore(s);

  return {
    migrated,
    totalUsers: Object.keys(userTicketCounts).length,
    message: `Migração concluída: ${migrated} tickets processados para ${Object.keys(userTicketCounts).length} usuários`
  };
}


