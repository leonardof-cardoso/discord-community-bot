const { readConfig } = require('./config');

// keys: array of config names to try (e.g. ['transcriptsChannelId','eventsLogsChannelId'])
async function sendToConfiguredChannels(guild, keys, payload) {
  const cfg = readConfig();
  const gcfg = cfg[guild.id] || {};
  for (const key of keys) {
    const chId = gcfg[key] || gcfg.logsChannelId; // fallback to legacy
    if (!chId) continue;
    const ch = guild.channels.cache.get(chId);
    if (!ch || !ch.isTextBased()) continue;
    try { await ch.send(payload); } catch (e) { console.error('Erro ao enviar log para canal configurado', e); }
  }
}

module.exports = { sendToConfiguredChannels };
