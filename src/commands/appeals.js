const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllPendingAppeals, getUserAppeals, updateAppeal } = require('../utils/appealsStore');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeals')
    .setDescription('Gerenciar sistema de appeals')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista todos os appeals pendentes')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Mostra appeals de um usuário específico')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para verificar appeals')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Estatísticas gerais dos appeals')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset-user')
        .setDescription('Resetar limite de appeal de um usuário (CUIDADO!)')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para resetar limite')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option
            .setName('confirmar')
            .setDescription('Confirma que deseja resetar (obrigatório)')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    await interaction.deferReply();

    try {
      if (subcommand === 'list') {
        const pendingAppeals = getAllPendingAppeals(guildId);

        if (pendingAppeals.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('📩 Appeals Pendentes')
            .setDescription('✅ Não há appeals pendentes no momento.')
            .setColor(0x00ff00)
            .setTimestamp();

          return await interaction.editReply({ embeds: [embed] });
        }

        // Dividir em páginas se necessário
        const appealsPerPage = 5;
        const totalPages = Math.ceil(pendingAppeals.length / appealsPerPage);
        const currentAppeals = pendingAppeals.slice(0, appealsPerPage);

        const embed = new EmbedBuilder()
          .setTitle('📩 Appeals Pendentes')
          .setDescription(`Total: ${pendingAppeals.length} appeals aguardando resposta`)
          .setColor(0xff9500);

        currentAppeals.forEach(appeal => {
          const createdAt = new Date(appeal.createdAt);
          const timeAgo = Math.floor((Date.now() - appeal.createdAt) / (1000 * 60 * 60 * 24));
          
          embed.addFields({
            name: `🎫 Appeal #${appeal.ticketId || 'N/A'}`,
            value: 
              `**Usuário:** <@${appeal.userId}>\n` +
              `**Nick no Jogo:** ${appeal.ingameName}\n` +
              `**Punição:** ${appeal.punishmentType}\n` +
              `**Canal:** ${appeal.channelId ? `<#${appeal.channelId}>` : 'N/A'}\n` +
              `**Criado:** ${timeAgo}d atrás`,
            inline: false
          });
        });

        if (totalPages > 1) {
          embed.setFooter({ text: `Página 1 de ${totalPages} • Use o comando novamente para ver mais` });
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'user') {
        const user = interaction.options.getUser('usuario');
        const userAppeals = getUserAppeals(guildId, user.id);

        if (userAppeals.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('📩 Appeals do Usuário')
            .setDescription(`${user} não possui nenhum appeal registrado.`)
            .setColor(0x95a5a6)
            .setTimestamp();

          return await interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle('📩 Appeals do Usuário')
          .setDescription(`Histórico de appeals de ${user}:`)
          .setColor(0x3498db);

        userAppeals.forEach(appeal => {
          const statusEmoji = {
            'pending': '⏳',
            'approved': '✅',
            'denied': '❌'
          }[appeal.status] || '❓';

          const statusText = {
            'pending': 'Pendente',
            'approved': 'Aprovado',
            'denied': 'Negado'
          }[appeal.status] || 'Desconhecido';

          const createdAt = new Date(appeal.createdAt);
          const resolvedAt = appeal.resolvedAt ? new Date(appeal.resolvedAt) : null;

          let fieldValue = 
            `**Nick no Jogo:** ${appeal.ingameName}\n` +
            `**Punição:** ${appeal.punishmentType}\n` +
            `**Status:** ${statusEmoji} ${statusText}\n` +
            `**Criado:** <t:${Math.floor(appeal.createdAt / 1000)}:F>`;

          if (resolvedAt) {
            fieldValue += `\n**Resolvido:** <t:${Math.floor(appeal.resolvedAt / 1000)}:F>`;
            if (appeal.resolvedBy) {
              fieldValue += `\n**Por:** <@${appeal.resolvedBy}>`;
            }
          }

          if (appeal.channelId) {
            fieldValue += `\n**Canal:** <#${appeal.channelId}>`;
          }

          embed.addFields({
            name: `🎫 Appeal #${appeal.ticketId || 'N/A'} ${statusEmoji}`,
            value: fieldValue,
            inline: false
          });
        });

        // Verificar se pode fazer novo appeal
        const hasActive = userAppeals.some(a => a.status === 'pending' || a.status === 'denied');
        if (hasActive) {
          embed.addFields({
            name: '⚠️ Status Atual',
            value: '🚫 Usuário **não pode** fazer novos appeals (limite atingido ou negado)',
            inline: false
          });
        } else {
          embed.addFields({
            name: '✅ Status Atual',
            value: '✅ Usuário **pode** fazer novos appeals',
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'stats') {
        // Ler arquivo de appeals para estatísticas
        const appealsPath = path.join(__dirname, '..', '..', 'appeals.json');
        let appealsData = {};
        try {
          appealsData = JSON.parse(fs.readFileSync(appealsPath, 'utf8') || '{}');
        } catch (e) {
          appealsData = {};
        }

        const guildAppeals = Object.values(appealsData[guildId] || {});
        const totalAppeals = guildAppeals.length;
        const pendingCount = guildAppeals.filter(a => a.status === 'pending').length;
        const approvedCount = guildAppeals.filter(a => a.status === 'approved').length;
        const deniedCount = guildAppeals.filter(a => a.status === 'denied').length;
        const uniqueUsers = new Set(guildAppeals.map(a => a.userId)).size;

        // Appeals dos últimos 7 dias
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentAppeals = guildAppeals.filter(a => a.createdAt > weekAgo).length;

        // Taxa de aprovação
        const resolvedAppeals = approvedCount + deniedCount;
        const approvalRate = resolvedAppeals > 0 ? ((approvedCount / resolvedAppeals) * 100).toFixed(1) : '0';

        const embed = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Appeals')
          .setColor(0x3498db)
          .addFields(
            { name: '📈 Total de Appeals', value: `${totalAppeals}`, inline: true },
            { name: '⏳ Pendentes', value: `${pendingCount}`, inline: true },
            { name: '✅ Aprovados', value: `${approvedCount}`, inline: true },
            { name: '❌ Negados', value: `${deniedCount}`, inline: true },
            { name: '👥 Usuários Únicos', value: `${uniqueUsers}`, inline: true },
            { name: '📅 Últimos 7 dias', value: `${recentAppeals}`, inline: true },
            { name: '📊 Taxa de Aprovação', value: `${approvalRate}%`, inline: true },
            { name: '🔄 Processados', value: `${resolvedAppeals}`, inline: true }
          )
          .setFooter({ 
            text: `Servidor: ${interaction.guild.name}`,
            iconURL: interaction.guild.iconURL()
          })
          .setTimestamp();

        // Top punições mais appealadas
        if (totalAppeals > 0) {
          const punishmentCounts = {};
          guildAppeals.forEach(appeal => {
            const punishment = appeal.punishmentType?.toLowerCase() || 'desconhecido';
            punishmentCounts[punishment] = (punishmentCounts[punishment] || 0) + 1;
          });

          const topPunishments = Object.entries(punishmentCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([punishment, count]) => `• **${punishment}**: ${count}x`)
            .join('\n');

          if (topPunishments) {
            embed.addFields({
              name: '🏆 Top Punições Appealadas',
              value: topPunishments,
              inline: false
            });
          }
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'reset-user') {
        const user = interaction.options.getUser('usuario');
        const confirmar = interaction.options.getBoolean('confirmar');

        if (!confirmar) {
          return await interaction.editReply({
            content: '❌ Você precisa confirmar a ação definindo o parâmetro `confirmar` como `True`.'
          });
        }

        // Verificar permissão de administrador
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return await interaction.editReply({
            content: '❌ Apenas administradores podem resetar limites de appeals.'
          });
        }

        const userAppeals = getUserAppeals(guildId, user.id);
        
        if (userAppeals.length === 0) {
          return await interaction.editReply({
            content: `❌ ${user} não possui appeals para resetar.`
          });
        }

        // Atualizar todos os appeals do usuário para "reset" para permitir novo appeal
        const appealsPath = path.join(__dirname, '..', '..', 'appeals.json');
        let appealsData = {};
        try {
          appealsData = JSON.parse(fs.readFileSync(appealsPath, 'utf8') || '{}');
        } catch (e) {
          appealsData = {};
        }

        let resetCount = 0;
        if (appealsData[guildId]) {
          Object.keys(appealsData[guildId]).forEach(appealId => {
            const appeal = appealsData[guildId][appealId];
            if (appeal.userId === user.id && (appeal.status === 'denied' || appeal.status === 'pending')) {
              appeal.status = 'reset';
              appeal.resetBy = interaction.user.id;
              appeal.resetAt = Date.now();
              resetCount++;
            }
          });

          fs.writeFileSync(appealsPath, JSON.stringify(appealsData, null, 2));
        }

        const embed = new EmbedBuilder()
          .setTitle('🔄 Limite de Appeal Resetado')
          .setDescription(`O limite de appeals foi resetado para ${user}.`)
          .addFields(
            { name: '👤 Usuário', value: `${user}`, inline: true },
            { name: '🔢 Appeals Resetados', value: `${resetCount}`, inline: true },
            { name: '👨‍💼 Resetado por', value: `${interaction.user}`, inline: true }
          )
          .setColor(0x00ff00)
          .setFooter({ text: 'O usuário agora pode fazer um novo appeal' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Log da ação
        try {
          const { sendToConfiguredChannels } = require('../utils/logger');
          const logEmbed = new EmbedBuilder()
            .setTitle('🔄 Limite de Appeal Resetado')
            .setColor(0xff9500)
            .addFields(
              { name: 'Usuário', value: `<@${user.id}>`, inline: true },
              { name: 'Resetado por', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Appeals Resetados', value: `${resetCount}`, inline: true }
            )
            .setTimestamp();
          await sendToConfiguredChannels(interaction.guild, ['ticketsOpenLogsChannelId'], { embeds: [logEmbed] });
        } catch (err) { console.error('Erro enviando log de reset:', err); }
      }

    } catch (error) {
      console.error('Erro no comando appeals:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};