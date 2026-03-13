const { Events } = require('discord.js');
const store = require('../utils/reactionLockStore');

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      const message = reaction.message;
      if (!message.guild || !message.channel) return;
      store.releaseIfSelected(message.guild.id, message.channel.id, user.id, message.id);
    } catch (e) {
      console.error('MessageReactionRemove error', e);
    }
  }
};
