require('dotenv').config();
console.log('Starting src/index.js...');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, Partials } = require('discord.js');
const { checkInactiveTickets } = require('./utils/ticketInactivity');

// Tornar intents privilegiados opcionais para evitar erro "Used disallowed intents" quando não habilitados no portal
const allowPrivileged = (process.env.ALLOW_PRIVILEGED_INTENTS ?? 'true').toLowerCase() !== 'false';
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions];
if (allowPrivileged) {
  intents.push(GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent);
} else {
  console.warn('[WARN] ALLOW_PRIVILEGED_INTENTS=false -> Desativando GuildMembers e MessageContent. Recursos de join logs e conteúdo de mensagens ficarão limitados.');
}
const client = new Client({ intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction] });
client.commands = new Collection();

// carregar comandos
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd && cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

// carregar eventos
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const evt = require(path.join(eventsPath, file));
  if (evt && evt.name && evt.execute) {
    if (evt.once) client.once(evt.name, (...args) => evt.execute(...args, client));
    else client.on(evt.name, (...args) => evt.execute(...args, client));
  }
}

if (!process.env.TOKEN) {
  console.error('TOKEN não encontrado no .env');
  process.exit(1);
}

client.login(process.env.TOKEN);

// Iniciar verificação de tickets inativos a cada 30 minutos
setInterval(async () => {
  try {
    await checkInactiveTickets(client);
  } catch (error) {
    console.error('Erro ao verificar tickets inativos:', error);
  }
}, 30 * 60 * 1000); // 30 minutos em milissegundos

console.log('Sistema de auto-fechamento de tickets inativos ativado!');
