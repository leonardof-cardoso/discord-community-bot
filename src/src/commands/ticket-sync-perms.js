const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } = require('discord.js');
const { getPanelConfig, getCategoryPerms } = require('../utils/panelConfig');
const { getTicketByChannel } = require('../utils/ticketsStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-sync-perms')
    .setDescription('🔄 Sincroniza as permissões dos tickets EXISTENTES com as configurações atuais')
    .addSubcommand(sc => sc
      .setName('categoria')
      .setDescription('Atualiza permissões de tickets de uma categoria específica')
      .addStringOption(o => o.setName('category').setDescription('ID da categoria (ex: bugs, duvidas)').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('todas')
      .setDescription('Atualiza permissões de TODOS os tickets existentes'))
    .addSubcommand(sc => sc
      .setName('canal')
      .setDescription('Atualiza permissões de um ticket específico')
      .addChannelOption(o => o.setName('ticket').setDescription('Canal do ticket').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = guild.id;
    
    // Função para aplicar permissões a um canal de ticket
    async function applyPermissionsToTicket(channel, ticketType, ownerUserId) {
      try {
        const everyone = guild.roles.everyone;
        const client = interaction.client;
        
        // Buscar permissões da categoria
        const catPerms = getCategoryPerms(guildId, ticketType);
        const rolesAllow = new Set(catPerms.roles || []);
        
        console.log(`[SYNC-PERMS] ${channel.name} - Tipo: ${ticketType}, Owner: ${ownerUserId}`);
        console.log(`[SYNC-PERMS] Permissões configuradas:`, catPerms);
        console.log(`[SYNC-PERMS] Cargos a adicionar: ${rolesAllow.size}`);
        
        // Se tem cargo mínimo, adicionar todos cargos acima dele
        let minRoleObj = catPerms.minRoleId ? guild.roles.cache.get(catPerms.minRoleId) : null;
        if (minRoleObj) {
          console.log(`[SYNC-PERMS] Cargo mínimo: ${minRoleObj.name}`);
          for (const [, role] of guild.roles.cache) {
            if (role.id === everyone.id) continue;
            if (role.position >= minRoleObj.position) rolesAllow.add(role.id);
          }
        }
        
        // Verificar se o dono ainda está no servidor
        let ownerMember = null;
        try {
          ownerMember = await guild.members.fetch(ownerUserId);
        } catch (e) {
          console.warn(`[SYNC-PERMS] Dono do ticket (${ownerUserId}) não está mais no servidor - pulando permissões do dono`);
        }
        
        // Construir array de permissões
        const permissionOverwrites = [
          {
            id: everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MentionEveryone
            ]
          }
        ];
        
        // Adicionar permissões do dono se ele ainda estiver no servidor
        if (ownerMember) {
          permissionOverwrites.push({
            id: ownerUserId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ],
            deny: [
              PermissionsBitField.Flags.MentionEveryone,
              PermissionsBitField.Flags.UseExternalEmojis,
              PermissionsBitField.Flags.UseExternalStickers
            ]
          });
        }
        
        // Adicionar permissões dos cargos configurados
        for (const roleId of rolesAllow) {
          const roleObj = guild.roles.cache.get(roleId);
          if (!roleObj) {
            console.warn(`[SYNC-PERMS] Cargo não encontrado: ${roleId}`);
            continue;
          }
          
          console.log(`[SYNC-PERMS] Adicionando cargo: ${roleObj.name} (${roleObj.id})`);
          permissionOverwrites.push({
            id: roleObj.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.MentionEveryone
            ]
          });
        }
        
        // Aplicar todas as permissões de uma vez
        await channel.permissionOverwrites.set(permissionOverwrites);
        console.log(`[SYNC-PERMS] ✅ ${channel.name} atualizado com sucesso`);
        
        return true;
      } catch (error) {
        console.error(`[SYNC-PERMS] ❌ Erro ao atualizar ${channel.name}:`, error.message);
        console.error(`[SYNC-PERMS] Stack:`, error.stack);
        return false;
      }
    }
    
    if (subcommand === 'canal') {
      const channel = interaction.options.getChannel('ticket');
      
      // Verificar se é um ticket válido
      const ticketData = getTicketByChannel(guildId, channel.id);
      if (!ticketData) {
        return interaction.editReply('❌ Este canal não é um ticket registrado.');
      }
      
      const success = await applyPermissionsToTicket(channel, ticketData.type, ticketData.openerId);
      
      if (success) {
        return interaction.editReply(`✅ Permissões do ticket ${channel} foram atualizadas com sucesso!`);
      } else {
        return interaction.editReply(`❌ Erro ao atualizar permissões do ticket ${channel}.`);
      }
    }
    
    if (subcommand === 'categoria') {
      const categoryId = interaction.options.getString('category');
      
      // Validar se a categoria existe
      const panel = getPanelConfig(guildId);
      const categoryExists = (panel.categories || []).some(c => c.id === categoryId);
      if (!categoryExists) {
        return interaction.editReply(`❌ Categoria '${categoryId}' não encontrada. Use /ticket-panel list-categories para ver as disponíveis.`);
      }
      
      // Buscar todos os canais de ticket dessa categoria
      const fs = require('fs');
      const path = require('path');
      const ticketsPath = path.join(__dirname, '..', '..', 'tickets.json');
      
      let ticketsData = {};
      try {
        ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8') || '{}');
      } catch (e) {
        return interaction.editReply('❌ Erro ao ler dados de tickets.');
      }
      
      const guildData = ticketsData[guildId];
      if (!guildData || !guildData.byChannel) {
        return interaction.editReply('❌ Nenhum ticket encontrado neste servidor.');
      }
      
      let updated = 0;
      let errors = 0;
      let notFound = 0;
      
      for (const [channelId, ticketData] of Object.entries(guildData.byChannel)) {
        if (ticketData.type !== categoryId) continue;
        
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          notFound++;
          continue;
        }
        
        const success = await applyPermissionsToTicket(channel, ticketData.type, ticketData.openerId);
        if (success) {
          updated++;
        } else {
          errors++;
        }
        
        // Delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      return interaction.editReply(
        `✅ **Sincronização concluída para categoria '${categoryId}':**\n` +
        `✅ Atualizados: ${updated}\n` +
        `❌ Erros: ${errors}\n` +
        `⚠️ Canais não encontrados: ${notFound}`
      );
    }
    
    if (subcommand === 'todas') {
      // Confirmar que realmente quer atualizar tudo
      const fs = require('fs');
      const path = require('path');
      const ticketsPath = path.join(__dirname, '..', '..', 'tickets.json');
      
      let ticketsData = {};
      try {
        ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8') || '{}');
      } catch (e) {
        return interaction.editReply('❌ Erro ao ler dados de tickets.');
      }
      
      const guildData = ticketsData[guildId];
      if (!guildData || !guildData.byChannel) {
        return interaction.editReply('❌ Nenhum ticket encontrado neste servidor.');
      }
      
      const totalTickets = Object.keys(guildData.byChannel).length;
      await interaction.editReply(`🔄 Iniciando sincronização de **${totalTickets} tickets**...\nIsso pode levar alguns minutos.`);
      
      let updated = 0;
      let errors = 0;
      let notFound = 0;
      const stats = {};
      
      for (const [channelId, ticketData] of Object.entries(guildData.byChannel)) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          notFound++;
          continue;
        }
        
        const success = await applyPermissionsToTicket(channel, ticketData.type, ticketData.openerId);
        if (success) {
          updated++;
          stats[ticketData.type] = (stats[ticketData.type] || 0) + 1;
        } else {
          errors++;
        }
        
        // Atualizar progresso a cada 10 tickets
        if ((updated + errors + notFound) % 10 === 0) {
          await interaction.editReply(
            `🔄 Sincronizando... ${updated + errors + notFound}/${totalTickets}\n` +
            `✅ Atualizados: ${updated} | ❌ Erros: ${errors}`
          );
        }
        
        // Delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Relatório final
      let report = `✅ **Sincronização completa:**\n` +
                   `✅ Atualizados: ${updated}\n` +
                   `❌ Erros: ${errors}\n` +
                   `⚠️ Canais não encontrados: ${notFound}\n\n`;
      
      if (Object.keys(stats).length > 0) {
        report += `📊 **Por categoria:**\n`;
        for (const [type, count] of Object.entries(stats)) {
          report += `• ${type}: ${count}\n`;
        }
      }
      
      return interaction.editReply(report);
    }
  }
};
