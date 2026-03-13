const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { checkInactiveTickets } = require('../utils/ticketInactivity');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verificar-inativos')
    .setDescription('Verifica e fecha tickets inativos manualmente')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const closedTickets = await checkInactiveTickets(interaction.client);
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Verificação de Tickets Inativos')
        .setColor(0x3498db)
        .setTimestamp();
      
      if (closedTickets.length === 0) {
        embed.setDescription('Nenhum ticket inativo encontrado para fechar.');
      } else {
        embed.setDescription(`${closedTickets.length} ticket(s) fechado(s) por inatividade:`);
        
        for (const ticket of closedTickets) {
          embed.addFields({
            name: `Ticket #${ticket.ticketNumber || 'N/A'}`,
            value: `Canal: ${ticket.channelName}\nUsuário: ${ticket.username}\nTempo inativo: ${ticket.inactiveTime}`,
            inline: false
          });
        }
      }
      
      // Estatísticas do sistema
      const inactiveTicketsPath = path.join(__dirname, '../../inactive-tickets.json');
      let totalTracked = 0;
      
      if (fs.existsSync(inactiveTicketsPath)) {
        const data = JSON.parse(fs.readFileSync(inactiveTicketsPath, 'utf8'));
        const guildData = data[interaction.guild.id] || {};
        totalTracked = Object.keys(guildData).length;
      }
      
      embed.setFooter({ text: `${totalTracked} tickets sendo rastreados atualmente` });
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Erro ao verificar tickets inativos:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao verificar tickets inativos.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};