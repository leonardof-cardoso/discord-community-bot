const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPanelConfig } = require('../utils/panelConfig');

// Fallback banner (mesmo usado nos setups)
const DEFAULT_BANNER = 'https://media.discordapp.net/attachments/1354984419865395360/1355005248380338366/C13123amada_0.png?ex=68f79839&is=68f646b9&hm=8d78b91bc7412efb3f7ecc2196434e6c43be3425621f3ebc9b450a603b1d2ead&=&format=webp&quality=lossless&width=1867&height=462';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('regra')
    .setDescription('Publica a mensagem oficial de regras com banner e cor padronizados')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const panel = getPanelConfig(guildId);
    const banner = panel.banner || DEFAULT_BANNER;

    const description = [
      'É fundamental que todos sejamos respeitosos com todas as pessoas que estão ao nosso redor, independente da situação, diferenças de opiniões o respeito é sempre exigido para que aja uma boa convivência e harmonia diante a uma comunidade.',
      '',
      '**Dito isso, vamos para o resumo as regras de proibições:**',
      '',
      '• É proibido qualquer tipo de preconceito isso inclui apologia a movimentos que tenham ideias racistas, homofóbicas ou de qualquer tipo de discriminação!',
      '',
      '• É proibido discussões ou posicionamentos relacionados a política ou religião!',
      '',
      '• Divulgação de outros servidores, links externos ou qualquer tipo de propaganda!',
      '',
      '• É proibido o uso de palavras ou linguagem ofensiva que possa desrespeitar ou causar desconforto a outros membros da comunidade.',
      '',
      '• Qualquer prática que dê a entender que você está fazendo comercio usando nossa rede como um meio de chegar em clientes.',
      '',
      'Qualquer violação das regras do discord presentes nos **[Termos de Uso](https://discord.com/terms)** e nas **[Diretrizes da Comunidade](https://discord.com/guidelines)** resultará em punição de forma permanente.'
    ].join('\n');

    const embed = new EmbedBuilder()
      .setTitle('LISTA DE REGRAS | REDE COMMUNITY')
      .setDescription(description)
      .setColor(0xCC1100);

    if (banner) embed.setImage(banner);

    // Botões de link rápido
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Termos de Uso').setURL('https://discord.com/terms'),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Diretrizes da Comunidade').setURL('https://discord.com/guidelines')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ ephemeral: true, content: '✅ Mensagem de regras publicada neste canal.' });
  }
};
