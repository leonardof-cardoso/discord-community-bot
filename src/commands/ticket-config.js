const { SlashCommandBuilder } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-config')
    .setDescription('Configurações do sistema de tickets')
    .addSubcommand(sub => sub.setName('set-roles').setDescription('Define os papéis de Líder e Conselheiro').addRoleOption(o => o.setName('leader').setDescription('Papel de Líder').setRequired(true)).addRoleOption(o => o.setName('conselheiro').setDescription('Papel de Conselheiro').setRequired(true)))
    .addSubcommand(sub => sub.setName('set-visibility').setDescription('Controla se os papéis de staff podem ver tickets').addBooleanOption(o => o.setName('staff_visible').setDescription('true = staff vê tickets')))
    .addSubcommand(sub => sub.setName('set-channel').setDescription('Define o canal de atendimento').addChannelOption(o => o.setName('channel').setDescription('Canal').setRequired(true)))
    .addSubcommand(sub => sub.setName('set-logs-channel').setDescription('Define o canal para enviar transcripts').addChannelOption(o => o.setName('channel').setDescription('Canal de transcripts').setRequired(true)))
    .addSubcommand(sub => sub.setName('set-members-logs').setDescription('Define o canal de logs para entradas/saídas de membros').addChannelOption(o => o.setName('channel').setDescription('Canal de membros').setRequired(true)))
    .addSubcommand(sub => sub.setName('set-events-logs').setDescription('Define o canal de logs para edits/deletes/voice').addChannelOption(o => o.setName('channel').setDescription('Canal de eventos').setRequired(true)))
    .addSubcommand(sub => sub.setName('show').setDescription('Mostra as configurações atuais')),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Permissão negada.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};

    if (sub === 'set-roles') {
      const leader = interaction.options.getRole('leader');
      const cons = interaction.options.getRole('conselheiro');
      cfg[interaction.guildId].leaderRoleId = leader.id;
      cfg[interaction.guildId].conselheiroRoleId = cons.id;
      writeConfig(cfg);
      return interaction.reply({ content: `Papéis configurados: Líder = ${leader}, Conselheiro = ${cons}`, ephemeral: true });
    }

    if (sub === 'set-visibility') {
      const vis = interaction.options.getBoolean('staff_visible');
      cfg[interaction.guildId].allowStaffView = !!vis;
      writeConfig(cfg);
      return interaction.reply({ content: `Visibilidade de staff atualizada: ${vis}`, ephemeral: true });
    }

    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel');
      cfg[interaction.guildId].channelId = channel.id;
      writeConfig(cfg);
      return interaction.reply({ content: `Canal de atendimento configurado: ${channel}`, ephemeral: true });
    }

    if (sub === 'set-logs-channel') {
      const channel = interaction.options.getChannel('channel');
      cfg[interaction.guildId].transcriptsChannelId = channel.id;
      writeConfig(cfg);
      return interaction.reply({ content: `Canal de transcripts configurado: ${channel}`, ephemeral: true });
    }

    if (sub === 'set-members-logs') {
      const channel = interaction.options.getChannel('channel');
      cfg[interaction.guildId].membersLogsChannelId = channel.id;
      writeConfig(cfg);
      return interaction.reply({ content: `Canal de logs de membros configurado: ${channel}`, ephemeral: true });
    }

    if (sub === 'set-events-logs') {
      const channel = interaction.options.getChannel('channel');
      cfg[interaction.guildId].eventsLogsChannelId = channel.id;
      writeConfig(cfg);
      return interaction.reply({ content: `Canal de logs de eventos configurado: ${channel}`, ephemeral: true });
    }

    if (sub === 'show') {
      const g = cfg[interaction.guildId];
      if (!g) return interaction.reply({ content: 'Nenhuma configuração encontrada.', ephemeral: true });
  return interaction.reply({ content: `Configurações:\nLíder = ${g.leaderRoleId ? `<@&${g.leaderRoleId}>` : 'não definido'}\nConselheiro = ${g.conselheiroRoleId ? `<@&${g.conselheiroRoleId}>` : 'não definido'}\nCanal de atendimento = ${g.channelId ? `<#${g.channelId}>` : 'não definido'}\nCanal de transcripts = ${g.transcriptsChannelId ? `<#${g.transcriptsChannelId}>` : (g.logsChannelId ? `<#${g.logsChannelId}> (legacy)` : 'não definido')}\nCanal de membros = ${g.membersLogsChannelId ? `<#${g.membersLogsChannelId}>` : 'não definido'}\nCanal de eventos = ${g.eventsLogsChannelId ? `<#${g.eventsLogsChannelId}>` : 'não definido'}\nStaffVisible = ${g.allowStaffView === true}`, ephemeral: true });
    }
  }
};
