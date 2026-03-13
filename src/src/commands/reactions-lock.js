const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/reactionLockStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactions-lock')
    .setDescription('Limitar cada usuário a reagir em apenas uma das mensagens rastreadas neste canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Ativa/Desativa e opcionalmente define as mensagens rastreadas')
      .addStringOption(o => o
        .setName('state')
        .setDescription('on/off')
        .setRequired(true)
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }))
      .addStringOption(o => o
        .setName('message_ids_csv')
        .setDescription('IDs de mensagens separados por vírgula; se omitido, detecta mensagens recentes do bot'))) ,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const channelId = channel.id;
    const guildId = interaction.guild.id;

    if (sub !== 'set') return interaction.reply({ ephemeral: true, content: 'Comando inválido.' });

    const state = interaction.options.getString('state', true);
    const csv = interaction.options.getString('message_ids_csv');

    if (state === 'off') {
      store.deactivate(guildId, channelId);
      return interaction.reply({ ephemeral: true, content: '🔓 Reactions lock desativado neste canal.' });
    }

    // state === 'on'
    let ids = [];
    if (csv) {
      ids = csv.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      // sem IDs: ativar modo canal inteiro
      store.activate(guildId, channelId, [], 'all');
      return interaction.reply({ ephemeral: true, content: '🔒 Lock ativado em modo canal inteiro: cada usuário só pode reagir em UMA mensagem neste canal.' });
    }
    store.activate(guildId, channelId, ids, 'list');
    const msg = ids.length
      ? `🔒 Lock ativado. Mensagens rastreadas: ${ids.join(', ')}`
      : '🔒 Lock ativado. Nenhuma mensagem definida; adicione reações às mensagens do bot ou forneça IDs na próxima vez.';
    return interaction.reply({ ephemeral: true, content: msg });
  }
};
