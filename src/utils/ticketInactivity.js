const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { readConfig } = require('./config');

const INACTIVE_TICKETS_PATH = path.join(__dirname, '..', '..', 'inactive-tickets.json');

function readInactiveTickets() {
  try {
    return JSON.parse(fs.readFileSync(INACTIVE_TICKETS_PATH, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

function writeInactiveTickets(data) {
  fs.writeFileSync(INACTIVE_TICKETS_PATH, JSON.stringify(data, null, 2));
}

function trackTicketActivity(guildId, channelId, userId, messageContent = null) {
  const inactiveTickets = readInactiveTickets();
  inactiveTickets[guildId] = inactiveTickets[guildId] || {};
  
  // Atualizar atividade do ticket
  inactiveTickets[guildId][channelId] = {
    lastActivity: Date.now(),
    ownerId: userId,
    lastMessage: messageContent ? messageContent.slice(0, 100) : null,
    warningsSent: 0,
    isTracked: true
  };
  
  writeInactiveTickets(inactiveTickets);
}

function removeTicketTracking(guildId, channelId) {
  const inactiveTickets = readInactiveTickets();
  if (inactiveTickets[guildId] && inactiveTickets[guildId][channelId]) {
    delete inactiveTickets[guildId][channelId];
    writeInactiveTickets(inactiveTickets);
  }
}

function getInactiveTickets(guildId) {
  const inactiveTickets = readInactiveTickets();
  if (!inactiveTickets[guildId]) return [];
  
  // Obter configurações do servidor
  const config = readConfig();
  const guildConfig = config[guildId] || {};
  const inactivityConfig = guildConfig.inactivity || { enabled: true, timeoutHours: 10, warningHours: 2 };
  
  // Se o sistema estiver desativado, não retornar tickets inativos
  if (!inactivityConfig.enabled) return [];
  
  const now = Date.now();
  const inactive = [];
  const timeoutMs = inactivityConfig.timeoutHours * 60 * 60 * 1000;
  
  for (const [channelId, data] of Object.entries(inactiveTickets[guildId])) {
    if (!data.isTracked) continue;
    
    const timeSinceLastActivity = now - data.lastActivity;
    
    // Verificar se está inativo há mais tempo que o configurado
    if (timeSinceLastActivity >= timeoutMs) {
      inactive.push({
        channelId,
        ownerId: data.ownerId,
        lastActivity: data.lastActivity,
        timeSinceLastActivity,
        warningsSent: data.warningsSent || 0,
        lastMessage: data.lastMessage
      });
    }
  }
  
  return inactive;
}

function getTicketsNearInactivity(guildId) {
  const inactiveTickets = readInactiveTickets();
  if (!inactiveTickets[guildId]) return [];
  
  // Obter configurações do servidor
  const config = readConfig();
  const guildConfig = config[guildId] || {};
  const inactivityConfig = guildConfig.inactivity || { enabled: true, timeoutHours: 10, warningHours: 2 };
  
  // Se o sistema estiver desativado ou avisos desativados, não retornar tickets
  if (!inactivityConfig.enabled || inactivityConfig.warningHours <= 0) return [];
  
  const now = Date.now();
  const nearInactive = [];
  const timeoutMs = inactivityConfig.timeoutHours * 60 * 60 * 1000;
  const warningTimeMs = timeoutMs - (inactivityConfig.warningHours * 60 * 60 * 1000);
  
  for (const [channelId, data] of Object.entries(inactiveTickets[guildId])) {
    if (!data.isTracked) continue;
    
    const timeSinceLastActivity = now - data.lastActivity;
    const warningsSent = data.warningsSent || 0;
    
    // Enviar aviso se atingiu o tempo de aviso e ainda não foi avisado
    if (timeSinceLastActivity >= warningTimeMs && timeSinceLastActivity < timeoutMs && warningsSent === 0) {
      nearInactive.push({
        channelId,
        ownerId: data.ownerId,
        lastActivity: data.lastActivity,
        timeSinceLastActivity,
        warningsSent
      });
    }
  }
  
  return nearInactive;
}

function markWarningAsSent(guildId, channelId) {
  const inactiveTickets = readInactiveTickets();
  if (inactiveTickets[guildId] && inactiveTickets[guildId][channelId]) {
    inactiveTickets[guildId][channelId].warningsSent = 1;
    inactiveTickets[guildId][channelId].lastWarning = Date.now();
    writeInactiveTickets(inactiveTickets);
  }
}

async function closeInactiveTicket(client, guildId, ticketInfo) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    
    const channel = guild.channels.cache.get(ticketInfo.channelId);
    if (!channel) {
      // Canal não existe mais, remover tracking
      removeTicketTracking(guildId, ticketInfo.channelId);
      return false;
    }
    
    // Verificar se é realmente um canal de ticket
    const isTicketChannel = (
      channel.parent?.name?.includes('📂') || 
      channel.name.includes('ticket') || 
      channel.name.match(/^[a-z]+-[a-zA-Z0-9]+/) ||
      channel.topic?.includes('ticket')
    );
    
    if (!isTicketChannel) {
      removeTicketTracking(guildId, ticketInfo.channelId);
      return false;
    }
    
    // Enviar mensagem de fechamento por inatividade
    const closeEmbed = new EmbedBuilder()
      .setTitle('⏰ Ticket Fechado por Inatividade')
      .setColor(0xff9500)
      .setDescription(
        `Este ticket foi **automaticamente fechado** devido à inatividade.\n\n` +
        `🕐 **Tempo sem atividade:** ${Math.floor(ticketInfo.timeSinceLastActivity / (1000 * 60 * 60))} horas\n` +
        `👤 **Proprietário:** <@${ticketInfo.ownerId}>\n` +
        `📅 **Última atividade:** <t:${Math.floor(ticketInfo.lastActivity / 1000)}:R>\n\n` +
        `💡 **Para futuras dúvidas, abra um novo ticket.**`
      )
      .setFooter({ text: 'Sistema automático de limpeza • Fechamento por inatividade' })
      .setTimestamp();
    
    await channel.send({ embeds: [closeEmbed] });
    
    // Remover tracking antes de fechar
    removeTicketTracking(guildId, ticketInfo.channelId);
    
    // Simular fechamento do ticket (usar a mesma lógica do botão de fechar)
    const closeTicketWithRating = require('../events/interactionCreate').closeTicketWithRating;
    if (closeTicketWithRating) {
      await closeTicketWithRating(channel, 'Sistema Automático', null);
    } else {
      // Fallback: deletar canal após 5 segundos
      setTimeout(async () => {
        try {
          await channel.delete('Ticket fechado por inatividade');
        } catch (e) {
          console.error('Erro ao deletar canal inativo:', e);
        }
      }, 5000);
    }
    
    console.log(`[AUTO-CLOSE] Ticket ${channel.name} fechado por inatividade (${Math.floor(ticketInfo.timeSinceLastActivity / (1000 * 60 * 60))}h)`);
    return true;
    
  } catch (error) {
    console.error('Erro ao fechar ticket inativo:', error);
    return false;
  }
}

async function sendInactivityWarning(client, guildId, ticketInfo) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    
    const channel = guild.channels.cache.get(ticketInfo.channelId);
    if (!channel) {
      removeTicketTracking(guildId, ticketInfo.channelId);
      return false;
    }
    
    const timeRemaining = INACTIVITY_TIMEOUT - ticketInfo.timeSinceLastActivity;
    const hoursRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60));
    
    const warningEmbed = new EmbedBuilder()
      .setTitle('⚠️ Aviso de Inatividade')
      .setColor(0xff9500)
      .setDescription(
        `⏰ **Este ticket será fechado automaticamente em ${hoursRemaining} hora(s)** por falta de atividade.\n\n` +
        `📨 **Para manter o ticket ativo:**\n` +
        `• Envie qualquer mensagem neste canal\n` +
        `• Responda às perguntas da staff\n` +
        `• Forneça informações adicionais\n\n` +
        `💡 **Dica:** Se seu problema foi resolvido, você pode fechar o ticket manualmente.`
      )
      .addFields(
        { name: '👤 Proprietário', value: `<@${ticketInfo.ownerId}>`, inline: true },
        { name: '🕐 Última atividade', value: `<t:${Math.floor(ticketInfo.lastActivity / 1000)}:R>`, inline: true },
        { name: '⏳ Tempo restante', value: `${hoursRemaining} hora(s)`, inline: true }
      )
      .setFooter({ text: 'Sistema automático de limpeza • Responda para manter ativo' })
      .setTimestamp();
    
    await channel.send({ 
      content: `<@${ticketInfo.ownerId}>`,
      embeds: [warningEmbed],
      allowedMentions: { users: [ticketInfo.ownerId] }
    });
    
    markWarningAsSent(guildId, ticketInfo.channelId);
    console.log(`[AUTO-CLOSE] Aviso de inatividade enviado para ${channel.name}`);
    return true;
    
  } catch (error) {
    console.error('Erro ao enviar aviso de inatividade:', error);
    return false;
  }
}

// Função principal que verifica tickets inativos
async function checkInactiveTickets(client) {
  try {
    for (const guild of client.guilds.cache.values()) {
      // Verificar tickets que devem ser fechados
      const inactiveTickets = getInactiveTickets(guild.id);
      for (const ticket of inactiveTickets) {
        await closeInactiveTicket(client, guild.id, ticket);
        // Pequeno delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Verificar tickets que devem receber aviso
      const nearInactiveTickets = getTicketsNearInactivity(guild.id);
      for (const ticket of nearInactiveTickets) {
        await sendInactivityWarning(client, guild.id, ticket);
        // Pequeno delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Erro na verificação de tickets inativos:', error);
  }
}

module.exports = {
  trackTicketActivity,
  removeTicketTracking,
  getInactiveTickets,
  getTicketsNearInactivity,
  closeInactiveTicket,
  sendInactivityWarning,
  checkInactiveTickets,
  readInactiveTickets,
  trackInteraction: trackTicketActivity
};