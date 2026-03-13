const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('🎉 Cria mensagens bonitas com reações automáticas estilo giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sc => sc
      .setName('simples')
      .setDescription('Mensagem simples com reação')
      .addStringOption(o => o.setName('titulo').setDescription('Título da mensagem').setRequired(true))
      .addStringOption(o => o.setName('descricao').setDescription('Descrição/conteúdo').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji para reação (padrão: 🎉)').setRequired(false))
      .addStringOption(o => o.setName('cor').setDescription('Cor do embed (hex sem #, ex: FF0000)').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('giveaway')
      .setDescription('Mensagem estilo sorteio/giveaway')
      .addStringOption(o => o.setName('premio').setDescription('O que está sendo sorteado').setRequired(true))
      .addStringOption(o => o.setName('tempo').setDescription('Duração (ex: 1h, 30m, 2d)').setRequired(false))
      .addStringOption(o => o.setName('requisitos').setDescription('Requisitos para participar').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('evento')
      .setDescription('Mensagem para eventos')
      .addStringOption(o => o.setName('nome').setDescription('Nome do evento').setRequired(true))
      .addStringOption(o => o.setName('data').setDescription('Data/horário do evento').setRequired(true))
      .addStringOption(o => o.setName('local').setDescription('Local (canal/servidor)').setRequired(false))
      .addStringOption(o => o.setName('detalhes').setDescription('Detalhes adicionais').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('votacao')
      .setDescription('Mensagem para votações')
      .addStringOption(o => o.setName('pergunta').setDescription('Pergunta da votação').setRequired(true))
      .addStringOption(o => o.setName('opcoes').setDescription('Opções separadas por | (ex: Sim|Não|Talvez)').setRequired(false))
      .addBooleanOption(o => o.setName('anonima').setDescription('Votação anônima (sem mostrar quem votou)').setRequired(false)))
    .addSubcommand(sc => sc
      .setName('personalizado')
      .setDescription('Mensagem totalmente personalizada')
      .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true))
      .addStringOption(o => o.setName('descricao').setDescription('Descrição principal').setRequired(true))
      .addStringOption(o => o.setName('campo1').setDescription('Campo extra (Nome: Valor)').setRequired(false))
      .addStringOption(o => o.setName('campo2').setDescription('Campo extra 2 (Nome: Valor)').setRequired(false))
      .addStringOption(o => o.setName('campo3').setDescription('Campo extra 3 (Nome: Valor)').setRequired(false))
      .addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false))
      .addStringOption(o => o.setName('thumbnail').setDescription('URL da thumbnail (imagem pequena)').setRequired(false))
      .addStringOption(o => o.setName('emojis').setDescription('Emojis para reação separados por espaço').setRequired(false))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'simples') {
      const titulo = interaction.options.getString('titulo');
      const descricao = interaction.options.getString('descricao');
      const emoji = interaction.options.getString('emoji') || '🎉';
      const cor = interaction.options.getString('cor') || 'CC1100';

      // Validar cor hex
      const corHex = cor.startsWith('#') ? cor.slice(1) : cor;
      const corFinal = /^[0-9A-F]{6}$/i.test(corHex) ? parseInt(corHex, 16) : 0xCC1100;

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(descricao)
        .setColor(corFinal)
        .setTimestamp()
        .setFooter({ text: `Enviado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

      const message = await interaction.channel.send({ embeds: [embed] });
      await message.react(emoji);

      return interaction.reply({ content: `✅ Mensagem enviada com reação ${emoji}!`, ephemeral: true });
    }

    if (sub === 'giveaway') {
      const premio = interaction.options.getString('premio');
      const tempo = interaction.options.getString('tempo') || 'Por tempo limitado';
      const requisitos = interaction.options.getString('requisitos') || 'Reagir com 🎉 para participar';

      const embed = new EmbedBuilder()
        .setTitle('🎉 SORTEIO / GIVEAWAY 🎉')
        .setDescription(`**Prêmio:** ${premio}\n\n**Como participar:**\n${requisitos}\n\n**Duração:** ${tempo}`)
        .setColor(0xFFD700)
        .addFields(
          { name: '🏆 Prêmio', value: premio, inline: true },
          { name: '⏰ Tempo', value: tempo, inline: true },
          { name: '👥 Participantes', value: 'Reaja para participar!', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boa sorte! 🍀' });

      const message = await interaction.channel.send({ embeds: [embed] });
      await message.react('🎉');

      return interaction.reply({ content: '✅ Giveaway criado! 🎉', ephemeral: true });
    }

    if (sub === 'evento') {
      const nome = interaction.options.getString('nome');
      const data = interaction.options.getString('data');
      const local = interaction.options.getString('local') || 'A definir';
      const detalhes = interaction.options.getString('detalhes') || 'Mais informações em breve!';

      const embed = new EmbedBuilder()
        .setTitle(`📅 ${nome}`)
        .setDescription(detalhes)
        .setColor(0x00FF00)
        .addFields(
          { name: '🕒 Data/Horário', value: data, inline: true },
          { name: '📍 Local', value: local, inline: true },
          { name: '👥 Participação', value: 'Reaja com ✅ para confirmar presença!', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Evento da comunidade' });

      const message = await interaction.channel.send({ embeds: [embed] });
      await message.react('✅');
      await message.react('❌');
      await message.react('❓');

      return interaction.reply({ content: '✅ Evento criado! Os membros podem reagir para confirmar presença.', ephemeral: true });
    }

    if (sub === 'votacao') {
      const pergunta = interaction.options.getString('pergunta');
      const opcoes = interaction.options.getString('opcoes') || 'Sim|Não';
      const anonima = interaction.options.getBoolean('anonima') || false;

      const opcoesArray = opcoes.split('|').map(op => op.trim()).filter(Boolean);
      const emojisVotacao = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

      let descricao = `**${pergunta}**\n\n`;
      for (let i = 0; i < Math.min(opcoesArray.length, 10); i++) {
        descricao += `${emojisVotacao[i]} ${opcoesArray[i]}\n`;
      }

      if (anonima) {
        descricao += `\n*⚠️ Votação anônima - os votos não são públicos*`;
      }

      const embed = new EmbedBuilder()
        .setTitle('🗳️ VOTAÇÃO')
        .setDescription(descricao)
        .setColor(0x0099FF)
        .setTimestamp()
        .setFooter({ text: anonima ? 'Votação anônima' : 'Votação pública' });

      const message = await interaction.channel.send({ embeds: [embed] });

      // Adicionar reações baseadas no número de opções
      for (let i = 0; i < Math.min(opcoesArray.length, 10); i++) {
        await message.react(emojisVotacao[i]);
      }

      return interaction.reply({ content: `✅ Votação criada com ${Math.min(opcoesArray.length, 10)} opções!`, ephemeral: true });
    }

    if (sub === 'personalizado') {
      const titulo = interaction.options.getString('titulo');
      const descricao = interaction.options.getString('descricao');
      const campo1 = interaction.options.getString('campo1');
      const campo2 = interaction.options.getString('campo2');
      const campo3 = interaction.options.getString('campo3');
      const imagem = interaction.options.getString('imagem');
      const thumbnail = interaction.options.getString('thumbnail');
      const emojis = interaction.options.getString('emojis') || '🎉';

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(descricao)
        .setColor(0xCC1100)
        .setTimestamp()
        .setFooter({ text: `Por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

      // Adicionar campos personalizados
      if (campo1) {
        const [nome, valor] = campo1.split(':').map(s => s.trim());
        if (nome && valor) embed.addFields({ name: nome, value: valor, inline: true });
      }
      if (campo2) {
        const [nome, valor] = campo2.split(':').map(s => s.trim());
        if (nome && valor) embed.addFields({ name: nome, value: valor, inline: true });
      }
      if (campo3) {
        const [nome, valor] = campo3.split(':').map(s => s.trim());
        if (nome && valor) embed.addFields({ name: nome, value: valor, inline: true });
      }

      // Adicionar imagens
      if (imagem) embed.setImage(imagem);
      if (thumbnail) embed.setThumbnail(thumbnail);

      const message = await interaction.channel.send({ embeds: [embed] });

      // Adicionar reações personalizadas
      const emojisArray = emojis.split(' ').filter(Boolean);
      for (const emoji of emojisArray.slice(0, 10)) { // máximo 10 reações
        try {
          await message.react(emoji);
        } catch (error) {
          console.log(`Emoji inválido ignorado: ${emoji}`);
        }
      }

      return interaction.reply({ content: `✅ Mensagem personalizada enviada com ${emojisArray.length} reação(ões)!`, ephemeral: true });
    }
  }
};