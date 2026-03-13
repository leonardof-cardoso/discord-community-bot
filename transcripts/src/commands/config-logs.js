const { SlashCommandBuilder } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-logs')
    .setDescription('Configura o registro de eventos: edits, deletes e voice state')
    .addSubcommand(sub => sub.setName('set').setDescription('Ativa/desativa logs de eventos').addBooleanOption(o => o.setName('edits').setDescription('Log de mensagens editadas').setRequired(true)).addBooleanOption(o => o.setName('deletes').setDescription('Log de mensagens deletadas').setRequired(true)).addBooleanOption(o => o.setName('voice').setDescription('Log de entrada/saída em voice').setRequired(true)))
    .addSubcommand(sub => sub.setName('show').setDescription('Mostra configuração atual')),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Permissão negada.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};

    if (sub === 'set') {
      const edits = interaction.options.getBoolean('edits');
      const deletes = interaction.options.getBoolean('deletes');
      const voice = interaction.options.getBoolean('voice');
      cfg[interaction.guildId].logEdits = !!edits;
      cfg[interaction.guildId].logDeletes = !!deletes;
      cfg[interaction.guildId].logVoice = !!voice;
      writeConfig(cfg);
      return interaction.reply({ content: `Logs atualizados. edits=${edits} deletes=${deletes} voice=${voice}`, ephemeral: true });
    }

    if (sub === 'show') {
      const g = cfg[interaction.guildId] || {};
      return interaction.reply({ content: `Logs: edits=${g.logEdits === true} deletes=${g.logDeletes === true} voice=${g.logVoice === true}
Canal de logs: ${g.logsChannelId ? `<#${g.logsChannelId}>` : 'não definido'}`, ephemeral: true });
    }
  }
};
