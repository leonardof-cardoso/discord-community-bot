// Simple in-memory store that limits users to react to only one message per channel.
// Supports two modes:
// - mode: 'list' => only tracked messageIds within the channel are enforced
// - mode: 'all'  => all messages in the channel are enforced
// Shape: locks[guildId][channelId] = { active: boolean, mode: 'list'|'all', messageIds: Set<string>, userToMessage: Map<string,string> }

const locks = new Map();

function getChannelLock(guildId, channelId) {
  if (!locks.has(guildId)) locks.set(guildId, new Map());
  const g = locks.get(guildId);
  if (!g.has(channelId)) g.set(channelId, { active: false, mode: 'list', messageIds: new Set(), userToMessage: new Map() });
  return g.get(channelId);
}

module.exports = {
  // Activate lock in a channel and set which messages are eligible
  activate(guildId, channelId, messageIds, mode = 'list') {
    const lock = getChannelLock(guildId, channelId);
    const wasActive = !!lock.active;
    const sameMode = lock.mode === mode;
    lock.active = true;
    lock.mode = mode;
    // Atualizar mensagens rastreadas (modo 'list') se fornecido
    if (Array.isArray(messageIds)) lock.messageIds = new Set(messageIds);
    // Não limpar seleções se já estava ativo no mesmo modo (idempotente)
    if (!(wasActive && sameMode)) {
      lock.userToMessage.clear();
    }
  },
  // Deactivate/remove tracking but keep mapping optionally
  deactivate(guildId, channelId) {
    const lock = getChannelLock(guildId, channelId);
    lock.active = false;
    lock.mode = 'list';
    lock.messageIds.clear();
    lock.userToMessage.clear();
  },
  // Add track message
  addMessage(guildId, channelId, messageId) {
    const lock = getChannelLock(guildId, channelId);
    lock.messageIds.add(messageId);
  },
  // Remove a tracked message
  removeMessage(guildId, channelId, messageId) {
    const lock = getChannelLock(guildId, channelId);
    lock.messageIds.delete(messageId);
    // Clean users that had selected this message
    for (const [userId, msgId] of [...lock.userToMessage.entries()]) {
      if (msgId === messageId) lock.userToMessage.delete(userId);
    }
  },
  // Check and register a reaction attempt; returns { allowed: boolean, previousMessageId?: string }
  trySelect(guildId, channelId, userId, messageId) {
    const lock = getChannelLock(guildId, channelId);
    if (!lock.active) return { allowed: true };
    const tracked = lock.mode === 'all' || lock.messageIds.has(messageId);
    if (!tracked) return { allowed: true };
    if (lock.userToMessage.has(userId)) {
      const prev = lock.userToMessage.get(userId);
      if (prev === messageId) return { allowed: true };
      return { allowed: false, previousMessageId: prev };
    }
    lock.userToMessage.set(userId, messageId);
    return { allowed: true };
  },
  // When removing reaction, if it's from the selected message, free the user
  releaseIfSelected(guildId, channelId, userId, messageId) {
    const lock = getChannelLock(guildId, channelId);
    if (!lock.active) return;
    const prev = lock.userToMessage.get(userId);
    if (prev === messageId) lock.userToMessage.delete(userId);
  },
  // Force a specific selection for a user (used by admin tools/analyses)
  setSelection(guildId, channelId, userId, messageId) {
    const lock = getChannelLock(guildId, channelId);
    if (!lock.active) return;
    lock.userToMessage.set(userId, messageId);
  }
};
