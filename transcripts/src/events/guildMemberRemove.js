const { Events } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      const cfg = readConfig();
  const gcfg = cfg[member.guild.id] || {};
  if (!gcfg.logMembers) return;
  const chId = gcfg.membersLogsChannelId || gcfg.logsChannelId;
  if (!chId) return;
      const { EmbedBuilder, Colors } = require('discord.js');
      const { sendToConfiguredChannels } = require('../utils/logger');
      const embed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle('🔴 Membro saiu')
        .setColor(Colors.Red)
        .addFields({ name: 'Membro', value: `<@${member.id}>`, inline: true })
        .setTimestamp();
      await sendToConfiguredChannels(member.guild, ['membersLogsChannelId'], { embeds: [embed] });
    } catch (e) { console.error('guildMemberRemove error', e); }
  }
};
