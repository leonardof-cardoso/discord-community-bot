const { Events } = require('discord.js');
const store = require('../utils/reactionLockStore');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      const message = reaction.message;
      if (!message.guild || !message.channel) return;

      const res = store.trySelect(message.guild.id, message.channel.id, user.id, message.id);
      if (res.allowed) return;

      // Not allowed: remove the new reaction and keep the previous selection
      try {
        await reaction.users.remove(user.id);
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error('MessageReactionAdd error', e);
    }
  }
};
