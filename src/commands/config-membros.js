const { SlashCommandBuilder } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-membros')
    .setDescription('Configura registro de entrada/saída de membros')
    .addSubcommand(sub => sub.setName('set').setDescription('Ativa/desativa registro de entrada/saída').addBooleanOption(o => o.setName('enabled').setDescription('true = ativar logs de membros').setRequired(true)))
    .addSubcommand(sub => sub.setName('set-entrada').setDescription('Ativa APENAS registro de ENTRADA de membros').addChannelOption(o => o.setName('channel').setDescription('Canal para logs de entrada').setRequired(true)))
    .addSubcommand(sub => sub.setName('show').setDescription('Mostra configuração atual')),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Permissão negada.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};

    if (sub === 'set') {
      const enabled = interaction.options.getBoolean('enabled');
      cfg[interaction.guildId].logMembers = !!enabled;
      writeConfig(cfg);
      return interaction.reply({ content: `Registro de entradas/saídas de membros setado para: ${enabled}`, ephemeral: true });
    }

    if (sub === 'set-entrada') {
      const channel = interaction.options.getChannel('channel');
      if (!channel.isTextBased()) {
        return interaction.reply({ content: 'O canal precisa ser um canal de texto.', ephemeral: true });
      }
      cfg[interaction.guildId].logMembersJoinOnly = true;
      cfg[interaction.guildId].joinLogsChannelId = channel.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Configurado! Agora apenas **entradas** de membros serão registradas em ${channel}`, ephemeral: true });
    }

    if (sub === 'show') {
      const g = cfg[interaction.guildId] || {};
      let statusText = '';
      
      if (g.logMembersJoinOnly) {
        statusText = `✅ **APENAS ENTRADAS** ativas\nCanal de entrada: ${g.joinLogsChannelId ? `<#${g.joinLogsChannelId}>` : 'não definido'}`;
      } else {
        statusText = `Registro geral de membros: ${g.logMembers === true}\nCanal de logs: ${g.membersLogsChannelId ? `<#${g.membersLogsChannelId}>` : 'não definido'}`;
      }
      
      return interaction.reply({ content: statusText, ephemeral: true });
    }
  }
};
