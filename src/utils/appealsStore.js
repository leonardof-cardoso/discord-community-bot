const fs = require('fs');
const path = require('path');

const APPEALS_PATH = path.join(__dirname, '..', '..', 'appeals.json');

function readAppeals() {
  try {
    return JSON.parse(fs.readFileSync(APPEALS_PATH, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

function writeAppeals(data) {
  fs.writeFileSync(APPEALS_PATH, JSON.stringify(data, null, 2));
}

function hasActiveAppeal(guildId, userId) {
  const appeals = readAppeals();
  if (!appeals[guildId]) return false;
  
  // Procurar por appeals ativos ou negados (limite de 1)
  const userAppeals = Object.values(appeals[guildId]).filter(appeal => 
    appeal.userId === userId && (appeal.status === 'pending' || appeal.status === 'denied')
  );
  
  return userAppeals.length > 0;
}

function createAppeal(guildId, userId, appealData) {
  const appeals = readAppeals();
  appeals[guildId] = appeals[guildId] || {};
  
  const appealId = `appeal_${Date.now()}_${userId}`;
  appeals[guildId][appealId] = {
    id: appealId,
    userId,
    username: appealData.username,
    ingameName: appealData.ingameName,
    punishmentType: appealData.punishmentType,
    reviewReason: appealData.reviewReason,
    status: 'pending', // pending, approved, denied
    createdAt: Date.now(),
    ticketId: appealData.ticketId || null,
    channelId: appealData.channelId || null,
    resolvedBy: null,
    resolvedAt: null,
    responseMessage: null
  };
  
  writeAppeals(appeals);
  return appeals[guildId][appealId];
}

function getAppeal(guildId, appealId) {
  const appeals = readAppeals();
  if (!appeals[guildId] || !appeals[guildId][appealId]) return null;
  return appeals[guildId][appealId];
}

function getAppealByChannel(guildId, channelId) {
  const appeals = readAppeals();
  if (!appeals[guildId]) return null;
  
  const appeal = Object.values(appeals[guildId]).find(a => a.channelId === channelId);
  return appeal || null;
}

function updateAppeal(guildId, appealId, updates) {
  const appeals = readAppeals();
  if (!appeals[guildId] || !appeals[guildId][appealId]) return null;
  
  Object.assign(appeals[guildId][appealId], updates);
  writeAppeals(appeals);
  return appeals[guildId][appealId];
}

function getUserAppeals(guildId, userId) {
  const appeals = readAppeals();
  if (!appeals[guildId]) return [];
  
  return Object.values(appeals[guildId]).filter(appeal => appeal.userId === userId);
}

function getAllPendingAppeals(guildId) {
  const appeals = readAppeals();
  if (!appeals[guildId]) return [];
  
  return Object.values(appeals[guildId]).filter(appeal => appeal.status === 'pending');
}

module.exports = {
  hasActiveAppeal,
  createAppeal,
  getAppeal,
  getAppealByChannel,
  updateAppeal,
  getUserAppeals,
  getAllPendingAppeals
};