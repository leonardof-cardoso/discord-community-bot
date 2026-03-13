const fs = require('fs');
const path = require('path');
const { PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

async function createTicketChannel(interaction, client, type) {
  const guild = interaction.guild;
  const member = interaction.member;
  const supportRoleId = process.env.SUPPORT_ROLE_ID;

  // find or create a category
  let category = null;
  if (process.env.TICKET_CATEGORY_ID) category = guild.channels.cache.get(process.env.TICKET_CATEGORY_ID);
  if (!category) {
    // fallback to no category
  }

  const name = `ticket-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];

  if (supportRoleId) {
    permissionOverwrites.push({ id: supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] });
  }

  // allow the creator
  permissionOverwrites.push({ id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });

  const channel = await guild.channels.create({ 
    name,
    type: ChannelType.GuildText,
    parent: category ? category.id : undefined,
    permissionOverwrites,
    topic: `ticket_creator:${member.id};type:${type}`
  });

  const embed = new EmbedBuilder()
    .setTitle('Ticket aberto')
    .setDescription(`Categoria: **${type}**\nCriado por: ${member}`)
    .setColor(0x00AE86);

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Fechar ticket').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${member}`, embeds: [embed], components: [closeButton] });

  return channel;
}

async function closeTicket(interaction, client) {
  const channel = interaction.channel;
  const member = interaction.member;
  const supportRoleId = process.env.SUPPORT_ROLE_ID;

  // check support role
  const isSupport = supportRoleId && member.roles.cache.has(supportRoleId);

  // check creator from topic
  let isCreator = false;
  try {
    const topic = channel.topic || '';
    const m = topic.match(/ticket_creator:(\d+)/);
    if (m) isCreator = m[1] === member.id;
  } catch (e) {
    // ignore
  }

  if (!isSupport && !isCreator) return false;

  // save transcript and send log before deleting
  await saveTranscriptAndLog(channel, client);
  await channel.delete('Ticket fechado');
  return true;
}

async function saveTranscriptAndLog(channel, client) {
  try {
    // fetch last 100 messages
    const messages = await channel.messages.fetch({ limit: 100 });
    const ordered = Array.from(messages.values()).reverse();
    const transcript = ordered.map(m => ({ id: m.id, author: m.author?.tag, content: m.content, createdAt: m.createdAt }));

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    const filePath = path.join(dataDir, 'tickets.json');
    let db = [];
    if (fs.existsSync(filePath)) {
      try { db = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]'); } catch (e) { db = []; }
    }

    const entry = { channelId: channel.id, name: channel.name, transcript, closedAt: new Date() };
    db.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');

    // send to logs channel if configured
    const logChannelId = process.env.TICKET_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_NAME;
    if (logChannelId) {
      const guild = channel.guild;
      let logChannel = guild.channels.cache.get(logChannelId) || guild.channels.cache.find(c => c.name === logChannelId);
      if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle('Transcrição de ticket')
            .setDescription(`Ticket fechado: **${channel.name}**`)
            .setTimestamp();

          // prepare a full transcript file
          const transcriptText = transcript.map(t => `[${t.createdAt}] ${t.author}: ${t.content}`).join('\n');
          const fileName = `${channel.name}-transcript-${Date.now()}.txt`;
          const filePathFull = path.join(dataDir, fileName);
          try { fs.writeFileSync(filePathFull, transcriptText, 'utf8'); } catch (e) { console.error('Error writing transcript file', e); }

          const { AttachmentBuilder } = require('discord.js');
          const attachment = new AttachmentBuilder(filePathFull);
          await logChannel.send({ embeds: [embed], files: [attachment] });
        }
    }
  } catch (e) {
    console.error('Error saving transcript:', e);
  }
}

module.exports = { createTicketChannel, closeTicket };
