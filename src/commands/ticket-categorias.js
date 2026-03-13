const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getPanelConfig } = require('../utils/panelConfig');
const { getTicketByChannel } = require('../utils/ticketsStore');

// Função para criar labels amigáveis para tipos de ticket
function getTicketTypeLabel(ticketType, configuredCategories = []) {
  // Primeiro: verificar se há configuração específica
  const configured = configuredCategories.find(c => c.id === ticketType);
  if (configured) return configured.label;
  
  // Segundo: mapear tipos comuns para nomes amigáveis
  const commonMappings = {
    'bug': 'Bugs',
    'bugs': 'Bugs',
    'denuncia': 'Denúncias',
    'denuncias': 'Denúncias',
    'appeal': 'Appeals',
    'appeals': 'Appeals',
    'suporte': 'Suporte',
    'ajuda': 'Ajuda',
    'duvida': 'Dúvidas',
    'duvidas': 'Dúvidas',
    'compra': 'Compras',
    'compras': 'Compras',
    'venda': 'Vendas',
    'vendas': 'Vendas',
    'revisao': 'Revisões',
    'revisoes': 'Revisões',
    'ouvidoria': 'Ouvidoria',
    'keys_vips': 'Keys VIPs',
    'confirma_faccao': 'Confirmação de Facção',
    'bugs_urgentes': 'Bugs Urgentes',
    'revisoes_lideres': 'Revisões de Líderes',
    'ticket': 'Tickets Gerais',
    'geral': 'Geral',
    'outros': 'Outros'
  };
  
  if (commonMappings[ticketType.toLowerCase()]) {
    return commonMappings[ticketType.toLowerCase()];
  }
  
  // Terceiro: transformar o ID em um nome legível
  return ticketType.charAt(0).toUpperCase() + ticketType.slice(1).replace(/_/g, ' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-categorias')
    .setDescription('Gerencia as categorias dos tickets no Discord')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sc => sc
      .setName('criar-todas')
      .setDescription('Cria todas as categorias baseadas nas configurações do painel'))
    .addSubcommand(sc => sc
      .setName('organizar')
      .setDescription('Move todos os tickets para suas respectivas categorias'))
    .addSubcommand(sc => sc
      .setName('limpar-vazias')
      .setDescription('Remove categorias de ticket que estão vazias'))
    .addSubcommand(sc => sc
      .setName('listar')
      .setDescription('Lista todas as categorias de ticket e quantos canais tem em cada'))
    .addSubcommand(sc => sc
      .setName('corrigir-permissoes')
      .setDescription('🚨 EMERGÊNCIA: BLOQUEIA categorias que estão públicas'))
    .addSubcommand(sc => sc
      .setName('estatisticas')
      .setDescription('📊 Mostra estatísticas completas de tickets resolvidos por categoria')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (sub === 'criar-todas') {
      await interaction.deferReply({ ephemeral: true });
      
      const panelConfig = getPanelConfig(guildId);
      const configuredCategories = panelConfig.categories || [];
      
      // Buscar também tipos de tickets existentes no store
      const { readConfig } = require('../utils/config');
      const fs = require('fs');
      const path = require('path');
      const ticketsPath = path.join(__dirname, '..', '..', 'tickets.json');
      
      let allTicketTypes = new Set();
      
      // Adicionar categorias configuradas
      configuredCategories.forEach(cat => allTicketTypes.add(cat.id));
      
      // Buscar tipos de tickets já criados no store
      try {
        const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8') || '{}');
        const guildData = ticketsData[guildId];
        if (guildData && guildData.byChannel) {
          Object.values(guildData.byChannel).forEach(ticket => {
            if (ticket.type) allTicketTypes.add(ticket.type);
          });
        }
      } catch (e) {
        console.log('Nenhum dado de tickets encontrado ou erro ao ler:', e.message);
      }
      
      if (allTicketTypes.size === 0) {
        return interaction.editReply('❌ Nenhuma categoria encontrada. Configure o painel ou crie alguns tickets primeiro.');
      }

      let created = 0;
      let existing = 0;

      for (const ticketType of allTicketTypes) {
        const categoryLabel = getTicketTypeLabel(ticketType, configuredCategories);
        const categoryName = `📂 ${categoryLabel}`;
        
        const existingCategory = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name === categoryName
        );

        if (existingCategory) {
          existing++;
        } else {
          try {
            // CORRIGIDO: Categoria BLOQUEADA, canais individuais têm permissões específicas
            const everyone = guild.roles.everyone;
            await guild.channels.create({
              name: categoryName,
              type: ChannelType.GuildCategory,
              position: 0,
              permissionOverwrites: [
                {
                  id: everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel] // BLOQUEAR CATEGORIA
                },
                {
                  id: guild.members.me.id,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                }
              ]
            });
            created++;
          } catch (error) {
            console.error(`Erro ao criar categoria ${categoryName}:`, error);
          }
        }
      }

      return interaction.editReply(`✅ **Categorias processadas:**\n📂 Criadas: ${created}\n✅ Já existiam: ${existing}\n📊 Total de tipos: ${allTicketTypes.size}`);
    }

    if (sub === 'organizar') {
      await interaction.deferReply({ ephemeral: true });
      
      // Buscar todos os canais que parecem ser tickets
      const allChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
      const ticketChannels = [];

      for (const [, channel] of allChannels) {
        // Verificar se é um ticket pelo store
        const ticketInfo = getTicketByChannel(guildId, channel.id);
        if (ticketInfo) {
          ticketChannels.push({ channel, type: ticketInfo.type });
          continue;
        }

        // Verificar se parece ser um ticket pelo nome/localização
        const isTicketLike = (
          channel.parent?.name?.includes('Ticket') ||
          channel.parent?.name?.includes('📂') ||
          channel.name.match(/^[a-z]+-[a-z0-9]+/) || // padrão categoria-usuario
          channel.name.includes('ticket')
        );

        if (isTicketLike) {
          // Tentar identificar tipo pelo nome - busca mais abrangente
          const panelConfig = getPanelConfig(guildId);
          const configuredCategories = panelConfig.categories || [];
          let detectedType = null;

          // Primeiro: verificar se começa com algum tipo conhecido
          for (const cat of configuredCategories) {
            if (channel.name.startsWith(cat.id) || channel.name.includes(cat.id)) {
              detectedType = cat.id;
              break;
            }
          }

          // Segundo: padrões comuns mesmo sem configuração
          if (!detectedType) {
            const commonPatterns = {
              'bug': ['bug', 'erro', 'problema'],
              'denuncia': ['denuncia', 'report', 'relato'],
              'appeal': ['appeal', 'recurso', 'revisao'],
              'suporte': ['suporte', 'ajuda', 'duvida'],
              'compra': ['compra', 'pagamento', 'venda'],
              'ticket': ['ticket', 'solicitacao']
            };

            for (const [type, patterns] of Object.entries(commonPatterns)) {
              if (patterns.some(pattern => channel.name.includes(pattern))) {
                detectedType = type;
                break;
              }
            }
          }

          // Terceiro: extrair da primeira parte do nome (antes do traço)
          if (!detectedType) {
            const nameParts = channel.name.split('-');
            if (nameParts.length >= 2) {
              detectedType = nameParts[0];
            }
          }

          if (detectedType) {
            ticketChannels.push({ channel, type: detectedType });
          } else {
            ticketChannels.push({ channel, type: 'unknown' });
          }
        }
      }

      if (ticketChannels.length === 0) {
        return interaction.editReply('❌ Nenhum canal de ticket encontrado.');
      }

      const panelConfig = getPanelConfig(guildId);
      const configuredCategories = panelConfig.categories || [];
      let moved = 0;
      let created = 0;
      let skipped = 0;

      for (const { channel, type } of ticketChannels) {
        if (type === 'unknown') {
          skipped++;
          continue;
        }

        // Buscar label usando a função de mapeamento
        const categoryLabel = getTicketTypeLabel(type, configuredCategories);
        const categoryName = `📂 ${categoryLabel}`;
        
        // Encontrar ou criar categoria
        let targetCategory = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name === categoryName
        );

        if (!targetCategory) {
          try {
            // CORRIGIDO: Categoria BLOQUEADA, canais individuais mantêm permissões específicas
            const everyone = guild.roles.everyone;
            targetCategory = await guild.channels.create({
              name: categoryName,
              type: ChannelType.GuildCategory,
              position: 0,
              permissionOverwrites: [
                {
                  id: everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel] // BLOQUEAR CATEGORIA
                },
                {
                  id: guild.members.me.id,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                }
              ]
            });
            created++;
            console.log(`[ORGANIZE] Categoria criada BLOQUEADA: ${categoryName} para tipo ${type}`);
          } catch (error) {
            console.error(`Erro ao criar categoria ${categoryName}:`, error);
            skipped++;
            continue;
          }
        }

        // Mover canal se necessário
        if (channel.parentId !== targetCategory.id) {
          try {
            await channel.setParent(targetCategory.id);
            moved++;
          } catch (error) {
            console.error(`Erro ao mover canal ${channel.name}:`, error);
            skipped++;
          }
        }
      }

      return interaction.editReply(
        `✅ **Organização concluída:**\n` +
        `📂 Categorias criadas: ${created}\n` +
        `🔄 Canais movidos: ${moved}\n` +
        `⏭️ Canais ignorados: ${skipped}\n` +
        `📊 Total analisado: ${ticketChannels.length}`
      );
    }

    if (sub === 'limpar-vazias') {
      await interaction.deferReply({ ephemeral: true });
      
      const ticketCategories = guild.channels.cache.filter(c => 
        c.type === ChannelType.GuildCategory && c.name.startsWith('📂')
      );

      let deleted = 0;
      const errors = [];

      for (const [, category] of ticketCategories) {
        // Verificar se tem canais filhos
        const children = guild.channels.cache.filter(ch => ch.parentId === category.id);
        
        if (children.size === 0) {
          try {
            await category.delete('Categoria de ticket vazia');
            deleted++;
          } catch (error) {
            errors.push(`${category.name}: ${error.message}`);
          }
        }
      }

      let result = `✅ **Limpeza concluída:**\n🗑️ Categorias removidas: ${deleted}`;
      
      if (errors.length > 0) {
        result += `\n❌ Erros: ${errors.length}`;
      }

      return interaction.editReply(result);
    }

    if (sub === 'listar') {
      const ticketCategories = guild.channels.cache.filter(c => 
        c.type === ChannelType.GuildCategory && c.name.startsWith('📂')
      );

      if (ticketCategories.size === 0) {
        return interaction.reply({ 
          content: '📂 Nenhuma categoria de ticket encontrada.\nUse `/ticket-categorias criar-todas` para criar.', 
          ephemeral: true 
        });
      }

      let result = `📂 **Categorias de Ticket (${ticketCategories.size}):**\n\n`;

      for (const [, category] of ticketCategories) {
        const children = guild.channels.cache.filter(ch => ch.parentId === category.id);
        const emoji = children.size === 0 ? '🔴' : '🟢';
        result += `${emoji} **${category.name}** - ${children.size} canais\n`;
      }

      return interaction.reply({ content: result, ephemeral: true });
    }

    if (sub === 'corrigir-permissoes') {
      await interaction.deferReply({ ephemeral: true });
      
      const ticketCategories = guild.channels.cache.filter(c => 
        c.type === ChannelType.GuildCategory && c.name.startsWith('📂')
      );

      if (ticketCategories.size === 0) {
        return interaction.editReply('❌ Nenhuma categoria de ticket encontrada.');
      }

      let fixed = 0;
      let errors = 0;
      const everyone = guild.roles.everyone;

      for (const [, category] of ticketCategories) {
        try {
          // CORRIGIDO: BLOQUEAR categorias que estão públicas
          await category.permissionOverwrites.edit(everyone.id, {
            ViewChannel: false // BLOQUEAR CATEGORIA
          });
          
          await category.permissionOverwrites.edit(guild.members.me.id, {
            ViewChannel: true,
            ManageChannels: true
          });
          
          fixed++;
          console.log(`[CORRIGIR] Categoria BLOQUEADA: ${category.name}`);
        } catch (error) {
          console.error(`Erro ao bloquear categoria ${category.name}:`, error);
          errors++;
        }
      }

      return interaction.editReply(
        `🔒 **CATEGORIAS BLOQUEADAS URGENTEMENTE**\n` +
        `✅ Categorias bloqueadas: ${fixed}\n` +
        `❌ Erros: ${errors}\n` +
        `📊 Total processado: ${ticketCategories.size}\n\n` +
        `🔒 **CORRIGIDO:** Categorias agora estão BLOQUEADAS para todos.\n` +
        `✅ **FUNCIONA:** Canais de ticket individuais mantêm permissões específicas para cada autor.`
      );
    }

    if (sub === 'estatisticas') {
      await interaction.deferReply({ ephemeral: true });
      
      // Ler dados de tickets do arquivo JSON
      const fs = require('fs');
      const path = require('path');
      const ticketsPath = path.join(__dirname, '..', '..', 'tickets.json');
      
      let ticketsData = {};
      try {
        ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8') || '{}');
      } catch (e) {
        return interaction.editReply('❌ Erro ao ler dados de tickets ou nenhum ticket encontrado.');
      }
      
      const guildData = ticketsData[guildId];
      if (!guildData) {
        return interaction.editReply('📊 Nenhum dado de ticket encontrado para este servidor.');
      }
      
      // Analisar tickets resolvidos
      const stats = {
        total: 0,
        categories: {},
        recent: [], // últimos 10 tickets
        oldestDate: null,
        newestDate: null
      };
      
      // Contar tickets pelo nextTicketId (total de tickets criados)
      const totalCreated = guildData.nextTicketId ? guildData.nextTicketId - 1 : 0;
      
      // Analisar tickets ativos
      const activeTickets = Object.keys(guildData.byChannel || {}).length;
      
      // Tickets resolvidos = criados - ativos
      const resolvedTickets = Math.max(0, totalCreated - activeTickets);
      stats.total = resolvedTickets;
      
      // Analisar tickets ativos por categoria (para mostrar workload atual)
      const activeByCategory = {};
      if (guildData.byChannel) {
        for (const ticket of Object.values(guildData.byChannel)) {
          const category = ticket.type || 'unknown';
          activeByCategory[category] = (activeByCategory[category] || 0) + 1;
          
          // Dados para estatísticas temporais
          if (ticket.createdAt) {
            const date = new Date(ticket.createdAt);
            if (!stats.oldestDate || date < stats.oldestDate) stats.oldestDate = date;
            if (!stats.newestDate || date > stats.newestDate) stats.newestDate = date;
            
            stats.recent.push({
              type: category,
              date: date,
              number: ticket.ticketNumber || 0
            });
          }
        }
      }
      
      // Ordenar recentes por data
      stats.recent.sort((a, b) => b.date - a.date);
      stats.recent = stats.recent.slice(0, 10);
      
      // Buscar configurações para nomes das categorias
      const panelConfig = getPanelConfig(guildId);
      const configuredCategories = panelConfig.categories || [];
      
      // Estimar tickets resolvidos por categoria baseado na proporção dos ativos
      // (não é 100% preciso, mas dá uma boa estimativa)
      const totalActiveTickets = Object.values(activeByCategory).reduce((a, b) => a + b, 0);
      
      for (const [category, activeCount] of Object.entries(activeByCategory)) {
        const proportion = totalActiveTickets > 0 ? activeCount / totalActiveTickets : 0;
        const estimatedResolved = Math.floor(resolvedTickets * proportion);
        
        const categoryLabel = getTicketTypeLabel(category, configuredCategories);
        stats.categories[categoryLabel] = {
          active: activeCount,
          estimatedResolved: estimatedResolved,
          total: activeCount + estimatedResolved
        };
      }
      
      // Montar relatório
      let report = `📊 **ESTATÍSTICAS DE TICKETS**\n\n`;
      
      // Resumo geral
      report += `🎫 **RESUMO GERAL:**\n`;
      report += `• Total criados: **${totalCreated}**\n`;
      report += `• Resolvidos: **${resolvedTickets}**\n`;
      report += `• Ativos: **${activeTickets}**\n`;
      
      if (resolvedTickets > 0 && totalCreated > 0) {
        const resolveRate = ((resolvedTickets / totalCreated) * 100).toFixed(1);
        report += `• Taxa de resolução: **${resolveRate}%**\n`;
      }
      
      report += `\n📂 **POR CATEGORIA:**\n`;
      
      if (Object.keys(stats.categories).length === 0) {
        report += `• Nenhuma categoria com dados disponíveis\n`;
      } else {
        // Ordenar por total (resolvidos + ativos)
        const sortedCategories = Object.entries(stats.categories)
          .sort(([,a], [,b]) => b.total - a.total);
        
        for (const [categoryName, data] of sortedCategories) {
          const activeIcon = data.active > 0 ? '🔴' : '🟢';
          report += `${activeIcon} **${categoryName}**\n`;
          report += `   Resolvidos: ${data.estimatedResolved} | Ativos: ${data.active} | Total: ${data.total}\n`;
        }
      }
      
      // Atividade recente
      if (stats.recent.length > 0) {
        report += `\n🕒 **ATIVIDADE RECENTE (últimos ${stats.recent.length}):**\n`;
        for (const ticket of stats.recent.slice(0, 5)) {
          const categoryLabel = getTicketTypeLabel(ticket.type, configuredCategories);
          const timeAgo = Math.floor((Date.now() - ticket.date.getTime()) / (1000 * 60 * 60 * 24));
          const timeText = timeAgo === 0 ? 'hoje' : timeAgo === 1 ? '1 dia atrás' : `${timeAgo} dias atrás`;
          report += `• #${ticket.number} ${categoryLabel} (${timeText})\n`;
        }
      }
      
      // Informações temporais
      if (stats.oldestDate && stats.newestDate) {
        const daysSinceFirst = Math.floor((Date.now() - stats.oldestDate.getTime()) / (1000 * 60 * 60 * 24));
        report += `\n📅 **PERÍODO:** ${daysSinceFirst} dias (desde ${stats.oldestDate.toLocaleDateString('pt-BR')})`;
        
        if (daysSinceFirst > 0 && totalCreated > 0) {
          const avgPerDay = (totalCreated / daysSinceFirst).toFixed(1);
          report += `\n📈 **MÉDIA:** ${avgPerDay} tickets/dia`;
        }
      }
      
      return interaction.editReply(report);
    }
  }
};