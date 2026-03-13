const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole-sync')
    .setDescription('Aplica autorole para membros que entraram quando o bot estava offline')
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('Verifica quantos membros não possuem o autorole')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('apply')
        .setDescription('Aplica o autorole para todos os membros sem ele')
        .addBooleanOption(option =>
          option
            .setName('confirmar')
            .setDescription('Confirma que deseja aplicar o autorole (obrigatório)')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option
            .setName('notificar')
            .setDescription('Enviar notificação no canal de entrada para cada membro (padrão: false)')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('apply-user')
        .setDescription('Aplica o autorole para um usuário específico')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para receber o autorole')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option
            .setName('notificar')
            .setDescription('Enviar notificação no canal de entrada (padrão: false)')
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const cfg = readConfig();
    const gcfg = cfg[interaction.guild.id] || {};

    // Verificar se autorole está configurado
    if (!gcfg.autoRoleId) {
      return await interaction.reply({
        content: '❌ Autorole não está configurado neste servidor. Use `/autorole set` primeiro.',
        ephemeral: true
      });
    }

    const autoRole = interaction.guild.roles.cache.get(gcfg.autoRoleId);
    if (!autoRole) {
      return await interaction.reply({
        content: `❌ O cargo configurado para autorole (ID: ${gcfg.autoRoleId}) não foi encontrado.`,
        ephemeral: true
      });
    }

    // Verificar permissões do bot
    const me = interaction.guild.members.me;
    const hasManagePerm = me.permissions.has(PermissionsBitField.Flags.ManageRoles);
    const positionOk = me.roles.highest.position > autoRole.position;

    if (!hasManagePerm) {
      return await interaction.reply({
        content: '❌ O bot não tem permissão de Gerenciar Cargos.',
        ephemeral: true
      });
    }

    if (!positionOk) {
      return await interaction.reply({
        content: `❌ O cargo ${autoRole.name} está acima do cargo do bot. Mova o cargo do bot para cima na hierarquia.`,
        ephemeral: true
      });
    }

    if (subcommand === 'scan') {
      await interaction.deferReply();

      try {
        // Buscar todos os membros
        await interaction.guild.members.fetch();
        
        // Filtrar membros sem o autorole (excluindo bots)
        const membersWithoutRole = interaction.guild.members.cache
          .filter(member => !member.user.bot && !member.roles.cache.has(autoRole.id))
          .map(member => ({
            id: member.id,
            username: member.user.username,
            joinedAt: member.joinedAt
          }))
          .sort((a, b) => b.joinedAt - a.joinedAt); // Mais recentes primeiro

        const scanEmbed = new EmbedBuilder()
          .setTitle('🔍 Scan de Autorole')
          .setDescription(`Resultado da verificação:`)
          .addFields(
            { name: '📊 Total de Membros', value: `${interaction.guild.memberCount}`, inline: true },
            { name: '🤖 Bots (ignorados)', value: `${interaction.guild.members.cache.filter(m => m.user.bot).size}`, inline: true },
            { name: '✅ Com Autorole', value: `${interaction.guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(autoRole.id)).size}`, inline: true },
            { name: '❌ Sem Autorole', value: `${membersWithoutRole.length}`, inline: true },
            { name: '🏷️ Cargo Configurado', value: `${autoRole}`, inline: true }
          )
          .setColor(membersWithoutRole.length > 0 ? 0xff9500 : 0x00ff00);

        // Mostrar alguns exemplos de membros sem o cargo
        if (membersWithoutRole.length > 0) {
          const examples = membersWithoutRole.slice(0, 10);
          let exampleText = examples.map(member => 
            `• <@${member.id}> (${member.username}) - <t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
          ).join('\n');
          
          if (membersWithoutRole.length > 10) {
            exampleText += `\n... e mais ${membersWithoutRole.length - 10} membros`;
          }

          scanEmbed.addFields({
            name: '👥 Exemplos de Membros sem Autorole',
            value: exampleText,
            inline: false
          });

          scanEmbed.setFooter({ 
            text: 'Use /autorole-sync apply para aplicar o autorole a todos estes membros' 
          });
        } else {
          scanEmbed.setFooter({ 
            text: 'Todos os membros já possuem o autorole!' 
          });
        }

        await interaction.editReply({ embeds: [scanEmbed] });

      } catch (error) {
        console.error('Erro no scan de autorole:', error);
        await interaction.editReply({
          content: '❌ Erro ao realizar o scan. Verifique se tenho permissão para ver membros.'
        });
      }

    } else if (subcommand === 'apply') {
      const confirmar = interaction.options.getBoolean('confirmar');
      const notificar = interaction.options.getBoolean('notificar') || false;

      if (!confirmar) {
        return await interaction.reply({
          content: '❌ Você precisa confirmar a ação definindo o parâmetro `confirmar` como `True`.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      try {
        // Buscar todos os membros
        await interaction.guild.members.fetch();
        
        // Filtrar membros sem o autorole (excluindo bots)
        const membersWithoutRole = interaction.guild.members.cache
          .filter(member => !member.user.bot && !member.roles.cache.has(autoRole.id));

        if (membersWithoutRole.size === 0) {
          return await interaction.editReply({
            content: '✅ Todos os membros já possuem o autorole!'
          });
        }

        let applied = 0;
        let failed = 0;
        const failedMembers = [];

        // Canal para notificações
        const joinChannel = gcfg.joinLogsChannelId ? 
          interaction.guild.channels.cache.get(gcfg.joinLogsChannelId) : null;

        const progressEmbed = new EmbedBuilder()
          .setTitle('⏳ Aplicando Autorole...')
          .setDescription(`Processando ${membersWithoutRole.size} membros...`)
          .setColor(0xffff00);

        await interaction.editReply({ embeds: [progressEmbed] });

        // Aplicar autorole com delay para evitar rate limit
        for (const [memberId, member] of membersWithoutRole) {
          try {
            await member.roles.add(autoRole, 'Autorole aplicado retroativamente');
            applied++;

            // Notificar no canal de entrada se solicitado
            if (notificar && joinChannel && joinChannel.isTextBased()) {
              try {
                await joinChannel.send(`🔥 <@${member.id}> entrou!`);
              } catch (e) {
                console.warn('Erro ao enviar notificação:', e.message);
              }
            }

            // Delay para evitar rate limit (100ms entre cada aplicação)
            if (membersWithoutRole.size > 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

          } catch (error) {
            console.error(`Erro ao aplicar autorole para ${member.user.username}:`, error);
            failed++;
            failedMembers.push(member.user.username);
          }
        }

        // Resultado final
        const resultEmbed = new EmbedBuilder()
          .setTitle('✅ Autorole Aplicado')
          .setDescription('Processo concluído!')
          .addFields(
            { name: '✅ Sucessos', value: `${applied}`, inline: true },
            { name: '❌ Falhas', value: `${failed}`, inline: true },
            { name: '🏷️ Cargo', value: `${autoRole}`, inline: true }
          )
          .setColor(failed > 0 ? 0xff9500 : 0x00ff00)
          .setTimestamp();

        if (failed > 0 && failedMembers.length > 0) {
          resultEmbed.addFields({
            name: '⚠️ Falhas Detalhadas',
            value: failedMembers.slice(0, 10).join(', ') + 
                   (failedMembers.length > 10 ? `... e mais ${failedMembers.length - 10}` : ''),
            inline: false
          });
        }

        if (notificar && applied > 0) {
          resultEmbed.addFields({
            name: '📢 Notificações',
            value: `${applied} notificações enviadas no canal de entrada`,
            inline: false
          });
        }

        await interaction.editReply({ embeds: [resultEmbed] });

      } catch (error) {
        console.error('Erro ao aplicar autorole:', error);
        await interaction.editReply({
          content: '❌ Erro ao aplicar autorole. Verifique as permissões do bot.'
        });
      }

    } else if (subcommand === 'apply-user') {
      const user = interaction.options.getUser('usuario');
      const notificar = interaction.options.getBoolean('notificar') || false;

      await interaction.deferReply();

      try {
        const member = await interaction.guild.members.fetch(user.id);
        
        if (member.user.bot) {
          return await interaction.editReply({
            content: '❌ Não é possível aplicar autorole a bots.'
          });
        }

        if (member.roles.cache.has(autoRole.id)) {
          return await interaction.editReply({
            content: `✅ ${user} já possui o cargo ${autoRole}.`
          });
        }

        await member.roles.add(autoRole, 'Autorole aplicado manualmente');

        // Notificar no canal de entrada se solicitado
        if (notificar) {
          const joinChannel = gcfg.joinLogsChannelId ? 
            interaction.guild.channels.cache.get(gcfg.joinLogsChannelId) : null;
          
          if (joinChannel && joinChannel.isTextBased()) {
            await joinChannel.send(`🔥 <@${member.id}> entrou!`);
          }
        }

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Autorole Aplicado')
          .setDescription(`O cargo ${autoRole} foi aplicado com sucesso!`)
          .addFields(
            { name: '👤 Usuário', value: `${user}`, inline: true },
            { name: '🏷️ Cargo', value: `${autoRole}`, inline: true }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        if (notificar) {
          successEmbed.addFields({
            name: '📢 Notificação',
            value: 'Notificação enviada no canal de entrada',
            inline: true
          });
        }

        await interaction.editReply({ embeds: [successEmbed] });

      } catch (error) {
        console.error('Erro ao aplicar autorole para usuário:', error);
        await interaction.editReply({
          content: `❌ Erro ao aplicar autorole para ${user}. Verifique se o usuário está no servidor.`
        });
      }
    }
  },
};