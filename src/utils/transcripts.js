const fs = require('fs');
const path = require('path');

async function generateTranscript(channel) {
  // channel: TextChannel
  const messages = [];
  let lastId;
  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
    if (!fetched || fetched.size === 0) break;
    messages.push(...Array.from(fetched.values()));
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }

  // messages are fetched in reverse-chronological order, we want chronological
  messages.reverse();

  const lines = messages.map(m => {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = `${m.author.tag}`;
    let content = m.content || '';
    // attachments
    if (m.attachments && m.attachments.size > 0) {
      const urls = m.attachments.map(a => a.url).join(' ');
      content = content ? `${content} \n[attachments] ${urls}` : `[attachments] ${urls}`;
    }
    return `[${time}] ${author}: ${content}`;
  });

  const txt = lines.join('\n');
  const dir = path.join(__dirname, '..', '..', 'transcripts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `transcript_${channel.guild.id}_${channel.id}_${Date.now()}.txt`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, txt, 'utf8');
  return filepath;
}

module.exports = { generateTranscript };