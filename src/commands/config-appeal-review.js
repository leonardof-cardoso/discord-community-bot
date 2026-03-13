const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-appeal-review')
    .setDescription('Configurar servidor e canal para revisão de appeals')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Configurar servidor e canal de revisão')
        .addStringOption(option =>
          option
            .setName('server-id')
            .setDescription('ID do servidor Discord para revisão de appeals')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal onde serão enviados os appeals para revisão')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Testar conexão com servidor de revisão')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remover configuração de revisão')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Mostrar configuração atual')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};
    const gcfg = cfg[interaction.guildId];

    if (subcommand === 'set') {
      const serverId = interaction.options.getString('server-id');
      const channel = interaction.options.getChannel('canal');

      await interaction.deferReply();

      try {
        // Resposta imediata para evitar timeout
        await interaction.editReply({
          content: '🔄 Validando configuração...'
        });

        // Verificar se o bot tem acesso ao servidor de revisão
        const reviewGuild = interaction.client.guilds.cache.get(serverId);
        if (!reviewGuild) {
          return await interaction.editReply({
            content: '❌ Bot não tem acesso ao servidor especificado ou ID inválido.'
          });
        }

        // Verificar se o bot tem acesso ao canal
        const reviewChannel = reviewGuild.channels.cache.get(channel.id);
        if (!reviewChannel) {
          return await interaction.editReply({
            content: '❌ Canal especificado não está no servidor de revisão ou bot não tem acesso.'
          });
        }

        if (!reviewChannel.isTextBased()) {
          return await interaction.editReply({
            content: '❌ O canal especificado deve ser um canal de texto.'
          });
        }

        // Verificar permissões do bot no canal
        const botPermissions = reviewChannel.permissionsFor(interaction.client.user);
        if (!botPermissions || !botPermissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
          return await interaction.editReply({
            content: '❌ Bot não tem permissões necessárias no canal (ViewChannel, SendMessages, EmbedLinks).'
          });
        }

        // Salvar configuração
        gcfg.appealReviewGuildId = serverId;
        gcfg.appealReviewChannelId = channel.id;
        writeConfig(cfg);

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Configuração de Revisão de Appeals')
          .setColor(0x00ff00)
          .addFields(
            { name: '🌐 Servidor de Revisão', value: `${reviewGuild.name} (${serverId})`, inline: false },
            { name: '📺 Canal de Revisão', value: `${reviewChannel.name} (${channel.id})`, inline: false },
            { name: '🔧 Status', value: 'Configurado com sucesso', inline: true }
          )
          .setFooter({ text: 'Appeals serão automaticamente encaminhados para revisão' })
          .setTimestamp();

        await interaction.editReply({ content: '', embeds: [successEmbed] });

        // Enviar mensagem de teste no canal de revisão (em background)
        setTimeout(async () => {
          try {
            const testEmbed = new EmbedBuilder()
              .setTitle('🔗 Conexão Estabelecida')
              .setDescription(`Servidor **${interaction.guild.name}** configurou este canal para revisão de appeals.`)
              .setColor(0x3498db)
              .setFooter({ text: `Configurado por ${interaction.user.username}` })
              .setTimestamp();

            await reviewChannel.send({ embeds: [testEmbed] });
          } catch (e) {
            console.warn('Não foi possível enviar mensagem de teste:', e.message);
          }
        }, 1000);

      } catch (error) {
        console.error('Erro ao configurar revisão:', error);
        await interaction.editReply({
          content: `❌ Erro ao configurar servidor de revisão: ${error.message}`
        });
      }

    } else if (subcommand === 'test') {
      await interaction.deferReply();

      const reviewGuildId = gcfg.appealReviewGuildId;
      const reviewChannelId = gcfg.appealReviewChannelId;

      if (!reviewGuildId || !reviewChannelId) {
        return await interaction.editReply({
          content: '❌ Servidor de revisão não configurado. Use `/config-appeal-review set` primeiro.'
        });
      }

      try {
        const reviewGuild = interaction.client.guilds.cache.get(reviewGuildId);
        if (!reviewGuild) {
          return await interaction.editReply({
            content: '❌ Servidor de revisão não encontrado. Verifique a configuração.'
          });
        }

        const reviewChannel = reviewGuild.channels.cache.get(reviewChannelId);
        if (!reviewChannel) {
          return await interaction.editReply({
            content: '❌ Canal de revisão não encontrado. Verifique a configuração.'
          });
        }

        // Primeiro responder que o teste está sendo executado
        await interaction.editReply({
          content: '🔄 Testando conexão com servidor de revisão...'
        });

        // Testar envio de mensagem
        const testEmbed = new EmbedBuilder()
          .setTitle('🧪 Teste de Conexão')
          .setDescription(`Teste de conexão do servidor **${interaction.guild.name}**.`)
          .addFields(
            { name: '📅 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '👤 Testado por', value: `${interaction.user}`, inline: true }
          )
          .setColor(0xffff00)
          .setTimestamp();

        await reviewChannel.send({ embeds: [testEmbed] });

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Teste de Conexão Bem-sucedido')
          .setColor(0x00ff00)
          .addFields(
            { name: '🌐 Servidor', value: `${reviewGuild.name}`, inline: true },
            { name: '📺 Canal', value: `${reviewChannel.name}`, inline: true },
            { name: '🔌 Status', value: 'Conectado', inline: true }
          )
          .setFooter({ text: 'Sistema de revisão funcionando corretamente' })
          .setTimestamp();

        await interaction.editReply({ content: '', embeds: [successEmbed] });

      } catch (error) {
        console.error('Erro no teste de conexão:', error);
        await interaction.editReply({
          content: `❌ Erro ao testar conexão: ${error.message}`
        });
      }

    } else if (subcommand === 'remove') {
      if (!gcfg.appealReviewGuildId && !gcfg.appealReviewChannelId) {
        return await interaction.reply({
          content: '❌ Nenhuma configuração de revisão encontrada.',
          ephemeral: true
        });
      }

      gcfg.appealReviewGuildId = null;
      gcfg.appealReviewChannelId = null;
      writeConfig(cfg);

      const removeEmbed = new EmbedBuilder()
        .setTitle('🗑️ Configuração Removida')
        .setDescription('Configuração de servidor de revisão foi removida.')
        .setColor(0xff9500)
        .setFooter({ text: 'Appeals não serão mais encaminhados automaticamente' })
        .setTimestamp();

      await interaction.reply({ embeds: [removeEmbed] });

    } else if (subcommand === 'show') {
      await interaction.deferReply();
      
      const reviewGuildId = gcfg.appealReviewGuildId;
      const reviewChannelId = gcfg.appealReviewChannelId;

      let statusText = '❌ Não configurado';
      let statusColor = 0xff0000;
      let fields = [];

      if (reviewGuildId && reviewChannelId) {
        const reviewGuild = interaction.client.guilds.cache.get(reviewGuildId);
        const reviewChannel = reviewGuild ? reviewGuild.channels.cache.get(reviewChannelId) : null;

        if (reviewGuild && reviewChannel) {
          statusText = '✅ Configurado e funcionando';
          statusColor = 0x00ff00;
          fields = [
            { name: '🌐 Servidor de Revisão', value: `${reviewGuild.name}`, inline: true },
            { name: '📺 Canal de Revisão', value: `${reviewChannel.name}`, inline: true },
            { name: '🔗 Link do Canal', value: `[Ir para canal](${reviewChannel.url})`, inline: true }
          ];
        } else {
          statusText = '⚠️ Configurado mas com problemas';
          statusColor = 0xff9500;
          fields = [
            { name: '🆔 Server ID', value: reviewGuildId || 'N/A', inline: true },
            { name: '🆔 Channel ID', value: reviewChannelId || 'N/A', inline: true },
            { name: '❗ Problema', value: 'Servidor ou canal não encontrado', inline: false }
          ];
        }
      }

      const showEmbed = new EmbedBuilder()
        .setTitle('📋 Configuração Atual - Revisão de Appeals')
        .setDescription(`**Status:** ${statusText}`)
        .addFields(fields)
        .setColor(statusColor)
        .setTimestamp();

      await interaction.editReply({ embeds: [showEmbed] });
    }
  },
};