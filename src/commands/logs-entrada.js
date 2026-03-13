const { SlashCommandBuilder } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs-entrada')
    .setDescription('🟢 Configura logs APENAS para entrada de novos membros')
    .addSubcommand(sub => 
      sub.setName('set')
        .setDescription('Define canal para registrar APENAS entradas de membros')
        .addChannelOption(o => 
          o.setName('channel')
            .setDescription('Canal onde aparecerão os logs de entrada')
            .setRequired(true)
        )
    )
    .addSubcommand(sub => 
      sub.setName('off')
        .setDescription('Desativa logs de entrada')
    )
    .addSubcommand(sub => 
      sub.setName('show')
        .setDescription('Mostra configuração atual')
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) {
      return interaction.reply({ content: 'Você precisa da permissão "Gerenciar Servidor" para usar este comando.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();
    cfg[interaction.guildId] = cfg[interaction.guildId] || {};
    const guildConfig = cfg[interaction.guildId];

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      
      if (!channel.isTextBased()) {
        return interaction.reply({ content: '❌ O canal precisa ser um canal de texto.', ephemeral: true });
      }

      // Configurar apenas logs de entrada
      guildConfig.joinLogsOnly = true;
      guildConfig.joinLogsChannelId = channel.id;
      
      // Desativar logs gerais se estavam ativos
      guildConfig.logMembers = false;
      
      writeConfig(cfg);
      
      return interaction.reply({ 
        content: `✅ **Logs de entrada configurados!**\n\n` +
                `📍 Canal: ${channel}\n` +
                `🟢 Registrará: **APENAS entradas** de novos membros\n` +
                `⚪ Não registrará: saídas de membros`, 
        ephemeral: true 
      });
    }

    if (sub === 'off') {
      guildConfig.joinLogsOnly = false;
      guildConfig.joinLogsChannelId = null;
      writeConfig(cfg);
      
      return interaction.reply({ 
        content: `❌ **Logs de entrada desativados**\n\nPara reativar, use \`/logs-entrada set\``, 
        ephemeral: true 
      });
    }

    if (sub === 'show') {
      const status = guildConfig.joinLogsOnly 
        ? `✅ **ATIVO** - Apenas entradas\n📍 Canal: ${guildConfig.joinLogsChannelId ? `<#${guildConfig.joinLogsChannelId}>` : '❌ Não configurado'}`
        : `❌ **INATIVO**\n\nPara ativar: \`/logs-entrada set #canal\``;
      
      return interaction.reply({ 
        content: `**📊 Status dos Logs de Entrada:**\n\n${status}`, 
        ephemeral: true 
      });
    }
  }
};