const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { migrateOldTickets } = require('../utils/ticketsStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('migrar-tickets')
    .setDescription('Migra dados de tickets antigos para o sistema de ranking')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;

    try {
      const result = migrateOldTickets(guildId);

      const embed = new EmbedBuilder()
        .setTitle('🔄 Migração de Tickets Concluída')
        .setDescription(result.message)
        .addFields(
          { name: '📊 Tickets Processados', value: `${result.migrated}`, inline: true },
          { name: '👥 Usuários Únicos', value: `${result.totalUsers}`, inline: true }
        )
        .setColor(0x00ff00)
        .setFooter({ 
          text: 'Agora você pode usar os comandos de ranking com todos os dados históricos!',
          iconURL: interaction.guild.iconURL()
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Erro na migração:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro na Migração')
        .setDescription('Ocorreu um erro ao migrar os dados dos tickets antigos.')
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};