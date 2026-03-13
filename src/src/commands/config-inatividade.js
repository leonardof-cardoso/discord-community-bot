const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-inatividade')
    .setDescription('Configura o sistema de auto-fechamento por inatividade')
    .addSubcommand(subcommand =>
      subcommand
        .setName('tempo')
        .setDescription('Define o tempo em horas para considerara um ticket inativo')
        .addIntegerOption(option =>
          option.setName('horas')
            .setDescription('Número de horas de inatividade (1-168 horas, padrão: 10)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(168))) // máximo 7 dias
    .addSubcommand(subcommand =>
      subcommand
        .setName('aviso')
        .setDescription('Configura quando enviar aviso antes de fechar')
        .addIntegerOption(option =>
          option.setName('horas')
            .setDescription('Horas antes do fechamento para enviar aviso (0 para desativar)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(24)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('ativar')
        .setDescription('Ativa ou desativa o sistema de auto-fechamento')
        .addBooleanOption(option =>
          option.setName('ativado')
            .setDescription('Ativar o sistema de auto-fechamento')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Mostra as configurações atuais do sistema'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    
    try {
      const config = readConfig();
      if (!config[guildId]) config[guildId] = {};
      if (!config[guildId].inactivity) {
        config[guildId].inactivity = {
          enabled: true,
          timeoutHours: 10,
          warningHours: 2
        };
      }
      
      const inactivityConfig = config[guildId].inactivity;
      
      if (subcommand === 'tempo') {
        const hours = interaction.options.getInteger('horas');
        inactivityConfig.timeoutHours = hours;
        writeConfig(config);
        
        const embed = new EmbedBuilder()
          .setTitle('⏰ Configuração Atualizada')
          .setDescription(`Tempo de inatividade definido para **${hours} horas**.`)
          .setColor(0x00ff00);
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'aviso') {
        const hours = interaction.options.getInteger('horas');
        inactivityConfig.warningHours = hours;
        writeConfig(config);
        
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Configuração Atualizada')
          .setColor(0x00ff00);
        
        if (hours === 0) {
          embed.setDescription('Avisos antes do fechamento foram **desativados**.');
        } else {
          embed.setDescription(`Aviso será enviado **${hours} hora(s)** antes do fechamento.`);
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'ativar') {
        const enabled = interaction.options.getBoolean('ativado');
        inactivityConfig.enabled = enabled;
        writeConfig(config);
        
        const embed = new EmbedBuilder()
          .setTitle('🔄 Sistema Atualizado')
          .setDescription(`Sistema de auto-fechamento **${enabled ? 'ativado' : 'desativado'}**.`)
          .setColor(enabled ? 0x00ff00 : 0xff9900);
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'status') {
        const embed = new EmbedBuilder()
          .setTitle('📊 Status do Sistema de Inatividade')
          .setColor(inactivityConfig.enabled ? 0x00ff00 : 0xff9900)
          .addFields(
            { 
              name: 'Status', 
              value: inactivityConfig.enabled ? '✅ Ativado' : '❌ Desativado', 
              inline: true 
            },
            { 
              name: 'Tempo de Inatividade', 
              value: `${inactivityConfig.timeoutHours} horas`, 
              inline: true 
            },
            { 
              name: 'Aviso Antecipado', 
              value: inactivityConfig.warningHours > 0 ? 
                `${inactivityConfig.warningHours} hora(s) antes` : 
                'Desativado', 
              inline: true 
            }
          )
          .setFooter({ text: 'Use os outros subcomandos para modificar essas configurações' });
        
        await interaction.editReply({ embeds: [embed] });
      }
      
    } catch (error) {
      console.error('Erro no comando config-inatividade:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao configurar o sistema de inatividade.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};