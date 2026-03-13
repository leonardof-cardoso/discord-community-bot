const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPanelConfig, setCategoryPerms, getCategoryPerms, clearCategoryPerms } = require('../utils/panelConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-perms')
    .setDescription('Define quem pode VER/ASSUMIR tickets por categoria')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('set')
      .setDescription('Define uma lista de cargos permitidos para a categoria')
      .addStringOption(o => o.setName('category').setDescription('ID da categoria do painel (ex: compras)').setRequired(true))
      .addStringOption(o => o.setName('roles_csv').setDescription('IDs de cargos separados por vírgula (ou mencione e cole os IDs)').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('set-min')
      .setDescription('Define um cargo mínimo: todos com cargo >= terão acesso')
      .addStringOption(o => o.setName('category').setDescription('ID da categoria').setRequired(true))
      .addRoleOption(o => o.setName('min_role').setDescription('Cargo mínimo').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('clear')
      .setDescription('Remove as permissões customizadas da categoria')
      .addStringOption(o => o.setName('category').setDescription('ID da categoria').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('show')
      .setDescription('Mostra as permissões da categoria')
      .addStringOption(o => o.setName('category').setDescription('ID da categoria').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Validar categoria existente
    const panel = getPanelConfig(guildId);
    const catId = interaction.options.getString('category');
    const exists = (panel.categories || []).some(c => c.id === catId);
    if (!exists) return interaction.reply({ ephemeral: true, content: `Categoria '${catId}' não existe. Use /ticket-panel list-categories para ver as disponíveis.` });

    if (sub === 'set') {
      const csv = interaction.options.getString('roles_csv', true);
      const ids = csv.split(',').map(s => s.trim().replace(/<@&|>/g, '')).filter(Boolean);
      setCategoryPerms(guildId, catId, { roles: ids });
      return interaction.reply({ ephemeral: true, content: `✅ Permissões da categoria '${catId}' definidas para cargos: ${ids.map(id => `<@&${id}>`).join(', ') || '(vazio)'}` });
    }

    if (sub === 'set-min') {
      const minRole = interaction.options.getRole('min_role', true);
      setCategoryPerms(guildId, catId, { roles: [], minRoleId: minRole.id });
      return interaction.reply({ ephemeral: true, content: `✅ Permissão mínima definida: a partir de ${minRole} terão acesso à categoria '${catId}'.` });
    }

    if (sub === 'clear') {
      clearCategoryPerms(guildId, catId);
      return interaction.reply({ ephemeral: true, content: `🧹 Permissões customizadas removidas da categoria '${catId}'.` });
    }

    if (sub === 'show') {
      const perms = getCategoryPerms(guildId, catId);
      const rolesText = (perms.roles || []).map(id => `<@&${id}>`).join(', ') || '(nenhum)';
      const minText = perms.minRoleId ? `<@&${perms.minRoleId}>` : '(não definido)';
      return interaction.reply({ ephemeral: true, content: `Permissões da categoria '${catId}':\n• Cargos específicos: ${rolesText}\n• Cargo mínimo: ${minText}` });
    }
  }
};
