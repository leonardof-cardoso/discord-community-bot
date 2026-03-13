const { Events, EmbedBuilder, Colors } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    try {
      if (oldMessage.author?.bot) return;
      const cfg = readConfig();
      const gcfg = cfg[oldMessage.guild.id] || {};
      if (!gcfg.logEdits) return;
      const chId = gcfg.eventsLogsChannelId || gcfg.logsChannelId;
      if (!chId) return;
      const { sendToConfiguredChannels } = require('../utils/logger');
      const canal = oldMessage.channel ? `<#${oldMessage.channel.id}>` : '# unknown';
      const before = oldMessage.content && oldMessage.content.trim().length > 0 ? oldMessage.content : '[sem texto]';
      const after = newMessage.content && newMessage.content.trim().length > 0 ? newMessage.content : '[sem texto]';

      const embed = new EmbedBuilder()
        .setAuthor({ name: oldMessage.author.tag, iconURL: oldMessage.author.displayAvatarURL() })
        .setTitle('Conteúdo editado')
        .setColor(0xCC1100)
        .setDescription('Antes:\n```\n' + before.slice(0, 2000) + '\n```\nDepois:\n```\n' + after.slice(0, 2000) + '\n```')
        .addFields({ name: 'Canal', value: canal, inline: false })
        .setFooter({ text: `ID do Usuário: ${oldMessage.author.id}` })
        .setTimestamp(oldMessage.createdAt || new Date());

      await sendToConfiguredChannels(oldMessage.guild, ['eventsLogsChannelId'], { embeds: [embed] });
    } catch (e) { console.error('messageUpdate error', e); }
  }
};
