const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Define canais de logs de forma organizada')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('set-joins')
      .setDescription('Define o canal para logs de ENTRADA de membros (apenas joins)')
      .addChannelOption(o => o.setName('channel').setDescription('Canal de logs de entrada').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('set-messages')
      .setDescription('Define o canal para logs de mensagens (editadas/deletadas) e ativa/desativa cada tipo')
      .addChannelOption(o => o.setName('channel').setDescription('Canal de logs de mensagens').setRequired(true))
      .addBooleanOption(o => o.setName('edits').setDescription('Log de mensagens editadas').setRequired(true))
      .addBooleanOption(o => o.setName('deletes').setDescription('Log de mensagens deletadas').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('set-tickets-open')
      .setDescription('Define o canal para logs de ABERTURA de tickets (quem abriu)')
      .addChannelOption(o => o.setName('channel').setDescription('Canal para logs de abertura de tickets').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('set-tickets-closed')
      .setDescription('Define o canal para tickets FECHADOS (transcript TXT)')
      .addChannelOption(o => o.setName('channel').setDescription('Canal para tickets encerrados e transcripts').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('show')
      .setDescription('Mostra a configuração atual de logs')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};
    const g = cfg[interaction.guildId];

    if (sub === 'set-joins') {
      const ch = interaction.options.getChannel('channel');
      if (!ch.isTextBased()) return interaction.reply({ content: 'O canal precisa ser de texto.', ephemeral: true });
      g.joinLogsOnly = true;
      g.joinLogsChannelId = ch.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Logs de ENTRADA configurados em ${ch}.`, ephemeral: true });
    }

    if (sub === 'set-messages') {
      const ch = interaction.options.getChannel('channel');
      const edits = interaction.options.getBoolean('edits');
      const deletes = interaction.options.getBoolean('deletes');
      if (!ch.isTextBased()) return interaction.reply({ content: 'O canal precisa ser de texto.', ephemeral: true });
      g.eventsLogsChannelId = ch.id;
      g.logEdits = !!edits;
      g.logDeletes = !!deletes;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Logs de mensagens definidos em ${ch}. Edits=${edits} Deletes=${deletes}`, ephemeral: true });
    }

    if (sub === 'set-tickets-open') {
      const ch = interaction.options.getChannel('channel');
      if (!ch.isTextBased()) return interaction.reply({ content: 'O canal precisa ser de texto.', ephemeral: true });
      g.ticketsOpenLogsChannelId = ch.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Logs de ABERTURA de tickets definidos em ${ch}.`, ephemeral: true });
    }

    if (sub === 'set-tickets-closed') {
      const ch = interaction.options.getChannel('channel');
      if (!ch.isTextBased()) return interaction.reply({ content: 'O canal precisa ser de texto.', ephemeral: true });
      // Usaremos transcriptsChannelId para enviar o transcript TXT
      g.transcriptsChannelId = ch.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Logs de tickets FECHADOS + transcripts definidos em ${ch}.`, ephemeral: true });
    }

    if (sub === 'show') {
      const lines = [
        `• Joins: ${g.joinLogsChannelId ? `<#${g.joinLogsChannelId}>` : 'não definido'}`,
        `• Mensagens: ${g.eventsLogsChannelId ? `<#${g.eventsLogsChannelId}>` : 'não definido'} (edits=${g.logEdits===true} deletes=${g.logDeletes===true})`,
        `• Tickets (abertura): ${g.ticketsOpenLogsChannelId ? `<#${g.ticketsOpenLogsChannelId}>` : 'não definido'}`,
        `• Tickets (fechados/transcripts): ${g.transcriptsChannelId ? `<#${g.transcriptsChannelId}>` : 'não definido'}`
      ];
      return interaction.reply({ content: `📊 Configuração de Logs:\n${lines.join('\n')}`, ephemeral: true });
    }
  }
};
