const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Define um cargo para ser atribuído automaticamente a novos membros')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('set')
      .setDescription('Define o cargo que será atribuído automaticamente aos novos membros')
      .addRoleOption(o => o.setName('role').setDescription('Cargo a ser atribuído automaticamente').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('off')
      .setDescription('Desativa a atribuição automática de cargo a novos membros'))
    .addSubcommand(sc => sc
      .setName('show')
      .setDescription('Mostra a configuração atual do autorole')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};
    const g = cfg[interaction.guildId];

    if (sub === 'set') {
      const role = interaction.options.getRole('role');
      // Validar se o cargo pertence a este servidor
      if (!interaction.guild.roles.cache.has(role.id)) {
        return interaction.reply({ content: '❌ Cargo inválido.', ephemeral: true });
      }
      g.autoRoleId = role.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Autorole configurado: novos membros receberão o cargo ${role}.`, ephemeral: true });
    }

    if (sub === 'off') {
      g.autoRoleId = null;
      writeConfig(cfg);
      return interaction.reply({ content: '✅ Autorole desativado.', ephemeral: true });
    }

    if (sub === 'show') {
      const current = g.autoRoleId ? `<@&${g.autoRoleId}>` : 'não definido';
      return interaction.reply({ content: `📌 Autorole: ${current}`, ephemeral: true });
    }
  }
};
