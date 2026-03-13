const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');
const statusPanel = require('../utils/statusPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Painel de status do bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('painel-set')
      .setDescription('Publica/atualiza o painel de status no canal escolhido')
      .addChannelOption(o => o.setName('canal').setDescription('Canal para o painel').setRequired(true))
      .addIntegerOption(o => o.setName('intervalo').setDescription('Intervalo em segundos (5-60; padrão 15)').setMinValue(5).setMaxValue(60))
    )
    .addSubcommand(sc => sc
      .setName('painel-stop')
      .setDescription('Para o painel de status e limpa a configuração')
    )
    .addSubcommand(sc => sc
      .setName('painel-info')
      .setDescription('Mostra onde o painel está e o intervalo atual')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const cfg = readConfig();
    cfg[guildId] = cfg[guildId] || {};

    if (sub === 'painel-set') {
      const ch = interaction.options.getChannel('canal', true);
      if (!ch.isTextBased?.() && ch.type !== undefined && !ch.isTextBased()) {
        return interaction.reply({ ephemeral: true, content: 'Selecione um canal de texto.' });
      }
      const intervalSec = interaction.options.getInteger('intervalo') ?? 15;
      statusPanel.start(interaction.client, guildId, ch.id, { intervalSec });
      return interaction.reply({ ephemeral: true, content: `✅ Painel de status ativado em ${ch} (atualiza a cada ${intervalSec}s).` });
    }

    if (sub === 'painel-stop') {
      statusPanel.stopAndClearConfig(guildId);
      return interaction.reply({ ephemeral: true, content: '🛑 Painel de status parado e configuração limpa.' });
    }

    if (sub === 'painel-info') {
      const sp = cfg[guildId].statusPanel;
      if (!sp) return interaction.reply({ ephemeral: true, content: 'Nenhum painel configurado.' });
      return interaction.reply({ ephemeral: true, content: `Canal: <#${sp.channelId}>\nMensagem: ${sp.messageId ? `https://discord.com/channels/${guildId}/${sp.channelId}/${sp.messageId}` : '(pendente)'}\nIntervalo: ${sp.intervalSec || 15}s` });
    }
  }
};
