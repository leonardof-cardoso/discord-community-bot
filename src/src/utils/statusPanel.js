const os = require('os');
const { EmbedBuilder, time, TimestampStyles } = require('discord.js');
const { performance } = require('perf_hooks');
const { readConfig, writeConfig } = require('./config');

// Amostrador global simples de lag do event loop (média nos últimos ~10s)
let lagSamples = [];
let lagTimer = null;
function startLagSampler() {
  if (lagTimer) return;
  let prev = performance.now();
  lagTimer = setInterval(() => {
    const now = performance.now();
    const drift = now - prev - 100;
    prev = now;
    // drift pode ser negativo se timer acordou adiantado; clamp para >=0
    const lag = Math.max(0, drift);
    lagSamples.push(lag);
    if (lagSamples.length > 100) lagSamples.shift(); // ~10s se período = 100ms
  }, 100).unref?.();
}
function getAvgLagMs() {
  if (lagSamples.length === 0) return 0;
  const sum = lagSamples.reduce((a, b) => a + b, 0);
  return sum / lagSamples.length;
}

// Painéis ativos por guild
const active = new Map(); // guildId -> { interval, channelId, messageId, lastCpu, lastTime, samples: { cpu:[], heap:[] } }

function pctBar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  const empty = Math.max(0, width - filled);
  const green = '█'.repeat(Math.min(filled, Math.floor(width * 0.6)));
  const yellow = '█'.repeat(Math.max(0, Math.min(filled - green.length, Math.floor(width * 0.25))));
  const red = '█'.repeat(Math.max(0, filled - green.length - yellow.length));
  return `${green}${yellow}${red}${'░'.repeat(empty)}`;
}

function shortBytes(n) {
  const units = ['B','KB','MB','GB'];
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

function buildEmbed(client, guildId, startedAt, stats) {
  const { cpuPct, heapUsed, heapTotal, rss, ping, avgLag, cpuSeries, heapSeries } = stats;
  const heapPct = (heapUsed / heapTotal) * 100;
  const embed = new EmbedBuilder()
    .setTitle('Status do Bot')
    .setColor(0xCC1100)
    .setDescription('Atualização automática — uso de CPU, memória, ping e lag do event loop.')
    .addFields(
      { name: 'Uptime', value: `${time(new Date(Math.max(0, startedAt)), TimestampStyles.RelativeTime)}`, inline: true },
      { name: 'Ping', value: `${Math.round(ping)} ms`, inline: true },
      { name: 'Event Loop Lag', value: `${avgLag.toFixed(1)} ms`, inline: true },
      { name: 'CPU', value: `${cpuPct.toFixed(1)}%\n${pctBar(cpuPct)}` },
      { name: 'Memória (Heap)', value: `${shortBytes(heapUsed)} / ${shortBytes(heapTotal)} (${heapPct.toFixed(1)}%)\n${pctBar(heapPct)}` },
      { name: 'Memória (RSS)', value: `${shortBytes(rss)}`, inline: true },
      { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
    )
    .setFooter({ text: `Host: ${os.hostname()} • Node ${process.version}` })
    .setTimestamp(new Date());
  return embed;
}

function computeCpuPct(state) {
  const now = performance.now();
  const usage = process.cpuUsage(); // microseconds
  if (!state.lastTime) {
    state.lastTime = now;
    state.lastCpu = usage;
    return 0;
  }
  const dtMs = now - state.lastTime;
  const duMicro = (usage.user - state.lastCpu.user) + (usage.system - state.lastCpu.system);
  state.lastTime = now;
  state.lastCpu = usage;
  const pct = (duMicro / 1000) / dtMs * 100; // % de 1 core
  return Math.max(0, Math.min(100, pct));
}

async function ensureMessage(client, guildId, channelId, messageId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const ch = guild.channels.cache.get(channelId);
  if (!ch || !ch.isTextBased()) return null;
  if (messageId) {
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (msg) return msg;
  }
  const msg = await ch.send({ embeds: [new EmbedBuilder().setColor(0xCC1100).setDescription('Inicializando painel de status...')] }).catch(() => null);
  return msg;
}

function start(client, guildId, channelId, opts = {}) {
  startLagSampler();
  // Parar instância anterior se houver
  stop(guildId);

  const state = { interval: null, channelId, messageId: null, lastCpu: null, lastTime: null };
  active.set(guildId, state);

  const startedAt = client.readyTimestamp || Date.now();
  const everyMs = Math.max(5000, Math.min(60000, (opts.intervalSec ?? 15) * 1000));

  (async () => {
    const msg = await ensureMessage(client, guildId, channelId, opts.messageId);
    if (!msg) return stop(guildId);
    state.messageId = msg.id;

    // Persistir no config
    const cfg = readConfig();
    cfg[guildId] = cfg[guildId] || {};
    cfg[guildId].statusPanel = { channelId, messageId: msg.id, intervalSec: Math.round(everyMs / 1000) };
    writeConfig(cfg);

    // Loop de atualização
    state.interval = setInterval(async () => {
      try {
        const cpuPct = computeCpuPct(state);
        const mem = process.memoryUsage();
        const stats = {
          cpuPct,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
          ping: client.ws.ping || 0,
          avgLag: getAvgLagMs(),
        };
        const embed = buildEmbed(client, guildId, startedAt, stats);
        await msg.edit({ embeds: [embed] });
      } catch (e) {
        // Se falhar por mensagem apagada/permissão, tenta re-criar 1x
        try {
          const m2 = await ensureMessage(client, guildId, channelId, null);
          if (m2) {
            state.messageId = m2.id;
            const cfg2 = readConfig();
            cfg2[guildId] = cfg2[guildId] || {};
            cfg2[guildId].statusPanel = { channelId, messageId: m2.id, intervalSec: Math.round(everyMs / 1000) };
            writeConfig(cfg2);
          }
        } catch (_) {}
      }
    }, everyMs);
  })();
}

function stop(guildId) {
  const st = active.get(guildId);
  if (!st) return;
  if (st.interval) clearInterval(st.interval);
  active.delete(guildId);
  // Não apagamos do config aqui — usamos o comando stop para limpar config
}

function stopAndClearConfig(guildId) {
  stop(guildId);
  const cfg = readConfig();
  if (cfg[guildId] && cfg[guildId].statusPanel) {
    delete cfg[guildId].statusPanel;
    writeConfig(cfg);
  }
}

async function resumeFromConfig(client) {
  startLagSampler();
  const cfg = readConfig();
  for (const [gid, gcfg] of Object.entries(cfg)) {
    const sp = gcfg.statusPanel;
    if (sp && sp.channelId) {
      start(client, gid, sp.channelId, { messageId: sp.messageId, intervalSec: sp.intervalSec || 15 });
    }
  }
}

module.exports = { start, stop, stopAndClearConfig, resumeFromConfig };
