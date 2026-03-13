const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder().setName('setup-tickets').setDescription('Configura mensagem de tickets no servidor'),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Permissão negada.', ephemeral: true });

    const cfg = readConfig();
    const gcfg = cfg[interaction.guildId] || {};

    const embed = new EmbedBuilder()
      .setTitle('Atendimento — Central de Solicitações')
      .setColor(0x1E90FF)
      .setDescription('Abra um pedido para nossa equipe responsável.\n\nEscolha entre **Revisões** (análise por líderes) ou **Bugs** (relate um erro que precisa ser corrigido).')
      .addFields({ name: '\u200b', value: 'Descreva o problema com clareza e inclua exemplos quando possível. O descaso com as regras pode resultar em punições.' })
      .setImage('https://via.placeholder.com/900x220/1E90FF/ffffff?text=Atendimento')
      .setFooter({ text: 'Atenda às regras do servidor. Use com responsabilidade.' });

  const btnRevisoes = new ButtonBuilder().setCustomId('open_ticket_revisao').setLabel('Revisões').setStyle(ButtonStyle.Primary);
  const btnBugs = new ButtonBuilder().setCustomId('open_ticket_bug').setLabel('Bugs').setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(btnRevisoes, btnBugs);

    // se channel configurado, postar lá
    if (gcfg.channelId) {
      const ch = interaction.guild.channels.cache.get(gcfg.channelId);
      if (ch) {
        await ch.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'Mensagem enviada no canal de atendimento configurado.', ephemeral: true });
      }
    }

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    // dica: agora você pode usar /ticket-panel para publicar um painel personalizado com menu de categorias
  }
};
