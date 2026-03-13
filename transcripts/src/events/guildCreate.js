const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    try {
      if (!client?.commands) return;
      const cmds = [];
      for (const [, cmd] of client.commands) {
        if (cmd.data && typeof cmd.data.toJSON === 'function') cmds.push(cmd.data.toJSON());
      }
      await guild.commands.set(cmds);
      console.log(`Comandos registrados ao entrar em: ${guild.name}`);
    } catch (e) {
      console.error(`Erro registrando comandos ao entrar em ${guild?.name}:`, e?.message ?? e);
    }
  }
};
