const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edita mensagem do bot para censurar IP específico')
    .addStringOption(option =>
      option
        .setName('message-id')
        .setDescription('ID da mensagem para editar')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal onde está a mensagem (opcional, usa o canal atual se não especificado)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const messageId = interaction.options.getString('message-id');
      const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
      
      // Buscar a mensagem
      let message;
      try {
        message = await targetChannel.messages.fetch(messageId);
      } catch (error) {
        return await interaction.editReply({
          content: '❌ Não foi possível encontrar a mensagem com esse ID no canal especificado.'
        });
      }

      // Verificar se a mensagem é do bot
      if (message.author.id !== interaction.client.user.id) {
        return await interaction.editReply({
          content: '❌ Só posso editar mensagens enviadas por mim mesmo.'
        });
      }

      // IP específico a ser censurado
      const sensitiveIP = '177.193.20.198';
      const censoredIP = 'X.X.X.X';
      
      let wasEdited = false;
      let editedContent = null;
      let editedEmbeds = [];

      // Verificar e editar conteúdo da mensagem
      if (message.content && message.content.includes(sensitiveIP)) {
        editedContent = message.content.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
        wasEdited = true;
      }

      // Verificar e editar embeds
      if (message.embeds && message.embeds.length > 0) {
        editedEmbeds = message.embeds.map(embed => {
          const embedData = embed.toJSON();
          let embedModified = false;

          // Verificar título
          if (embedData.title && embedData.title.includes(sensitiveIP)) {
            embedData.title = embedData.title.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
            embedModified = true;
          }

          // Verificar descrição
          if (embedData.description && embedData.description.includes(sensitiveIP)) {
            embedData.description = embedData.description.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
            embedModified = true;
          }

          // Verificar fields
          if (embedData.fields && embedData.fields.length > 0) {
            embedData.fields = embedData.fields.map(field => {
              if (field.name.includes(sensitiveIP)) {
                field.name = field.name.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
                embedModified = true;
              }
              if (field.value.includes(sensitiveIP)) {
                field.value = field.value.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
                embedModified = true;
              }
              return field;
            });
          }

          // Verificar footer
          if (embedData.footer && embedData.footer.text && embedData.footer.text.includes(sensitiveIP)) {
            embedData.footer.text = embedData.footer.text.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
            embedModified = true;
          }

          // Verificar author
          if (embedData.author && embedData.author.name && embedData.author.name.includes(sensitiveIP)) {
            embedData.author.name = embedData.author.name.replace(new RegExp(sensitiveIP, 'g'), censoredIP);
            embedModified = true;
          }

          if (embedModified) {
            wasEdited = true;
          }

          return EmbedBuilder.from(embedData);
        });
      }

      if (!wasEdited) {
        return await interaction.editReply({
          content: `❌ A mensagem não contém o IP sensível (${sensitiveIP}) para ser censurado.`
        });
      }

      // Preparar dados para edição
      const editData = {};
      
      if (editedContent !== null) {
        editData.content = editedContent;
      } else if (message.content) {
        editData.content = message.content;
      }

      if (editedEmbeds.length > 0) {
        editData.embeds = editedEmbeds;
      }

      // Editar a mensagem
      try {
        await message.edit(editData);

        // Criar embed de confirmação
        const confirmEmbed = new EmbedBuilder()
          .setTitle('✅ Mensagem Editada com Sucesso')
          .setDescription(`O IP \`${sensitiveIP}\` foi substituído por \`${censoredIP}\` na mensagem.`)
          .addFields(
            { name: '📍 Canal', value: `${targetChannel}`, inline: true },
            { name: '🆔 Message ID', value: messageId, inline: true },
            { name: '🔗 Link', value: `[Ir para mensagem](${message.url})`, inline: true }
          )
          .setColor(0x00ff00)
          .setFooter({ 
            text: `Editado por ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL()
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [confirmEmbed] });

        // Log da ação
        console.log(`[EDIT] ${interaction.user.username} (${interaction.user.id}) censurou IP na mensagem ${messageId} no canal ${targetChannel.name}`);

      } catch (error) {
        console.error('Erro ao editar mensagem:', error);
        
        await interaction.editReply({
          content: '❌ Erro ao editar a mensagem. Verifique se a mensagem ainda existe e se tenho permissão para editá-la.'
        });
      }

    } catch (error) {
      console.error('Erro no comando edit:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};