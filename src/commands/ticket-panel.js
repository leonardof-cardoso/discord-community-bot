const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPanelConfig, setPanelConfig, addCategory, removeCategory } = require('../utils/panelConfig');
const { readConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Configura e publica o painel de tickets deste servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('show')
      .setDescription('Mostra a configuração atual do painel'))
    .addSubcommand(sc => sc
      .setName('list-categories')
      .setDescription('Lista todas as categorias do painel'))
    .addSubcommand(sc => sc
      .setName('set-texts')
      .setDescription('Define título/descrição/rodapé e banner')
      .addStringOption(o => o.setName('title').setDescription('Título do embed').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Descrição do embed').setRequired(false))
      .addStringOption(o => o.setName('footer').setDescription('Rodapé do embed').setRequired(false))
      .addStringOption(o => o.setName('banner').setDescription('URL da imagem/banner').setRequired(false))
      .addBooleanOption(o => o.setName('use_select').setDescription('Usar menu de categorias (select) em vez de botões?').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('add-category')
      .setDescription('Adiciona/atualiza uma categoria do painel (para select)')
      .addStringOption(o => o.setName('id').setDescription('ID interno (ex: denuncias)').setRequired(true))
      .addStringOption(o => o.setName('label').setDescription('Rótulo visível').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (ex: 🚨)').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Descrição curta').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('remove-category')
      .setDescription('Remove uma categoria do painel')
      .addStringOption(o => o.setName('id').setDescription('ID interno a remover').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('post')
      .setDescription('Publica o painel no canal configurado ou no canal atual'))
    .addSubcommand(sc => sc
      .setName('setup-default')
      .setDescription('Configura o painel com as 5 categorias padrão (Denúncias, Bugs, Appeal, Ouvidoria, Compras)'))
    .addSubcommand(sc => sc
      .setName('setup-completo')
      .setDescription('Configura o painel completo com todas as opções, banner oficial e confirmação de facção'))
    .addSubcommand(sc => sc
      .setName('setup-urgente-revisoes')
      .setDescription('Configura o painel com Bugs Urgentes, Revisões de Líderes e Entrega de Keys VIPs'))
    .addSubcommand(sc => sc
      .setName('organizar-tickets')
      .setDescription('Reorganiza tickets existentes em categorias específicas')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const panel = getPanelConfig(guildId);
      const categoriesText = panel.categories && panel.categories.length > 0 
        ? panel.categories.map(c => `• ${c.id} (${c.label || 'sem label'}) ${c.emoji || ''}`).join('\n')
        : '(nenhuma categoria)';
      
      return interaction.reply({
        ephemeral: true,
        content: `**Configuração atual do painel:**\n\n` +
                `**Modo:** ${panel.useSelect ? 'Select Menu' : 'Botões padrão'}\n` +
                `**Título:** ${panel.title}\n` +
                `**Banner:** ${panel.banner || '(sem banner)'}\n` +
                `**Rodapé:** ${panel.footer}\n\n` +
                `**Categorias (${panel.categories.length}):**\n${categoriesText}`
      });
    }

    if (sub === 'list-categories') {
      const panel = getPanelConfig(guildId);
      if (!panel.categories || panel.categories.length === 0) {
        return interaction.reply({ ephemeral: true, content: 'Nenhuma categoria configurada. Use `/ticket-panel add-category` para adicionar.' });
      }
      
      const categoriesText = panel.categories.map((c, index) => {
        return `**${index + 1}. ${c.id}**\n` +
               `   Label: ${c.label || '(sem label)'}\n` +
               `   Emoji: ${c.emoji || '(sem emoji)'}\n` +
               `   Descrição: ${c.description || '(sem descrição)'}`;
      }).join('\n\n');
      
      return interaction.reply({
        ephemeral: true,
        content: `**Categorias configuradas (${panel.categories.length}):**\n\n${categoriesText}`
      });
    }

    if (sub === 'set-texts') {
      const partial = {};
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const footer = interaction.options.getString('footer');
      const banner = interaction.options.getString('banner');
      const useSelect = interaction.options.getBoolean('use_select');
      if (title !== null) partial.title = title;
      if (description !== null) partial.description = description;
      if (footer !== null) partial.footer = footer;
      if (banner !== null) partial.banner = banner;
      if (useSelect !== null) partial.useSelect = useSelect;
      const updated = setPanelConfig(guildId, partial);
      return interaction.reply({ ephemeral: true, content: 'Painel atualizado com sucesso.' });
    }

    if (sub === 'add-category') {
      const id = interaction.options.getString('id');
      const label = interaction.options.getString('label');
      const emoji = interaction.options.getString('emoji') || undefined;
      const description = interaction.options.getString('description') || undefined;
      addCategory(guildId, { id, label, emoji, description });
      return interaction.reply({ ephemeral: true, content: `Categoria '${id}' salva.` });
    }

    if (sub === 'remove-category') {
      const id = interaction.options.getString('id');
      const panelBefore = getPanelConfig(guildId);
      const existsBefore = (panelBefore.categories || []).find(c => c.id === id);
      
      if (!existsBefore) {
        return interaction.reply({ ephemeral: true, content: `Categoria '${id}' não encontrada. Use /ticket-panel show para ver as categorias existentes.` });
      }
      
      const updated = removeCategory(guildId, id);
      const existsAfter = (updated.categories || []).find(c => c.id === id);
      
      if (existsAfter) {
        return interaction.reply({ ephemeral: true, content: `Erro ao remover categoria '${id}'. Tente novamente.` });
      }
      
      return interaction.reply({ ephemeral: true, content: `Categoria '${id}' removida com sucesso. Total de categorias: ${updated.categories.length}` });
    }

    if (sub === 'post') {
      const panel = getPanelConfig(guildId);
      const cfg = readConfig();
      const gcfg = cfg[guildId] || {};

      const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .setColor(0xCC1100)
        .setFooter({ text: panel.footer });
      if (panel.banner) embed.setImage(panel.banner);

      let components = [];
      if (Array.isArray(panel.categories) && panel.categories.length > 0) {
        // Garantir que useSelect esteja ativo quando há categorias
        if (!panel.useSelect) {
          setPanelConfig(guildId, { useSelect: true });
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId('ticket_select')
          .setPlaceholder('Selecione a categoria do seu problema')
          .addOptions(panel.categories.map(c => ({ label: c.label, value: c.id, emoji: c.emoji, description: c.description })));
        components = [new ActionRowBuilder().addComponents(select)];
      } else {
        // Sem categorias configuradas: não publique o painel antigo; oriente o usuário
        return interaction.reply({
          ephemeral: true,
          content: '⚠️ O painel novo com categorias ainda não está configurado.\n' +
                   'Use `/ticket-panel setup-default` para criar as categorias padrão ou adicione manualmente com:\n' +
                   '• `/ticket-panel add-category id:<id> label:"Rótulo" emoji:🔧 description:"Descrição"`\n' +
                   'Depois, execute `/ticket-panel post` novamente.'
        });
      }

  const targetCh = gcfg.channelId ? interaction.guild.channels.cache.get(gcfg.channelId) : interaction.channel;
  const sent = await targetCh.send({ embeds: [embed], components });
  // salvar messageId para edição futura no startup
  setPanelConfig(guildId, { messageId: sent.id });
  return interaction.reply({ ephemeral: true, content: 'Painel publicado (modelo novo com categorias).'});
    }

    if (sub === 'setup-default') {
      // Configurar textos padrão e ativar select
      setPanelConfig(guildId, {
        useSelect: true,
        title: '🔔 Atendimento',
        description: 'Precisa de ajuda?\nClique no botão abaixo e selecione o tipo de atendimento que você precisa!\n\nO tempo de resposta no período de 00:00 até às 08:00 é reduzido.',
        footer: 'Nosso time está pronto para te atender.',
        banner: 'https://media.discordapp.net/attachments/1354984419865395360/1355005248380338366/C13123amada_0.png?ex=68f79839&is=68f646b9&hm=8d78b91bc7412efb3f7ecc2196434e6c43be3425621f3ebc9b450a603b1d2ead&=&format=webp&quality=lossless&width=1867&height=462',
        categories: []
      });

      // Adicionar as 5 categorias padrão
      const defaultCategories = [
        {
          id: 'denuncias',
          label: 'Denúncias',
          emoji: '🚨',
          description: 'Denuncie um jogador.'
        },
        {
          id: 'bugs',
          label: 'Bugs',
          emoji: '⚠️',
          description: 'Denuncie um bug.'
        },
        {
          id: 'appeal',
          label: 'Appeal',
          emoji: '📩',
          description: 'Revisão de punições.'
        },
        {
          id: 'ouvidoria',
          label: 'Ouvidoria',
          emoji: '💡',
          description: 'Denuncie um membro da equipe.'
        },
        {
          id: 'compras',
          label: 'Compras',
          emoji: '🛒',
          description: 'Problema com alguma compra.'
        }
      ];

      // Adicionar cada categoria
      for (const category of defaultCategories) {
        addCategory(guildId, category);
      }

      return interaction.reply({ 
        ephemeral: true, 
        content: `✅ **Painel configurado com sucesso!**\n\n` +
                `• Modo: Select Menu ativado\n` +
                `• Categorias: ${defaultCategories.length} categorias adicionadas\n` +
                `• Use \`/ticket-panel post\` para publicar o painel\n` +
                `• Use \`/ticket-panel set-texts banner:"URL"\` para definir uma imagem de banner`
      });
    }

    if (sub === 'setup-completo') {
      // Banner fornecido
      const bannerUrl = 'https://media.discordapp.net/attachments/1354984419865395360/1355005248380338366/C13123amada_0.png?ex=68f79839&is=68f646b9&hm=8d78b91bc7412efb3f7ecc2196434e6c43be3425621f3ebc9b450a603b1d2ead&=&format=webp&quality=lossless&width=1867&height=462';
      setPanelConfig(guildId, {
        useSelect: true,
        title: '🔔 Atendimento — Central de Suporte',
        description: 'Precisa de ajuda? Selecione a categoria que melhor descreve sua solicitação. Nossa equipe responderá o quanto antes.',
        footer: 'Leia as regras antes de abrir um ticket. Evite spam.',
        banner: bannerUrl,
        categories: []
      });

      const cats = [
        { id: 'denuncias', label: 'Denúncias', emoji: '🚨', description: 'Denuncie jogadores com evidências.' },
        { id: 'bugs', label: 'Bugs', emoji: '⚠️', description: 'Reporte bugs gerais do servidor.' },
        { id: 'appeal', label: 'Appeal', emoji: '📩', description: 'Solicite revisão de punição.' },
        { id: 'ouvidoria', label: 'Ouvidoria', emoji: '💡', description: 'Relate conduta de membros da equipe.' },
        { id: 'compras', label: 'Compras', emoji: '🛒', description: 'Suporte para pagamentos e itens.' },
        { id: 'duvidas', label: 'Dúvidas Gerais', emoji: '❓', description: 'Questões rápidas e orientações.' },
        { id: 'confirma_faccao', label: 'Confirma a sua facção', emoji: '🏆', description: 'Confirme a participação da sua facção no evento.' }
      ];
      for (const c of cats) addCategory(guildId, c);

      return interaction.reply({
        ephemeral: true,
        content: '✅ Painel COMPLETO configurado com sucesso!\n• Banner aplicado\n• Categorias: ' + cats.length + '\n• Execute `/ticket-panel post` para publicar'
      });
    }

    if (sub === 'setup-urgente-revisoes') {
      setPanelConfig(guildId, {
        useSelect: true,
        title: '🔔 Atendimento Prioritário',
        description: 'Escolha entre Bugs Urgentes, Revisões de Líderes ou Entrega de Keys VIPs.',
        footer: 'Atendimento prioritário. Use de forma responsável.',
        banner: 'https://media.discordapp.net/attachments/1354984419865395360/1355005248380338366/C13123amada_0.png?ex=68f79839&is=68f646b9&hm=8d78b91bc7412efb3f7ecc2196434e6c43be3425621f3ebc9b450a603b1d2ead&=&format=webp&quality=lossless&width=1867&height=462',
        categories: []
      });

      const cats = [
        { id: 'bugs_urgentes', label: 'Bugs Urgentes', emoji: '⏱️', description: 'Bugs críticos que exigem atenção imediata.' },
        { id: 'revisoes_lideres', label: 'Revisões de Líderes', emoji: '🧭', description: 'Revisão apenas para líderes banidos.' },
        { id: 'keys_vips', label: 'Entrega de Keys VIPs', emoji: '🔑', description: 'Solicitação de keys VIPs - Apenas para líderes.' }
      ];
      for (const c of cats) addCategory(guildId, c);

      return interaction.reply({
        ephemeral: true,
        content: '✅ Painel URGENTE/REVISÕES configurado!\n• Categorias: Bugs Urgentes, Revisões de Líderes e Entrega de Keys VIPs\n• Execute `/ticket-panel post` para publicar'
      });
    }

    if (sub === 'organizar-tickets') {
      await interaction.deferReply({ ephemeral: true });
      
      const { readConfig } = require('../utils/config');
      const { ChannelType } = require('discord.js');
      const cfg = readConfig();
      const gcfg = cfg[guildId] || {};
      
      // Buscar todos os canais de ticket existentes
      const guild = interaction.guild;
      const ticketChannels = guild.channels.cache.filter(ch => 
        ch.type === ChannelType.GuildText && 
        (ch.name.includes('-') || ch.parent?.name?.includes('Ticket') || ch.parent?.name?.includes('📂'))
      );

      if (ticketChannels.size === 0) {
        return interaction.editReply('❌ Nenhum canal de ticket encontrado para reorganizar.');
      }

      const panelConfig = getPanelConfig(guildId);
      const categories = panelConfig.categories || [];
      
      let moved = 0;
      let created = 0;
      const errors = [];

      for (const [, channel] of ticketChannels) {
        try {
          // Tentar identificar o tipo do ticket pelo nome
          let ticketType = null;
          
          // Buscar no store primeiro
          const { getTicketByChannel } = require('../utils/ticketsStore');
          const ticketInfo = getTicketByChannel(guildId, channel.id);
          if (ticketInfo && ticketInfo.type) {
            ticketType = ticketInfo.type;
          } else {
            // Tentar identificar pelo nome do canal
            for (const cat of categories) {
              if (channel.name.startsWith(cat.id) || channel.name.includes(cat.id)) {
                ticketType = cat.id;
                break;
              }
            }
          }

          if (!ticketType) {
            // Se não conseguiu identificar, pular
            continue;
          }

          // Encontrar a categoria correspondente
          const categoryInfo = categories.find(c => c.id === ticketType);
          if (!categoryInfo) continue;

          const categoryName = `📂 ${categoryInfo.label}`;
          
          // Verificar se a categoria já existe
          let targetCategory = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && c.name === categoryName
          );

          // Criar categoria se não existir
          if (!targetCategory) {
            targetCategory = await guild.channels.create({
              name: categoryName,
              type: ChannelType.GuildCategory,
              position: 0
            });
            created++;
          }

          // Mover o canal se não estiver na categoria correta
          if (channel.parentId !== targetCategory.id) {
            await channel.setParent(targetCategory.id);
            moved++;
          }

        } catch (error) {
          console.error(`Erro ao organizar canal ${channel.name}:`, error);
          errors.push(`${channel.name}: ${error.message}`);
        }
      }

      let result = `✅ **Organização concluída!**\n`;
      result += `📂 Categorias criadas: ${created}\n`;
      result += `🔄 Canais movidos: ${moved}\n`;
      result += `📊 Total de tickets verificados: ${ticketChannels.size}`;
      
      if (errors.length > 0) {
        result += `\n\n⚠️ **Erros (${errors.length}):**\n`;
        result += errors.slice(0, 3).map(e => `• ${e}`).join('\n');
        if (errors.length > 3) {
          result += `\n• ... e mais ${errors.length - 3} erros`;
        }
      }

      return interaction.editReply(result);
    }
  }
};
