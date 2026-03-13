const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTopPlayers } = require('../utils/ticketsStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top-tickets')
    .setDescription('Mostra o top 10 usuários que mais abriram tickets')
    .addIntegerOption(option =>
      option
        .setName('quantidade')
        .setDescription('Quantos usuários mostrar (padrão: 10, máximo: 20)')
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const quantidade = interaction.options.getInteger('quantidade') || 10;
    const guildId = interaction.guild.id;
    const topPlayers = getTopPlayers(guildId, quantidade);

    if (!topPlayers || topPlayers.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setTitle('🏆 Top Tickets')
        .setDescription('❌ Ainda não há dados de tickets para mostrar.')
        .setColor(0xff6b6b)
        .setTimestamp();

      return await interaction.editReply({ embeds: [noDataEmbed] });
    }

    // Criar descrição do ranking
    let description = '';
    topPlayers.forEach((player, index) => {
      const position = index + 1;
      let medal = '';
      
      if (position === 1) medal = '🥇';
      else if (position === 2) medal = '🥈';
      else if (position === 3) medal = '🥉';
      else medal = `**${position}°**`;

      const lastTicket = player.lastTicketAt ? 
        `<t:${Math.floor(player.lastTicketAt / 1000)}:R>` : 
        'Nunca';

      description += `${medal} **${player.username}** - ${player.totalTickets} tickets\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Top Players - Tickets')
      .setDescription(description)
      .setColor(0xf39c12)
      .setFooter({ 
        text: `Mostrando top ${topPlayers.length} • ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};