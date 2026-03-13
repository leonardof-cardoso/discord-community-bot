const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { readConfig } = require('../utils/config');
const { getOpenTicket, safeAddOpenTicket, removeOpenTicketByChannel } = require('../utils/ticketsStore');
const { hasActiveAppeal, createAppeal, getAppealByChannel, updateAppeal } = require('../utils/appealsStore');
const { trackTicketActivity } = require('../utils/ticketInactivity');
const { getPanelConfig, getCategoryPerms } = require('../utils/panelConfig');

// Sistema de cooldown para prevenir múltiplos tickets
const ticketCreationCooldowns = new Map();
const COOLDOWN_TIME = 5000; // 5 segundos

// Limpeza automática de cooldowns expirados a cada 30 segundos
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of ticketCreationCooldowns.entries()) {
    if (now - timestamp > COOLDOWN_TIME * 2) { // Limpar cooldowns com mais de 10 segundos
      ticketCreationCooldowns.delete(key);
    }
  }
}, 30000);

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      // Rastrear interações de usuários em tickets
      if (interaction.channel && (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) {
        const ticket = getOpenTicket(interaction.guild.id, null, interaction.channel.id);
        if (ticket && interaction.user.id === ticket.openerId) {
          trackTicketActivity(interaction.guild.id, interaction.channel.id, interaction.user.id);
        }
      }
      
      // select menu - categories configured per guild
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        // RESPOSTA IMEDIATA para prevenir múltiplos cliques
        await interaction.deferReply({ ephemeral: true });
        
        const choice = interaction.values[0];
        const guild = interaction.guild;
        const member = interaction.member;
        const cfg = readConfig();
        const gcfg = cfg[guild.id] || {};
        
        // VERIFICAÇÃO DE COOLDOWN: Prevenir múltiplos cliques
        const cooldownKey = `${guild.id}_${member.id}`;
        const now = Date.now();
        const lastCreation = ticketCreationCooldowns.get(cooldownKey);
        
        if (lastCreation && (now - lastCreation) < COOLDOWN_TIME) {
          return interaction.editReply({
            content: '⏱️ Aguarde alguns segundos antes de abrir outro ticket.'
          });
        }
        
        // Definir cooldown
        ticketCreationCooldowns.set(cooldownKey, now);
        
        // PRIMEIRA VERIFICAÇÃO: Verificar se usuário já tem ticket aberto
        const existingTicket = getOpenTicket(guild.id, member.id);
        if (existingTicket) {
          // Verificar se o canal do ticket ainda existe
          const channel = guild.channels.cache.get(existingTicket.channelId);
          if (!channel) {
            // Canal não existe mais, remover do store
            const { removeOpenTicketByChannel } = require('../utils/ticketsStore');
            removeOpenTicketByChannel(guild.id, existingTicket.channelId);
            console.log(`[CLEANUP] Removido ticket órfão: ${existingTicket.channelId}`);
          } else {
            return interaction.editReply({ 
              content: '❌ Você já tem uma solicitação aberta. Aguarde o fechamento antes de abrir outra.'
            });
          }
        }
        
        // choice is a category id (e.g., 'denuncias', 'duvidas', 'bugs', ...)

        // Sistema especial para Appeals - abrir modal ao invés de ticket direto
        if (choice === 'appeal' || choice === 'appeals') {
          // Verificar se já tem appeal ativo
          if (hasActiveAppeal(guild.id, member.id)) {
            return interaction.editReply({ 
              content: '❌ Você já possui um appeal ativo ou foi negado. O limite máximo é de **1 appeal** por usuário.'
            });
          }

          // Para appeals, não podemos usar modal após defer, então cancelamos defer e usamos modal
          // IMPORTANTE: Resetar o estado da interação para permitir showModal
          try {
            await interaction.deleteReply();
          } catch (_) {}
          
          // Criar modal para coletar informações do appeal
          const appealModal = new ModalBuilder()
            .setCustomId('appeal_modal')
            .setTitle('📩 Appeal - Revisão de Punição');

          const nicknameInput = new TextInputBuilder()
            .setCustomId('appeal_nickname')
            .setLabel('Seu nick no jogo:')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Digite seu nickname exato')
            .setRequired(true)
            .setMaxLength(50);

          const punishmentInput = new TextInputBuilder()
            .setCustomId('appeal_punishment')
            .setLabel('Qual foi sua punição?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Ban permanente, Mute 7d, Kick')
            .setRequired(true)
            .setMaxLength(100);

          const reasonInput = new TextInputBuilder()
            .setCustomId('appeal_reason')
            .setLabel('Por que sua punição deve ser revogada?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explique detalhadamente por que acredita que sua punição foi injusta.')
            .setRequired(true)
            .setMaxLength(1000);

          const row1 = new ActionRowBuilder().addComponents(nicknameInput);
          const row2 = new ActionRowBuilder().addComponents(punishmentInput);
          const row3 = new ActionRowBuilder().addComponents(reasonInput);

          appealModal.addComponents(row1, row2, row3);
          return interaction.showModal(appealModal);
        }

        // Remover verificação de papéis - qualquer pessoa pode abrir ticket
        let leaderRole = gcfg.leaderRoleId ? guild.roles.cache.get(gcfg.leaderRoleId) : guild.roles.cache.find(r => /líder|lider/i.test(r.name));
        let consRole = gcfg.conselheiroRoleId ? guild.roles.cache.get(gcfg.conselheiroRoleId) : guild.roles.cache.find(r => /conselheiro/i.test(r.name));

        // PROCESSO DE CRIAÇÃO DO TICKET (envolvido em try-catch)
        try {
          // criar categoria específica para o tipo de ticket (funciona com qualquer tipo)
        const panelConfig = getPanelConfig(guild.id);
        
        // Função para mapear tipos para labels amigáveis
        function getTicketTypeLabel(ticketType, configuredCategories = []) {
          const configured = configuredCategories.find(c => c.id === ticketType);
          if (configured) return configured.label;
          
          const commonMappings = {
            'bug': 'Bugs', 'bugs': 'Bugs',
            'denuncia': 'Denúncias', 'denuncias': 'Denúncias',
            'appeal': 'Appeals', 'appeals': 'Appeals',
            'suporte': 'Suporte', 'ajuda': 'Ajuda',
            'duvida': 'Dúvidas', 'duvidas': 'Dúvidas',
            'compra': 'Compras', 'compras': 'Compras',
            'revisao': 'Revisões', 'revisoes': 'Revisões',
            'ouvidoria': 'Ouvidoria',
            'keys_vips': 'Keys VIPs',
            'confirma_faccao': 'Confirmação de Facção',
            'bugs_urgentes': 'Bugs Urgentes',
            'revisoes_lideres': 'Revisões de Líderes',
            'ticket': 'Tickets Gerais'
          };
          
          return commonMappings[ticketType.toLowerCase()] || 
                 ticketType.charAt(0).toUpperCase() + ticketType.slice(1).replace(/_/g, ' ');
        }
        
        const categoryLabel = getTicketTypeLabel(choice, panelConfig.categories || []);
        const categoryName = `📂 ${categoryLabel}`;
        
        let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
        if (!category) {
          try {
            // CORRIGIDO: Categoria BLOQUEADA + cada ticket herda e ajusta permissões específicas
            const everyone = guild.roles.everyone;
            category = await guild.channels.create({ 
              name: categoryName, 
              type: ChannelType.GuildCategory,
              position: 0,
              permissionOverwrites: [
                {
                  id: everyone.id,
                  deny: [PermissionsBitField.Flags.ViewChannel] // BLOQUEAR CATEGORIA
                },
                {
                  id: client.user.id,
                  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels]
                }
              ]
            });
            console.log(`[TICKET] Categoria criada BLOQUEADA: ${categoryName} (tipo: ${choice})`);
          } catch (e) {
            console.error(`[TICKET] Erro ao criar categoria ${categoryName}:`, e);
            // Fallback para categoria geral
            category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'Tickets');
            if (!category) category = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory });
          }
        }

  const safeName = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cause = (choice || 'ticket').toString().replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
  let channelName = `${cause}-${safeName}`;
  if (guild.channels.cache.some(c => c.name === channelName)) channelName = `${cause}-${safeName}-${member.id.slice(0,4)}`;

        const everyone = guild.roles.everyone;
        const permissionOverwrites = [
          { id: everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { 
            id: member.id, 
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

        // Permissões por categoria: dar VISUALIZAÇÃO (e histórico) para cargos configurados; envio de mensagens apenas após claim
        try {
          const panel = getPanelConfig(guild.id);
          const catPerms = getCategoryPerms(guild.id, choice);
          const rolesAllow = new Set(catPerms.roles || []);
          console.log(`[TICKET-PERMS] Categoria: ${choice}, Cargos configurados:`, catPerms);
          let minRoleObj = catPerms.minRoleId ? guild.roles.cache.get(catPerms.minRoleId) : null;
          if (minRoleObj) {
            console.log(`[TICKET-PERMS] Cargo mínimo encontrado: ${minRoleObj.name}`);
            for (const [, role] of guild.roles.cache) {
              if (role.id === everyone.id) continue;
              if (role.position >= minRoleObj.position) rolesAllow.add(role.id);
            }
          }
          console.log(`[TICKET-PERMS] Total de cargos a adicionar: ${rolesAllow.size}`);
          for (const rid of rolesAllow) {
            const roleObj = guild.roles.cache.get(rid);
            if (!roleObj) { console.warn(`[ticket] roleId não encontrado no cache: ${rid} — ignorando overwrite`); continue; }
            console.log(`[TICKET-PERMS] Adicionando permissões para cargo: ${roleObj.name} (${roleObj.id})`);
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
        } catch (e) { console.error('[TICKET-PERMS] Erro ao aplicar permissões:', e); }
        
        // Staff não tem acesso automático - apenas autor + bot podem ver

        // VERIFICAÇÃO FINAL: Double-check antes de criar o canal
        const finalCheck = getOpenTicket(guild.id, member.id);
        if (finalCheck) {
          // Verificar se o canal do ticket ainda existe
          const channel = guild.channels.cache.get(finalCheck.channelId);
          if (!channel) {
            // Canal não existe mais, remover do store
            const { removeOpenTicketByChannel } = require('../utils/ticketsStore');
            removeOpenTicketByChannel(guild.id, finalCheck.channelId);
            console.log(`[CLEANUP] Removido ticket órfão na verificação final: ${finalCheck.channelId}`);
          } else {
            // Limpar cooldown se detectar ticket duplicado
            ticketCreationCooldowns.delete(cooldownKey);
            return interaction.editReply({ 
              content: '❌ Um ticket já foi criado para você. Verifique seus canais disponíveis.'
            });
          }
        }

        const channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category.id, permissionOverwrites });

        // assign ticket number
        const { getAndIncrementTicketId } = require('../utils/ticketsStore');
        const ticketNumber = getAndIncrementTicketId(guild.id);

        // REGISTRAR TICKET IMEDIATAMENTE com função segura
        try {
          await safeAddOpenTicket(guild.id, member.id, channel.id, { 
            type: choice, 
            createdAt: Date.now(), 
            ticketNumber, 
            openerId: member.id,
            username: member.user.username || member.user.globalName || 'Usuário Desconhecido'
          });
        } catch (lockError) {
          // Se falhou no lock, deletar canal criado e notificar erro
          try { await channel.delete('Falha na criação segura do ticket'); } catch (_) {}
          
          if (lockError.message === 'DUPLICATE_TICKET_CREATION_BLOCKED') {
            ticketCreationCooldowns.delete(cooldownKey);
            return interaction.editReply({
              content: '❌ Detectada criação simultânea de tickets. Sua solicitação foi cancelada para prevenir duplicação.'
            });
          } else if (lockError.message === 'USER_ALREADY_HAS_TICKET') {
            ticketCreationCooldowns.delete(cooldownKey);
            return interaction.editReply({
              content: '❌ Você já possui um ticket ativo. Aguarde o fechamento antes de abrir outro.'
            });
          }
          
          throw lockError; // Re-throw other errors
        }

        // Obter configuração do painel para usar nas informações do ticket
        const panelConfigForTicket = getPanelConfig(guild.id);
        
        const cat = (panelConfigForTicket.categories || []).find(c => c.id === choice);
        
        // Fallback para categoria comum se não encontrou na configuração
        const ticketCategoryLabel = cat?.label || getTicketTypeLabel(choice, panelConfigForTicket.categories || []);
        const ticketCategoryDesc = cat?.description || `Descreva seu problema relacionado a ${ticketCategoryLabel} com o máximo de detalhes possível.`;
        
        const title = ticketCategoryLabel ? `🎫 Ticket #${ticketNumber} — ${ticketCategoryLabel}` : `🎫 Ticket #${ticketNumber}`;
        const desc = ticketCategoryDesc;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(0x1E90FF)
          .setDescription(desc)
          .setFooter({ text: `Ticket Nº ${ticketNumber}` });

        // Mencionar o autor para facilitar a identificação no canal
        try {
          await channel.send({ content: `<@${member.id}>`, allowedMentions: { users: [member.id], roles: [] } });
        } catch (_) {}

        const close = new ButtonBuilder().setCustomId('close_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger);
        const claim = new ButtonBuilder().setCustomId('claim_ticket').setLabel('Assumir Ticket').setStyle(ButtonStyle.Success);
        const actionRow = new ActionRowBuilder().addComponents(claim, close);
        await channel.send({ embeds: [embed], components: [actionRow] });

        // Enviar mensagem explicativa sobre privacidade do ticket
        const privacyEmbed = new EmbedBuilder()
          .setTitle('🔒 Privacidade do Ticket')
          .setDescription('Este ticket é **privado** e só você pode visualizá-lo.\n\nUm membro da equipe precisará **assumir** seu ticket para poder ajudá-lo.')
          .setColor(0x3498db)
          .setFooter({ text: 'Aguarde um membro da equipe assumir seu ticket' });
        
        await channel.send({ embeds: [privacyEmbed] });

        // Inicializar rastreamento de inatividade para o ticket
        trackTicketActivity(guild.id, channel.id, member.id);
        
        // SUCESSO: Limpar cooldown apenas após criação bem-sucedida
        setTimeout(() => {
          ticketCreationCooldowns.delete(cooldownKey);
        }, 2000); // Limpar após 2 segundos

        // send a nice log embed to transcripts/events channel about the new ticket
        try {
          const { sendToConfiguredChannels } = require('../utils/logger');
          const logEmbed = new EmbedBuilder()
            .setTitle('🆕 Novo Ticket Criado')
            .setColor(0x00FF00)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields({ name: 'Canal', value: `${channel}`, inline: true }, { name: 'Usuário', value: `<@${member.id}>`, inline: true }, { name: 'Categoria', value: `${choice}`, inline: true }, { name: 'Número', value: `#${ticketNumber}`, inline: true })
            .setTimestamp();
          await sendToConfiguredChannels(guild, ['ticketsOpenLogsChannelId'], { embeds: [logEmbed] });
        } catch (err) { console.error('Erro enviando log de criação de ticket', err); }

        // Responder e resetar o menu select para permitir nova seleção
        await interaction.editReply({ content: `✅ Ticket criado: ${channel}` });
        
        // Resetar o estado do select menu atualizando a mensagem original
        try {
          const originalMessage = interaction.message;
          if (originalMessage && originalMessage.components && originalMessage.components.length > 0) {
            // Reconstruir o menu select sem valor selecionado
            const { StringSelectMenuBuilder } = require('discord.js');
            const panelConfig = getPanelConfig(guild.id);
            
            if (panelConfig && panelConfig.categories && panelConfig.categories.length > 0) {
              const newSelect = new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('Selecione a categoria do seu problema')
                .addOptions(panelConfig.categories.map(c => ({ 
                  label: c.label, 
                  value: c.id, 
                  emoji: c.emoji, 
                  description: c.description 
                })));
              
              const newActionRow = new ActionRowBuilder().addComponents(newSelect);
              await originalMessage.edit({ 
                embeds: originalMessage.embeds, 
                components: [newActionRow] 
              });
            }
          }
        } catch (resetErr) {
          console.log('[TICKET] Não foi possível resetar menu select:', resetErr.message);
        }
        
        } catch (ticketCreationError) {
          console.error('Erro ao criar ticket:', ticketCreationError);
          
          // Limpar cooldown em caso de erro
          ticketCreationCooldowns.delete(cooldownKey);
          
          return interaction.reply({
            content: '❌ Ocorreu um erro ao criar seu ticket. Tente novamente em alguns segundos.',
            ephemeral: true
          });
        }
      }

      // removido: botões antigos de abrir ticket ('open_ticket_*')

      // botão assumir ticket
      if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        const ch = interaction.channel;
        const { getTicketByChannel } = require('../utils/ticketsStore');
        let ticketInfo = getTicketByChannel(ch.guild.id, ch.id);
        
        // Se não encontrou o ticket no store, tenta identificar se é um canal de ticket pela categoria e nome
        if (!ticketInfo) {
          // Verifica se parece com um canal de ticket
          const isTicketChannel = (
            ch.parent?.name === 'Tickets' || 
            ch.name.includes('ticket') || 
            ch.name.match(/^[a-z]+-[a-z0-9]+$/) || // padrão: categoria-usuario
            ch.topic?.includes('ticket') ||
            ch.topic?.includes('atendimento')
          );
          
          if (!isTicketChannel) {
            return interaction.reply({ content: 'Este botão só funciona dentro de um canal de ticket.', ephemeral: true });
          }
          
          // Tenta recuperar/recriar informações básicas do ticket
          console.log(`[TICKET] Recuperando ticket órfão: ${ch.name} (${ch.id})`);
          // Se chegou até aqui, assume que é um ticket válido mesmo sem estar no store
        }
        
        const cfg = readConfig();
        const gcfg = cfg[ch.guild.id] || {};
        const member = interaction.member;
        
        // Quem pode assumir: cargos permitidos na categoria OU (fallback) moderadores (líder/conselheiro)
        const info = ticketInfo || getTicketByChannel(ch.guild.id, ch.id);
        const { getCategoryPerms } = require('../utils/panelConfig');
        const catPerms = info ? getCategoryPerms(ch.guild.id, info.type) : { roles: [], minRoleId: undefined };
        let allowed = false;
        if (catPerms.roles && catPerms.roles.some(rid => member.roles.cache.has(rid))) allowed = true;
        if (!allowed && catPerms.minRoleId) {
          const minRole = ch.guild.roles.cache.get(catPerms.minRoleId);
          if (minRole) {
            const highest = member.roles.highest;
            if (highest && highest.position >= minRole.position) allowed = true;
          }
        }
        if (!allowed) {
          // fallback para moderadores
          let leaderRole = gcfg.leaderRoleId ? ch.guild.roles.cache.get(gcfg.leaderRoleId) : ch.guild.roles.cache.find(r => /líder|lider/i.test(r.name));
          let consRole = gcfg.conselheiroRoleId ? ch.guild.roles.cache.get(gcfg.conselheiroRoleId) : ch.guild.roles.cache.find(r => /conselheiro/i.test(r.name));
          const hasLeader = leaderRole ? member.roles.cache.has(leaderRole.id) : false;
          const hasCons = consRole ? member.roles.cache.has(consRole.id) : false;
          allowed = hasLeader || hasCons;
        }
        if (!allowed) return interaction.reply({ content: 'Você não pode assumir tickets desta categoria.', ephemeral: true });
        
        const { claimTicket } = require('../utils/ticketsStore');
        const claimed = claimTicket(ch.guild.id, ch.id, interaction.user.id);
        
        if (!claimed) {
          return interaction.reply({ content: 'Erro ao assumir ticket.', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Ticket Assumido')
          .setColor(0x00FF00)
          .setDescription(`Este ticket foi assumido por ${interaction.user}`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        // Atualizar permissões do canal para dar acesso total ao responsável
        await ch.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          ManageMessages: true
        });
      }



      // botão fechar
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const ch = interaction.channel;
      const { getTicketByChannel } = require('../utils/ticketsStore');
      let ticketInfo = getTicketByChannel(ch.guild.id, ch.id);
      
      // Se não encontrou o ticket no store, tenta identificar se é um canal de ticket pela categoria e nome
      if (!ticketInfo) {
        // Verifica se parece com um canal de ticket
        const isTicketChannel = (
          ch.parent?.name === 'Tickets' || 
          ch.name.includes('ticket') || 
          ch.name.match(/^[a-z]+-[a-z0-9]+$/) || // padrão: categoria-usuario
          ch.topic?.includes('ticket') ||
          ch.topic?.includes('atendimento')
        );
        
        if (!isTicketChannel) {
          return interaction.reply({ content: 'Este botão só funciona dentro de um canal de ticket.', ephemeral: true });
        }
        
        // Tenta recuperar/recriar informações básicas do ticket
        console.log(`[TICKET] Fechando ticket órfão: ${ch.name} (${ch.id})`);
        // Cria um objeto básico para o ticket órfão
        ticketInfo = {
          openerId: null, // não sabemos quem abriu
          type: 'unknown',
          createdAt: Date.now() - (24 * 60 * 60 * 1000), // assume 1 dia atrás
          ticketNumber: 0
        };
      }
      
      // Fechamento direto (sem avaliação)
      await interaction.reply({ content: 'Encerrando solicitação e gerando registro...', ephemeral: true });
      
      // Fechar usando o método padrão
      setTimeout(() => closeTicketWithRating(ch, interaction.user.id, null), 1000);
    }

      // comandos slash (Chat Input) - despachar para o módulo de comando
      if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) {
          console.warn(`Comando não encontrado: ${interaction.commandName}`);
        } else {
          try {
            await cmd.execute(interaction, client);
          } catch (err) {
            console.error(`Erro executando comando ${interaction.commandName}:`, err);
            if (!interaction.replied) {
              try { await interaction.reply({ content: 'Ocorreu um erro ao executar o comando.', ephemeral: true }); } catch (er) { console.error('Falha ao enviar reply de erro:', er); }
            }
          }
        }
      }

      // Handler para o botão de migração de tickets antigos
      if (interaction.isButton() && interaction.customId === 'migrate_old_tickets') {
        // Verificar se o usuário tem permissão de administrador
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ 
            content: '❌ Você precisa ser administrador para usar esta função.', 
            ephemeral: true 
          });
        }

        await interaction.deferReply();

        try {
          const { migrateOldTickets } = require('../utils/ticketsStore');
          const result = migrateOldTickets(interaction.guild.id);

          const embed = new EmbedBuilder()
            .setTitle('🔄 Migração Concluída')
            .setDescription(result.message)
            .addFields(
              { name: '📊 Tickets Processados', value: `${result.migrated}`, inline: true },
              { name: '👥 Usuários Únicos', value: `${result.totalUsers}`, inline: true }
            )
            .setColor(0x00ff00)
            .setFooter({ 
              text: 'Agora você pode usar os comandos de ranking!',
              iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed], components: [] });

        } catch (error) {
          console.error('Erro na migração via botão:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Erro na Migração')
            .setDescription('Ocorreu um erro ao migrar os dados.')
            .setColor(0xff0000)
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
      }

      // Handler para modal de appeal
      if (interaction.isModalSubmit() && interaction.customId === 'appeal_modal') {
        await interaction.deferReply({ ephemeral: true });

        try {
          const nickname = interaction.fields.getTextInputValue('appeal_nickname');
          const punishment = interaction.fields.getTextInputValue('appeal_punishment');
          const reason = interaction.fields.getTextInputValue('appeal_reason');

          const guild = interaction.guild;
          const member = interaction.member;

          // Verificar novamente se já tem appeal ativo
          if (hasActiveAppeal(guild.id, member.id)) {
            return interaction.editReply({
              content: '❌ Você já possui um appeal ativo. O limite máximo é de **1 appeal** por usuário.'
            });
          }

          // Criar canal do appeal (semelhante ao sistema normal de tickets)
          const cfg = readConfig();
          const gcfg = cfg[guild.id] || {};
          
          // Criar/encontrar categoria Appeals
          const categoryName = '📂 Appeals';
          let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
          if (!category) {
            const everyone = guild.roles.everyone;
            category = await guild.channels.create({ 
              name: categoryName, 
              type: ChannelType.GuildCategory,
              position: 0,
              permissionOverwrites: [
                {
                  id: everyone.id,
                  deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                  id: interaction.client.user.id,
                  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels]
                }
              ]
            });
          }

          const safeName = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          let channelName = `appeal-${safeName}`;
          if (guild.channels.cache.some(c => c.name === channelName)) {
            channelName = `appeal-${safeName}-${member.id.slice(0,4)}`;
          }

          // Permissões do canal de appeal
          const everyone = guild.roles.everyone;
          const permissionOverwrites = [
            { id: everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { 
              id: member.id, 
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
            },
            { 
              id: interaction.client.user.id, 
              allow: [
                PermissionsBitField.Flags.ViewChannel, 
                PermissionsBitField.Flags.SendMessages, 
                PermissionsBitField.Flags.ReadMessageHistory, 
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MentionEveryone
              ]
            }
          ];

          // Adicionar permissões para staff
          try {
            const catPerms = getCategoryPerms(guild.id, 'appeal');
            const rolesAllow = new Set(catPerms.roles || []);
            let minRoleObj = catPerms.minRoleId ? guild.roles.cache.get(catPerms.minRoleId) : null;
            
            if (minRoleObj) {
              for (const [, role] of guild.roles.cache) {
                if (role.id === everyone.id) continue;
                if (role.position >= minRoleObj.position) rolesAllow.add(role.id);
              }
            }
            
            for (const rid of rolesAllow) {
              const roleObj = guild.roles.cache.get(rid);
              if (roleObj) {
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
            }
          } catch (e) { console.warn('Erro ao configurar permissões de staff para appeal:', e); }

          const channel = await guild.channels.create({ 
            name: channelName, 
            type: ChannelType.GuildText, 
            parent: category.id, 
            permissionOverwrites 
          });

          // Gerar número do ticket
          const { getAndIncrementTicketId } = require('../utils/ticketsStore');
          const ticketNumber = getAndIncrementTicketId(guild.id);

          // Criar embed com informações do appeal
          const appealEmbed = new EmbedBuilder()
            .setTitle(`📩 Appeal #${ticketNumber} - Revisão de Punição`)
            .setColor(0xff9500)
            .addFields(
              { name: '👤 Usuário Discord', value: `<@${member.id}>`, inline: true },
              { name: '🎮 Nick no Jogo', value: nickname, inline: true },
              { name: '⚖️ Punição Recebida', value: punishment, inline: false },
              { name: '📝 Justificativa para Revogação', value: reason, inline: false }
            )
            .setFooter({ text: `Appeal ID: ${ticketNumber} • Aguardando análise da staff` })
            .setTimestamp();

          // Botões para staff responder
          const approveBtn = new ButtonBuilder()
            .setCustomId('appeal_approve')
            .setLabel('✅ Aprovar (Revogar Punição)')
            .setStyle(ButtonStyle.Success);

          const denyBtn = new ButtonBuilder()
            .setCustomId('appeal_deny')
            .setLabel('❌ Negar (Manter Punição)')
            .setStyle(ButtonStyle.Danger);

          const closeBtn = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒 Fechar Ticket')
            .setStyle(ButtonStyle.Secondary);

          const actionRow = new ActionRowBuilder().addComponents(approveBtn, denyBtn, closeBtn);

          // Mencionar o usuário
          await channel.send({ content: `<@${member.id}>`, allowedMentions: { users: [member.id], roles: [] } });
          
          // Enviar embed principal
          await channel.send({ embeds: [appealEmbed], components: [actionRow] });

          // Encaminhar appeal para servidor de revisão (se configurado)
          try {
            const reviewGuildId = gcfg.appealReviewGuildId;
            const reviewChannelId = gcfg.appealReviewChannelId;
            
            if (reviewGuildId && reviewChannelId) {
              const reviewGuild = interaction.client.guilds.cache.get(reviewGuildId);
              if (reviewGuild) {
                const reviewChannel = reviewGuild.channels.cache.get(reviewChannelId);
                if (reviewChannel && reviewChannel.isTextBased()) {
                  
                  // Embed para o servidor de revisão
                  const reviewEmbed = new EmbedBuilder()
                    .setTitle(`📩 Novo Appeal para Revisão #${ticketNumber}`)
                    .setColor(0xff9500)
                    .addFields(
                      { name: '🌐 Servidor Origem', value: guild.name, inline: true },
                      { name: '👤 Usuário Discord', value: `${member.user.username} (${member.id})`, inline: true },
                      { name: '🎮 Nick no Jogo', value: nickname, inline: true },
                      { name: '⚖️ Punição Recebida', value: punishment, inline: false },
                      { name: '📝 Justificativa para Revogação', value: reason, inline: false },
                      { name: '🔗 Canal Original', value: `[Ver Ticket](${channel.url})`, inline: true },
                      { name: '📅 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setFooter({ text: `Appeal ID: ${ticketNumber} • Servidor: ${guild.name}` })
                    .setThumbnail(member.user.displayAvatarURL())
                    .setTimestamp();

                  // Botões para o servidor de revisão
                  const reviewApproveBtn = new ButtonBuilder()
                    .setCustomId(`review_approve_${guild.id}_${appealData.id}`)
                    .setLabel('✅ Aprovar Revisão')
                    .setStyle(ButtonStyle.Success);

                  const reviewDenyBtn = new ButtonBuilder()
                    .setCustomId(`review_deny_${guild.id}_${appealData.id}`)
                    .setLabel('❌ Negar Revisão')
                    .setStyle(ButtonStyle.Danger);

                  const reviewInfoBtn = new ButtonBuilder()
                    .setCustomId(`review_info_${guild.id}_${appealData.id}`)
                    .setLabel('📋 Mais Informações')
                    .setStyle(ButtonStyle.Secondary);

                  const reviewActionRow = new ActionRowBuilder()
                    .addComponents(reviewApproveBtn, reviewDenyBtn, reviewInfoBtn);

                  // Enviar para o canal de revisão
                  const reviewMessage = await reviewChannel.send({ 
                    embeds: [reviewEmbed], 
                    components: [reviewActionRow] 
                  });

                  // Salvar o ID da mensagem de revisão no appeal
                  updateAppeal(guild.id, appealData.id, {
                    reviewMessageId: reviewMessage.id,
                    reviewChannelId: reviewChannelId,
                    reviewGuildId: reviewGuildId
                  });

                  console.log(`[APPEAL] Encaminhado para revisão: ${guild.name} -> ${reviewGuild.name}`);
                  
                  // Notificar no canal original que foi encaminhado
                  const forwardedEmbed = new EmbedBuilder()
                    .setTitle('📤 Appeal Encaminhado')
                    .setDescription('Seu appeal foi encaminhado para análise da equipe de revisão.')
                    .setColor(0x3498db)
                    .setFooter({ text: 'Você receberá uma resposta em breve' });
                  
                  await channel.send({ embeds: [forwardedEmbed] });
                } else {
                  console.warn('[APPEAL] Canal de revisão não encontrado ou não é de texto:', reviewChannelId);
                }
              } else {
                console.warn('[APPEAL] Servidor de revisão não encontrado:', reviewGuildId);
              }
            }
          } catch (reviewError) {
            console.error('[APPEAL] Erro ao encaminhar para revisão:', reviewError);
            // Não interromper o processo se falhar o encaminhamento
          }

          // Salvar appeal no sistema
          const appealData = createAppeal(guild.id, member.id, {
            username: member.user.username,
            ingameName: nickname,
            punishmentType: punishment,
            reviewReason: reason,
            ticketId: ticketNumber,
            channelId: channel.id
          });

          // Marcar como ticket normal também
          addOpenTicket(guild.id, member.id, channel.id, { 
            type: 'appeal', 
            createdAt: Date.now(), 
            ticketNumber, 
            openerId: member.id,
            username: member.user.username || 'Usuário Desconhecido',
            appealId: appealData.id
          });

          // Log
          try {
            const { sendToConfiguredChannels } = require('../utils/logger');
            const logEmbed = new EmbedBuilder()
              .setTitle('📩 Novo Appeal Criado')
              .setColor(0xff9500)
              .setThumbnail(member.user.displayAvatarURL())
              .addFields(
                { name: 'Canal', value: `${channel}`, inline: true }, 
                { name: 'Usuário', value: `<@${member.id}>`, inline: true }, 
                { name: 'Nick no Jogo', value: nickname, inline: true },
                { name: 'Punição', value: punishment, inline: true },
                { name: 'Número', value: `#${ticketNumber}`, inline: true }
              )
              .setTimestamp();
            await sendToConfiguredChannels(guild, ['ticketsOpenLogsChannelId'], { embeds: [logEmbed] });
          } catch (err) { console.error('Erro enviando log de appeal:', err); }

          await interaction.editReply({
            content: `✅ Seu appeal foi criado com sucesso! Canal: ${channel}\n\nVocê receberá uma resposta da staff em breve.`
          });

        } catch (error) {
          console.error('Erro ao processar appeal modal:', error);
          await interaction.editReply({
            content: '❌ Erro ao criar seu appeal. Tente novamente mais tarde.'
          });
        }
      }

      // Handler para botões de resposta do appeal
      if (interaction.isButton() && (interaction.customId === 'appeal_approve' || interaction.customId === 'appeal_deny')) {
        const isApproval = interaction.customId === 'appeal_approve';
        const channel = interaction.channel;
        
        // Verificar se é um canal de appeal
        const appealData = getAppealByChannel(interaction.guild.id, channel.id);
        if (!appealData) {
          return interaction.reply({ 
            content: '❌ Este não é um canal de appeal válido.', 
            ephemeral: true 
          });
        }

        // Verificar permissões (mesmo sistema dos outros botões de ticket)
        const member = interaction.member;
        const hasPermission = member.permissions.has(PermissionsBitField.Flags.ManageChannels) || 
                             member.permissions.has(PermissionsBitField.Flags.Administrator);
        
        if (!hasPermission) {
          return interaction.reply({ 
            content: '❌ Você não tem permissão para responder appeals.', 
            ephemeral: true 
          });
        }

        await interaction.deferReply();

        try {
          // Atualizar appeal
          const updatedAppeal = updateAppeal(interaction.guild.id, appealData.id, {
            status: isApproval ? 'approved' : 'denied',
            resolvedBy: member.id,
            resolvedAt: Date.now(),
            responseMessage: isApproval ? 'Punição revogada' : 'Provas insuficientes'
          });

          // Buscar usuário que fez o appeal
          const appealUser = await interaction.guild.members.fetch(appealData.userId).catch(() => null);

          let responseEmbed;
          if (isApproval) {
            // Appeal aprovado
            responseEmbed = new EmbedBuilder()
              .setTitle('✅ Appeal Aprovado - Punição Revogada')
              .setColor(0x00ff00)
              .setDescription(
                `**Parabéns!** Seu appeal foi **aprovado** pela staff.\n\n` +
                `🎮 **Nick:** ${appealData.ingameName}\n` +
                `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                `✅ **Status:** Punição revogada\n\n` +
                `A punição foi removida do seu histórico. Você já pode voltar a jogar normalmente.`
              )
              .setFooter({ text: 'Appeal processado pela staff • Decisão final' })
              .setTimestamp();
          } else {
            // Appeal negado
            responseEmbed = new EmbedBuilder()
              .setTitle('❌ Appeal Negado - Punição Mantida')
              .setColor(0xff0000)
              .setDescription(
                `Seu appeal foi **negado** pela staff.\n\n` +
                `🎮 **Nick:** ${appealData.ingameName}\n` +
                `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                `❌ **Motivo:** As provas apresentadas não foram suficientes para revogar a punição.\n\n` +
                `⚠️ **Importante:** O limite máximo para appeals é de **1 por usuário**. Você não poderá fazer outro appeal.`
              )
              .setFooter({ text: 'Appeal processado pela staff • Decisão final' })
              .setTimestamp();
          }

          // Enviar resposta no canal
          await interaction.editReply({ embeds: [responseEmbed] });

          // Enviar DM para o usuário se possível
          if (appealUser) {
            try {
              await appealUser.send({ embeds: [responseEmbed] });
            } catch (e) {
              await channel.send(`⚠️ Não foi possível enviar DM para ${appealUser}. A resposta está disponível neste canal.`);
            }
          }

          // Desabilitar botões
          const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
            ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true),
            ButtonBuilder.from(interaction.message.components[0].components[2]).setDisabled(false) // Manter botão fechar ativo
          );

          await interaction.message.edit({ components: [disabledRow] });

          // Log da decisão
          try {
            const { sendToConfiguredChannels } = require('../utils/logger');
            const logEmbed = new EmbedBuilder()
              .setTitle(`📩 Appeal ${isApproval ? 'Aprovado' : 'Negado'}`)
              .setColor(isApproval ? 0x00ff00 : 0xff0000)
              .addFields(
                { name: 'Appeal ID', value: `#${appealData.ticketId || 'N/A'}`, inline: true },
                { name: 'Usuário', value: `<@${appealData.userId}>`, inline: true },
                { name: 'Nick no Jogo', value: appealData.ingameName, inline: true },
                { name: 'Punição', value: appealData.punishmentType, inline: true },
                { name: 'Decidido por', value: `<@${member.id}>`, inline: true },
                { name: 'Resultado', value: isApproval ? '✅ Aprovado' : '❌ Negado', inline: true }
              )
              .setTimestamp();
            await sendToConfiguredChannels(interaction.guild, ['ticketsOpenLogsChannelId'], { embeds: [logEmbed] });
          } catch (err) { console.error('Erro enviando log de resposta de appeal:', err); }

        } catch (error) {
          console.error('Erro ao processar resposta do appeal:', error);
          await interaction.editReply({
            content: '❌ Erro ao processar a resposta do appeal.'
          });
        }
      }

      // Handlers para botões do servidor de revisão
      if (interaction.isButton() && interaction.customId.startsWith('review_')) {
        const [action, type, sourceGuildId, appealId] = interaction.customId.split('_');
        
        if (type === 'approve' || type === 'deny') {
          const isApproval = type === 'approve';
          
          await interaction.deferReply();

          try {
            // Buscar o appeal no servidor de origem
            const { getAppeal } = require('../utils/appealsStore');
            const appealData = getAppeal(sourceGuildId, appealId);
            
            if (!appealData) {
              return interaction.editReply({
                content: '❌ Appeal não encontrado ou já processado.'
              });
            }

            // Buscar o servidor e canal originais
            const sourceGuild = interaction.client.guilds.cache.get(sourceGuildId);
            if (!sourceGuild) {
              return interaction.editReply({
                content: '❌ Servidor de origem não encontrado.'
              });
            }

            const sourceChannel = appealData.channelId ? 
              sourceGuild.channels.cache.get(appealData.channelId) : null;

            // Atualizar o appeal
            const updatedAppeal = updateAppeal(sourceGuildId, appealId, {
              status: isApproval ? 'approved' : 'denied',
              resolvedBy: interaction.user.id,
              resolvedAt: Date.now(),
              responseMessage: isApproval ? 'Revisão aprovada - Punição revogada' : 'Revisão negada - Provas insuficientes',
              reviewedByServer: interaction.guild.id
            });

            // Resposta para o servidor de revisão
            let reviewResponseEmbed;
            if (isApproval) {
              reviewResponseEmbed = new EmbedBuilder()
                .setTitle('✅ Revisão Aprovada')
                .setColor(0x00ff00)
                .setDescription(
                  `**Appeal aprovado pela equipe de revisão**\n\n` +
                  `🌐 **Servidor:** ${sourceGuild.name}\n` +
                  `👤 **Usuário:** ${appealData.username}\n` +
                  `🎮 **Nick:** ${appealData.ingameName}\n` +
                  `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                  `✅ **Decisão:** Punição revogada\n` +
                  `👨‍💼 **Revisado por:** ${interaction.user}`
                )
                .setTimestamp();
            } else {
              reviewResponseEmbed = new EmbedBuilder()
                .setTitle('❌ Revisão Negada')
                .setColor(0xff0000)
                .setDescription(
                  `**Appeal negado pela equipe de revisão**\n\n` +
                  `🌐 **Servidor:** ${sourceGuild.name}\n` +
                  `👤 **Usuário:** ${appealData.username}\n` +
                  `🎮 **Nick:** ${appealData.ingameName}\n` +
                  `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                  `❌ **Decisão:** Punição mantida\n` +
                  `👨‍💼 **Revisado por:** ${interaction.user}`
                )
                .setTimestamp();
            }

            await interaction.editReply({ embeds: [reviewResponseEmbed] });

            // Desabilitar botões da mensagem original
            const disabledRow = new ActionRowBuilder().addComponents(
              ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
              ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true),
              ButtonBuilder.from(interaction.message.components[0].components[2]).setDisabled(true)
            );

            await interaction.message.edit({ components: [disabledRow] });

            // Enviar resposta no canal original se existir
            if (sourceChannel && sourceChannel.isTextBased()) {
              let originalResponseEmbed;
              if (isApproval) {
                originalResponseEmbed = new EmbedBuilder()
                  .setTitle('✅ Appeal Aprovado - Punição Revogada')
                  .setColor(0x00ff00)
                  .setDescription(
                    `**Parabéns!** Seu appeal foi **aprovado** pela equipe de revisão.\n\n` +
                    `🎮 **Nick:** ${appealData.ingameName}\n` +
                    `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                    `✅ **Status:** Punição revogada\n\n` +
                    `A punição foi removida do seu histórico. Você já pode voltar a jogar normalmente.`
                  )
                  .setFooter({ text: 'Appeal processado pela equipe de revisão • Decisão final' })
                  .setTimestamp();
              } else {
                originalResponseEmbed = new EmbedBuilder()
                  .setTitle('❌ Appeal Negado - Punição Mantida')
                  .setColor(0xff0000)
                  .setDescription(
                    `Seu appeal foi **negado** pela equipe de revisão.\n\n` +
                    `🎮 **Nick:** ${appealData.ingameName}\n` +
                    `⚖️ **Punição:** ${appealData.punishmentType}\n` +
                    `❌ **Motivo:** As provas apresentadas não foram suficientes para revogar a punição.\n\n` +
                    `⚠️ **Importante:** O limite máximo para appeals é de **1 por usuário**. Você não poderá fazer outro appeal.`
                  )
                  .setFooter({ text: 'Appeal processado pela equipe de revisão • Decisão final' })
                  .setTimestamp();
              }

              await sourceChannel.send({ embeds: [originalResponseEmbed] });

              // Tentar enviar DM para o usuário
              try {
                const appealUser = await sourceGuild.members.fetch(appealData.userId);
                if (appealUser) {
                  await appealUser.send({ embeds: [originalResponseEmbed] });
                }
              } catch (e) {
                await sourceChannel.send(`⚠️ Não foi possível enviar DM para o usuário. A resposta está disponível neste canal.`);
              }
            }

            console.log(`[APPEAL-REVIEW] ${isApproval ? 'Aprovado' : 'Negado'} por ${interaction.user.username} no servidor ${interaction.guild.name}`);

          } catch (error) {
            console.error('Erro ao processar revisão de appeal:', error);
            await interaction.editReply({
              content: '❌ Erro ao processar a revisão do appeal.'
            });
          }

        } else if (type === 'info') {
          // Mostrar informações detalhadas do appeal
          await interaction.deferReply({ ephemeral: true });

          try {
            const { getAppeal } = require('../utils/appealsStore');
            const appealData = getAppeal(sourceGuildId, appealId);
            
            if (!appealData) {
              return interaction.editReply({
                content: '❌ Appeal não encontrado.'
              });
            }

            const sourceGuild = interaction.client.guilds.cache.get(sourceGuildId);
            const sourceGuildName = sourceGuild ? sourceGuild.name : 'Servidor Desconhecido';

            const infoEmbed = new EmbedBuilder()
              .setTitle('📋 Informações Detalhadas do Appeal')
              .setColor(0x3498db)
              .addFields(
                { name: '🆔 ID do Appeal', value: appealData.id, inline: true },
                { name: '🌐 Servidor', value: sourceGuildName, inline: true },
                { name: '📅 Criado em', value: `<t:${Math.floor(appealData.createdAt / 1000)}:F>`, inline: true },
                { name: '👤 Usuário Discord', value: `${appealData.username} (${appealData.userId})`, inline: false },
                { name: '🎮 Nick no Jogo', value: appealData.ingameName, inline: true },
                { name: '⚖️ Punição', value: appealData.punishmentType, inline: true },
                { name: '📝 Justificativa Completa', value: appealData.reviewReason.slice(0, 1000), inline: false },
                { name: '📊 Status Atual', value: appealData.status, inline: true }
              )
              .setTimestamp();

            if (appealData.channelId) {
              infoEmbed.addFields({
                name: '🔗 Canal Original',
                value: `https://discord.com/channels/${sourceGuildId}/${appealData.channelId}`,
                inline: false
              });
            }

            await interaction.editReply({ embeds: [infoEmbed] });

          } catch (error) {
            console.error('Erro ao buscar informações do appeal:', error);
            await interaction.editReply({
              content: '❌ Erro ao buscar informações do appeal.'
            });
          }
        }
      }

    } catch (e) {
      console.error('Erro no interactionCreate:', e);
      try { if (!interaction.replied) await interaction.reply({ content: 'Erro ao processar interação.', ephemeral: true }); } catch (er) { }
    }
  }
};

