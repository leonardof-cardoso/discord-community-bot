const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readConfig } = require('../utils/config');
const lockStore = require('../utils/reactionLockStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('falar')
    .setDescription('Publica a confirmação da facção no canal configurado e reage com fogo')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('tag').setDescription('TAG da facção (ex.: TKS)').setRequired(true))
    .addStringOption(o => o.setName('nome').setDescription('Nome da facção (ex.: TheKings)').setRequired(true))
    // Compatibilidade temporária com versões antigas do comando
    .addStringOption(o => o.setName('tagnome').setDescription('[DEPRECATED] Use tag e nome separados').setRequired(false)),

  async execute(interaction) {
    // Suporte a ambos os formatos: (tag + nome) ou (tagnome)
    const tagOpt = interaction.options.getString('tag');
    const nomeOpt = interaction.options.getString('nome');
    const tagnomeOpt = interaction.options.getString('tagnome');

    let boldSegment;
    if (tagOpt && nomeOpt) {
      // Formatação correta com espaços ao redor do traço
      boldSegment = `${tagOpt} - ${nomeOpt}`;
    } else if (tagnomeOpt) {
      // Normaliza espaços ao redor do traço para mensagens antigas
      boldSegment = tagnomeOpt.trim().replace(/\s*-\s*/g, ' - ');
    } else {
      return interaction.reply({ ephemeral: true, content: 'Forneça TAG e Nome (ou o campo legado tagnome).' });
    }
    const cfg = readConfig();
    const gcfg = cfg[interaction.guildId] || {};
    const chId = gcfg.factionConfirmChannelId;
    if (!chId) return interaction.reply({ ephemeral: true, content: 'Canal de confirmação não definido. Use /faccao set-canal primeiro.' });

    const ch = interaction.guild.channels.cache.get(chId);
    if (!ch || !ch.isTextBased()) return interaction.reply({ ephemeral: true, content: 'O canal configurado não é válido/visível para o bot.' });

    // Garantir lock ativo em modo canal inteiro
    try { lockStore.activate(interaction.guildId, chId, [], 'all'); } catch (_) {}

  const content = `🔥 A facção **${boldSegment}** confirmou presença no \`Factions Hell\` !`;
    const msg = await ch.send({ content });
    try { await msg.react('🔥'); } catch (e) { /* ignorar erro */ }

    return interaction.reply({ ephemeral: true, content: `✅ Mensagem publicada em ${ch} com reação automática.` });
  }
};
