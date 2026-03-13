const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit-advanced')
    .setDescription('Ferramentas avançadas de edição de mensagens do bot')
    .addSubcommand(subcommand =>
      subcommand
        .setName('censor-ip')
        .setDescription('Censura o IP específico (177.193.20.198) em uma mensagem')
        .addStringOption(option =>
          option
            .setName('message-id')
            .setDescription('ID da mensagem para editar')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal onde está a mensagem (opcional)')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('replace-text')
        .setDescription('Substitui texto específico em uma mensagem')
        .addStringOption(option =>
          option
            .setName('message-id')
            .setDescription('ID da mensagem para editar')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('texto-antigo')
            .setDescription('Texto a ser substituído')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('texto-novo')
            .setDescription('Novo texto')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal onde está a mensagem (opcional)')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('preview')
        .setDescription('Visualiza como ficará a mensagem após editar')
        .addStringOption(option =>
          option
            .setName('message-id')
            .setDescription('ID da mensagem para visualizar')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal onde está a mensagem (opcional)')
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const messageId = interaction.options.getString('message-id');
    const targetChannel = interaction.options.getChannel('canal') || interaction.channel;

    try {
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

      if (subcommand === 'preview') {
        // Mostrar preview da mensagem atual
        const previewEmbed = new EmbedBuilder()
          .setTitle('👁️ Preview da Mensagem')
          .setDescription('Aqui está o conteúdo atual da mensagem:')
          .addFields(
            { name: '📍 Canal', value: `${targetChannel}`, inline: true },
            { name: '🆔 Message ID', value: messageId, inline: true },
            { name: '🔗 Link', value: `[Ir para mensagem](${message.url})`, inline: true }
          )
          .setColor(0x3498db)
          .setTimestamp();

        if (message.content) {
          previewEmbed.addFields({
            name: '📝 Conteúdo da Mensagem',
            value: `\`\`\`${message.content.slice(0, 1000)}\`\`\``,
            inline: false
          });
        }

        if (message.embeds.length > 0) {
          previewEmbed.addFields({
            name: '📊 Embeds',
            value: `Esta mensagem contém ${message.embeds.length} embed(s)`,
            inline: false
          });
        }

        return await interaction.editReply({ embeds: [previewEmbed] });
      }

      let oldText, newText;

      if (subcommand === 'censor-ip') {
        oldText = '177.193.20.198';
        newText = 'X.X.X.X';
      } else if (subcommand === 'replace-text') {
        oldText = interaction.options.getString('texto-antigo');
        newText = interaction.options.getString('texto-novo');
      }

      // Função para substituir texto em string
      function replaceText(text, old, replacement) {
        if (!text || !old) return text;
        return text.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
      }

      let wasEdited = false;
      let editedContent = null;
      let editedEmbeds = [];

      // Verificar e editar conteúdo da mensagem
      if (message.content && message.content.includes(oldText)) {
        editedContent = replaceText(message.content, oldText, newText);
        wasEdited = true;
      }

      // Verificar e editar embeds
      if (message.embeds && message.embeds.length > 0) {
        editedEmbeds = message.embeds.map(embed => {
          const embedData = embed.toJSON();
          let embedModified = false;

          // Verificar e substituir em todas as propriedades do embed
          const checkAndReplace = (obj, path = '') => {
            if (typeof obj === 'string' && obj.includes(oldText)) {
              const newValue = replaceText(obj, oldText, newText);
              if (newValue !== obj) {
                embedModified = true;
                return newValue;
              }
            }
            return obj;
          };

          if (embedData.title) embedData.title = checkAndReplace(embedData.title);
          if (embedData.description) embedData.description = checkAndReplace(embedData.description);
          
          if (embedData.fields) {
            embedData.fields = embedData.fields.map(field => ({
              ...field,
              name: checkAndReplace(field.name),
              value: checkAndReplace(field.value)
            }));
          }

          if (embedData.footer?.text) {
            embedData.footer.text = checkAndReplace(embedData.footer.text);
          }

          if (embedData.author?.name) {
            embedData.author.name = checkAndReplace(embedData.author.name);
          }

          if (embedModified) wasEdited = true;

          return EmbedBuilder.from(embedData);
        });
      }

      if (!wasEdited) {
        return await interaction.editReply({
          content: `❌ A mensagem não contém o texto "${oldText}" para ser substituído.`
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
          .setDescription(`Substituição realizada com sucesso!`)
          .addFields(
            { name: '🔄 Texto Antigo', value: `\`${oldText}\``, inline: true },
            { name: '✨ Texto Novo', value: `\`${newText}\``, inline: true },
            { name: '📍 Canal', value: `${targetChannel}`, inline: false },
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
        console.log(`[EDIT] ${interaction.user.username} (${interaction.user.id}) editou mensagem ${messageId}: "${oldText}" -> "${newText}"`);

      } catch (error) {
        console.error('Erro ao editar mensagem:', error);
        
        await interaction.editReply({
          content: '❌ Erro ao editar a mensagem. Verifique se a mensagem ainda existe e se tenho permissão para editá-la.'
        });
      }

    } catch (error) {
      console.error('Erro no comando edit-advanced:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};