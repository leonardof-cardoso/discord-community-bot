const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig } = require('../utils/config');
const restart = require('../utils/restartScheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manutencao')
    .setDescription('Ferramentas de manutenção do bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup(g => g
      .setName('restart-diario')
      .setDescription('Configurar reinício diário automático')
      .addSubcommand(sc => sc
        .setName('set')
        .setDescription('Define o horário do reinício diário (horário do servidor)')
        .addIntegerOption(o => o.setName('hora').setDescription('Hora (0-23)').setRequired(true).setMinValue(0).setMaxValue(23))
        .addIntegerOption(o => o.setName('minuto').setDescription('Minuto (0-59)').setRequired(true).setMinValue(0).setMaxValue(59))
      )
      .addSubcommand(sc => sc
        .setName('off')
        .setDescription('Desativa o reinício diário')
      )
      .addSubcommand(sc => sc
        .setName('info')
        .setDescription('Mostra o horário configurado (se houver)')
      )
    ),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);
    if (group !== 'restart-diario') return;

    if (sub === 'set') {
      const hour = interaction.options.getInteger('hora', true);
      const minute = interaction.options.getInteger('minuto', true);
      restart.enableDaily(hour, minute);
      return interaction.reply({ ephemeral: true, content: `✅ Reinício diário configurado para ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} (horário do servidor). Certifique-se de executar o bot com um process manager (pm2/systemd/docker) para reiniciar automaticamente.` });
    }

    if (sub === 'off') {
      restart.disableDaily();
      return interaction.reply({ ephemeral: true, content: '🛑 Reinício diário desativado.' });
    }

    if (sub === 'info') {
      const cfg = readConfig();
      const rs = cfg._service?.restartSchedule;
      if (!rs) return interaction.reply({ ephemeral: true, content: 'Nenhum reinício diário configurado.' });
      return interaction.reply({ ephemeral: true, content: `Reinício diário: ${String(rs.hour).padStart(2,'0')}:${String(rs.minute).padStart(2,'0')} (horário do servidor).` });
    }
  }
};
