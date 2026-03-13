const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../utils/config');
const lockStore = require('../utils/reactionLockStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('faccao')
    .setDescription('Configurações do canal de confirmação de facções')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('set-canal')
      .setDescription('Define o canal de confirmação de facções e ativa o lock de reações (uma por usuário)')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de confirmação').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('status')
      .setDescription('Mostra o canal configurado e o estado do lock')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const cfg = readConfig();
    cfg[guildId] = cfg[guildId] || {};

    if (sub === 'set-canal') {
      const ch = interaction.options.getChannel('canal', true);
      if (!ch.isTextBased?.() && ch.type !== undefined && !ch.isTextBased()) {
        return interaction.reply({ ephemeral: true, content: 'Selecione um canal de texto.' });
      }
      cfg[guildId].factionConfirmChannelId = ch.id;
      const arr = Array.isArray(cfg[guildId].reactionLockAllChannels) ? cfg[guildId].reactionLockAllChannels : [];
      if (!arr.includes(ch.id)) arr.push(ch.id);
      cfg[guildId].reactionLockAllChannels = arr;
      writeConfig(cfg);

      // Ativar lock em memória imediatamente
      lockStore.activate(guildId, ch.id, [], 'all');
      return interaction.reply({ ephemeral: true, content: `✅ Canal de confirmação definido para ${ch}. Lock de reações (canal inteiro) ativado.` });
    }

    if (sub === 'status') {
      const chId = cfg[guildId].factionConfirmChannelId;
      const lockList = Array.isArray(cfg[guildId].reactionLockAllChannels) ? cfg[guildId].reactionLockAllChannels : [];
      const hasLock = chId ? lockList.includes(chId) : false;
      const chText = chId ? `<#${chId}>` : '(não definido)';
      return interaction.reply({ ephemeral: true, content: `Canal de confirmação: ${chText}\nLock ativo: ${hasLock}` });
    }

    
  }
};