// Função para fechar ticket (removido sistema de avaliação)
async function closeTicketWithRating(ch, closedBy, rating) {
  try {
    const { generateTranscript } = require('../utils/transcripts');
    const { removeOpenTicketByChannel } = require('../utils/ticketsStore');
    const { sendToConfiguredChannels } = require('../utils/logger');
    const { EmbedBuilder } = require('discord.js');
    
    let info = removeOpenTicketByChannel(ch.guild.id, ch.id);
    const path = await generateTranscript(ch);
    
    // Se não encontrou info no store, cria uma básica para tickets órfãos
    if (!info) {
      console.log(`[TICKET] Fechando ticket órfão sem info no store: ${ch.name}`);
      info = {
        openerId: null,
        userId: null,
        responsibleId: null,
        createdAt: Date.now() - (24 * 60 * 60 * 1000), // assume 1 dia atrás
        ticketNumber: 0,
        type: 'unknown'
      };
    }
    
    // Calcular duração
    const duration = Date.now() - info.createdAt;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);
    const durationText = `${hours}h ${minutes}m ${seconds}s`;
    
    // Buscar usuários - tratar casos onde os IDs podem ser null
    const memberId = info.openerId || info.userId;
    const member = memberId ? await ch.guild.members.fetch(memberId).catch(() => null) : null;
    const responsible = info.responsibleId ? await ch.guild.members.fetch(info.responsibleId).catch(() => null) : null;
    
    // Criar embed sem avaliação
    const finalEmbed = new EmbedBuilder()
      .setTitle('🎫 Atendimento Finalizado')
      .setDescription('Veja as informações desse atendimento.')
      .setColor(0xCC1100)
      .addFields(
        { name: '👤 Membro:', value: member ? `${member.user.username}` : 'Usuário desconhecido', inline: true },
        { name: '😊 Responsável:', value: responsible ? `${responsible.user.username}` : 'Nenhum', inline: true },
        { name: '⏱️ Duração:', value: durationText, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: new Date().toLocaleDateString('pt-BR') });
    
    // Enviar para canais configurados
    await sendToConfiguredChannels(ch.guild, ['transcriptsChannelId'], { 
      embeds: [finalEmbed], 
      files: [path] 
    });
    
    // Avisar no canal e deletar
    await ch.send({ content: 'Atendimento finalizado. Canal será removido em 5 segundos.', files: [path] });
    
    // Remover arquivo local
    const fs = require('fs');
    try { fs.unlinkSync(path); } catch (e) { /* ignore */ }
    
    // Deletar canal
    setTimeout(async () => {
      try { await ch.delete('Atendimento finalizado'); } 
      catch (e) { console.error('Erro ao deletar canal:', e); }
    }, 5000);
    
  } catch (error) {
    console.error('Erro ao finalizar ticket:', error);
  }
}
