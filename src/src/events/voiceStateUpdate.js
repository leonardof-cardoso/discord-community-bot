const { Events } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      const guild = newState.guild || oldState.guild;
  const cfg = readConfig();
  const gcfg = cfg[guild.id] || {};
  if (!gcfg.logVoice) return;
  const chId = gcfg.eventsLogsChannelId || gcfg.logsChannelId;
  if (!chId) return;
  const ch = guild.channels.cache.get(chId);
  if (!ch || !ch.isTextBased()) return;

      const userTag = newState.member?.user?.tag || oldState.member?.user?.tag || 'Unknown';

      const { EmbedBuilder, Colors } = require('discord.js');
      const { sendToConfiguredChannels } = require('../utils/logger');
      // entrou em canal de voz
      if (!oldState.channelId && newState.channelId) {
        const embed = new EmbedBuilder().setTitle('🔊 Entrou em canal de voz').setColor(Colors.Green).setDescription(`${userTag} entrou em <#${newState.channelId}>`).setTimestamp();
        await sendToConfiguredChannels(guild, ['eventsLogsChannelId'], { embeds: [embed] });
        return;
      }

      // saiu do canal de voz
      if (oldState.channelId && !newState.channelId) {
        const embed = new EmbedBuilder().setTitle('🔈 Saiu do canal de voz').setColor(Colors.Orange).setDescription(`${userTag} saiu de <#${oldState.channelId}>`).setTimestamp();
        await sendToConfiguredChannels(guild, ['eventsLogsChannelId'], { embeds: [embed] });
        return;
      }

      // mover de um canal para outro
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder().setTitle('🔁 Mudou de canal de voz').setColor(Colors.Blue).setDescription(`${userTag} mudou de <#${oldState.channel.id}> para <#${newState.channelId}>`).setTimestamp();
        await sendToConfiguredChannels(guild, ['eventsLogsChannelId'], { embeds: [embed] });
        return;
      }
    } catch (e) { console.error('voiceStateUpdate error', e); }
  }
};
