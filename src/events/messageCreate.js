const { Events } = require('discord.js');
const { getOpenTicket } = require('../utils/ticketsStore');
const { trackTicketActivity } = require('../utils/ticketInactivity');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Ignorar mensagens de bots
    if (message.author.bot) return;

    // Verificar se a mensagem foi enviada em um canal de ticket
    const ticket = getOpenTicket(message.guild.id, null, message.channel.id);
    
    if (ticket) {
      // Se o autor da mensagem é o mesmo que abriu o ticket, rastrear interação
      if (message.author.id === ticket.openerId) {
        trackTicketActivity(message.guild.id, message.channel.id, message.author.id, message.content);
      }
    }
  },
};