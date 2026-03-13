const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTopPlayers, getUserStats, migrateOldTickets } = require('../utils/ticketsStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking-tickets')
    .setDescription('Mostra o ranking de usuários que mais abriram tickets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Mostra o top de usuários que mais abriram tickets')
        .addIntegerOption(option =>
          option
            .setName('limite')
            .setDescription('Quantos usuários mostrar no ranking (padrão: 10, máximo: 25)')
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('usuario')
        .setDescription('Mostra as estatísticas de um usuário específico')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('O usuário para verificar as estatísticas')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'top') {
      const limite = interaction.options.getInteger('limite') || 10;
      const topPlayers = getTopPlayers(guildId, limite);

      if (!topPlayers || topPlayers.length === 0) {
        const noDataEmbed = new EmbedBuilder()
          .setTitle('📊 Ranking de Tickets')
          .setDescription('❌ Ainda não há dados de tickets neste servidor.\n\n🔄 **Dica:** Use `/migrar-tickets` para processar tickets antigos ou aguarde novos tickets serem criados.')
          .setColor(0xff6b6b)
          .setTimestamp();

        const migrateButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('migrate_old_tickets')
              .setLabel('🔄 Migrar Tickets Antigos')
              .setStyle(ButtonStyle.Primary)
          );

        return await interaction.editReply({ 
          embeds: [noDataEmbed],
          components: [migrateButton]
        });
      }

      // Emojis para o pódio
      const medals = ['🥇', '🥈', '🥉'];
      
      const rankingFields = topPlayers.map((player, index) => {
        const position = index + 1;
        const medal = position <= 3 ? medals[index] : `${position}°`;
        const lastTicket = player.lastTicketAt ? 
          `<t:${Math.floor(player.lastTicketAt / 1000)}:R>` : 
          'Nunca';

        return {
          name: `${medal} ${player.username}`,
          value: `**Tickets:** ${player.totalTickets}\n**Último ticket:** ${lastTicket}`,
          inline: true
        };
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking de Tickets')
        .setDescription(`Top ${limite} usuários que mais abriram tickets no servidor:`)
        .addFields(rankingFields)
        .setColor(0x3498db)
        .setFooter({ 
          text: `Total de ${topPlayers.length} usuários • Atualizado`,
          iconURL: interaction.guild.iconURL()
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (subcommand === 'usuario') {
      const user = interaction.options.getUser('usuario');
      const userStats = getUserStats(guildId, user.id);

      if (!userStats) {
        const noStatsEmbed = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Tickets')
          .setDescription(`❌ O usuário ${user} ainda não abriu nenhum ticket neste servidor.`)
          .setColor(0xff6b6b)
          .setTimestamp();

        return await interaction.editReply({ embeds: [noStatsEmbed] });
      }

      // Calcular posição no ranking
      const allPlayers = getTopPlayers(guildId, 1000); // Pegar todos para calcular posição
      const userPosition = allPlayers.findIndex(player => player.userId === user.id) + 1;

      const lastTicket = userStats.lastTicketAt ? 
        `<t:${Math.floor(userStats.lastTicketAt / 1000)}:F>` : 
        'Nunca';
      
      const lastTicketRelative = userStats.lastTicketAt ? 
        `<t:${Math.floor(userStats.lastTicketAt / 1000)}:R>` : 
        'Nunca';

      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas de Tickets')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Usuário', value: `${user}`, inline: true },
          { name: '🎫 Total de Tickets', value: `${userStats.totalTickets}`, inline: true },
          { name: '🏆 Posição no Ranking', value: `#${userPosition}`, inline: true },
          { name: '🕒 Último Ticket', value: lastTicket, inline: false },
          { name: '⏰ Há quanto tempo', value: lastTicketRelative, inline: true }
        )
        .setColor(0x3498db)
        .setFooter({ 
          text: `Estatísticas de ${userStats.username}`,
          iconURL: interaction.guild.iconURL()
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};