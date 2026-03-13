const { Events, EmbedBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    try {
      if (message.author?.bot) return;
      const cfg = readConfig();
      const gcfg = cfg[message.guild.id] || {};
      if (!gcfg.logDeletes) return;
      const chId = gcfg.eventsLogsChannelId || gcfg.logsChannelId;
      if (!chId) return;
        const { sendToConfiguredChannels } = require('../utils/logger');
        const canal = message.channel ? `<#${message.channel.id}>` : '# unknown';
        const conteudo = message.content && message.content.trim().length > 0 ? message.content : '[sem texto]';

        const embed = new EmbedBuilder()
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
          .setTitle('Conteúdo deletado')
          .setColor(0xCC1100)
          .setDescription('```\n' + conteudo.slice(0, 4080) + '\n```')
          .addFields({ name: 'Canal', value: canal, inline: false })
          .setFooter({ text: `ID do Usuário: ${message.author.id}` })
          .setTimestamp(message.createdAt || new Date());

        await sendToConfiguredChannels(message.guild, ['eventsLogsChannelId'], { embeds: [embed] });
    } catch (e) { console.error('messageDelete error', e); }
  }
};
