const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats-tickets')
    .setDescription('Mostra estatísticas gerais dos tickets do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    
    try {
      // Ler dados do arquivo de tickets
      const ticketsPath = path.join(__dirname, '..', '..', 'tickets.json');
      const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8') || '{}');
      
      if (!ticketsData[guildId]) {
        const noDataEmbed = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Tickets')
          .setDescription('❌ Ainda não há dados de tickets neste servidor.')
          .setColor(0xff6b6b)
          .setTimestamp();

        return await interaction.editReply({ embeds: [noDataEmbed] });
      }

      const guildData = ticketsData[guildId];
      
      // Estatísticas básicas
      const activeTickets = Object.keys(guildData.byChannel || {}).length;
      const totalUsers = Object.keys(guildData.userStats || {}).length;
      const historyCount = (guildData.history || []).length;
      const nextTicketId = guildData.nextTicketId || 1;
      const totalTicketsCreated = nextTicketId - 1;

      // Calcular tickets por categoria
      const ticketsByType = {};
      
      // Tickets ativos
      Object.values(guildData.byChannel || {}).forEach(ticket => {
        const type = ticket.type || 'unknown';
        ticketsByType[type] = (ticketsByType[type] || 0) + 1;
      });

      // Tickets do histórico
      (guildData.history || []).forEach(ticket => {
        const type = ticket.type || 'unknown';
        ticketsByType[type] = (ticketsByType[type] || 0) + 1;
      });

      // Encontrar categoria mais popular
      const mostPopularType = Object.entries(ticketsByType)
        .sort(([,a], [,b]) => b - a)[0];

      // Calcular média de tickets por usuário
      const avgTicketsPerUser = totalUsers > 0 ? (totalTicketsCreated / totalUsers).toFixed(1) : '0';

      // Calcular atividade recente (últimos 7 dias)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentTickets = (guildData.history || []).filter(ticket => 
        ticket.createdAt && ticket.createdAt > sevenDaysAgo
      ).length;

      // Construir embed
      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas Gerais - Tickets')
        .setColor(0x3498db)
        .addFields(
          { name: '🎫 Tickets Ativos', value: `${activeTickets}`, inline: true },
          { name: '📈 Total Criados', value: `${totalTicketsCreated}`, inline: true },
          { name: '📋 Histórico', value: `${historyCount}`, inline: true },
          { name: '👥 Usuários Únicos', value: `${totalUsers}`, inline: true },
          { name: '📊 Média por Usuário', value: `${avgTicketsPerUser}`, inline: true },
          { name: '🕒 Últimos 7 dias', value: `${recentTickets}`, inline: true }
        );

      if (mostPopularType) {
        embed.addFields({
          name: '🏆 Categoria Mais Popular',
          value: `${mostPopularType[0]} (${mostPopularType[1]} tickets)`,
          inline: false
        });
      }

      // Adicionar breakdown por categoria se houver dados
      if (Object.keys(ticketsByType).length > 0) {
        let categoryBreakdown = '';
        Object.entries(ticketsByType)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5) // Top 5 categorias
          .forEach(([type, count]) => {
            categoryBreakdown += `• **${type}**: ${count} tickets\n`;
          });

        if (categoryBreakdown) {
          embed.addFields({
            name: '📑 Top Categorias',
            value: categoryBreakdown,
            inline: false
          });
        }
      }

      embed.setFooter({ 
        text: `Servidor: ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Erro ao carregar estatísticas de tickets:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao carregar as estatísticas de tickets.')
        .setColor(0xff6b6b)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};