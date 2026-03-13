const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { trackTicketActivity, readInactiveTickets } = require('../utils/ticketInactivity');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inatividade-debug')
    .setDescription('Comandos de debug para o sistema de inatividade de tickets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('simular')
        .setDescription('Simula um ticket inativo para teste')
        .addChannelOption(option =>
          option.setName('canal')
            .setDescription('Canal do ticket para simular inatividade')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('listar')
        .setDescription('Lista todos os tickets sendo rastreados'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reseta o tempo de inatividade de um ticket')
        .addChannelOption(option =>
          option.setName('canal')
            .setDescription('Canal do ticket para resetar')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      if (subcommand === 'simular') {
        const channel = interaction.options.getChannel('canal');
        
        // Simular um ticket inativo (mais de 10 horas atrás)
        const elevenHoursAgo = Date.now() - (11 * 60 * 60 * 1000);
        
        const inactiveTicketsPath = path.join(__dirname, '../../inactive-tickets.json');
        let data = {};
        if (fs.existsSync(inactiveTicketsPath)) {
          data = JSON.parse(fs.readFileSync(inactiveTicketsPath, 'utf8'));
        }
        
        const guildId = interaction.guild.id;
        if (!data[guildId]) data[guildId] = {};
        
        data[guildId][channel.id] = {
          ownerId: interaction.user.id,
          lastActivity: elevenHoursAgo,
          warningsSent: 0,
          isTracked: true,
          lastMessage: 'Mensagem simulada para teste'
        };
        
        fs.writeFileSync(inactiveTicketsPath, JSON.stringify(data, null, 2));
        
        const embed = new EmbedBuilder()
          .setTitle('🧪 Simulação Criada')
          .setDescription(`Ticket ${channel} foi marcado como inativo há 11 horas.`)
          .setColor(0xffa500);
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'listar') {
        const inactiveTickets = readInactiveTickets();
        const guildData = inactiveTickets[interaction.guild.id] || {};
        
        const embed = new EmbedBuilder()
          .setTitle('📋 Tickets Rastreados')
          .setColor(0x3498db);
        
        if (Object.keys(guildData).length === 0) {
          embed.setDescription('Nenhum ticket está sendo rastreado no momento.');
        } else {
          let description = '';
          for (const [channelId, data] of Object.entries(guildData)) {
            const channel = interaction.guild.channels.cache.get(channelId);
            const user = interaction.guild.members.cache.get(data.ownerId);
            const timeDiff = Date.now() - data.lastActivity;
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            description += `**${channel ? channel.name : `Canal ${channelId}`}**\n`;
            description += `Usuário: ${user ? user.user.username : 'Desconhecido'}\n`;
            description += `Inativo há: ${hours}h ${minutes}m\n`;
            description += `Avisos: ${data.warningsSent}\n\n`;
          }
          embed.setDescription(description);
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'reset') {
        const channel = interaction.options.getChannel('canal');
        
        // Resetar o tempo de interação
        trackTicketActivity(interaction.guild.id, channel.id, interaction.user.id);
        
        const embed = new EmbedBuilder()
          .setTitle('🔄 Tempo Resetado')
          .setDescription(`O tempo de inatividade do ticket ${channel} foi resetado.`)
          .setColor(0x00ff00);
        
        await interaction.editReply({ embeds: [embed] });
      }
      
    } catch (error) {
      console.error('Erro no comando inatividade-debug:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao executar o comando.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};