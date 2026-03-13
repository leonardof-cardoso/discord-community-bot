const { Events, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { getPanelConfig } = require('../utils/panelConfig');
const statusPanel = require('../utils/statusPanel');
const restartScheduler = require('../utils/restartScheduler');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Logado como ${client.user.tag}`);

    // Registrar comandos por guild usando as definições carregadas
    try {
      const cmds = [];
      for (const [, cmd] of client.commands) {
        if (cmd.data && typeof cmd.data.toJSON === 'function') cmds.push(cmd.data.toJSON());
      }

      for (const [gid, guild] of client.guilds.cache) {
        try {
          await guild.commands.set(cmds);
          console.log(`Comandos registrados em ${guild.name}`);
        } catch (e) {
          console.error(`Erro registrando comandos em ${guild.name}:`, e?.message ?? e);
        }
      }
    } catch (e) {
      console.error('Erro ao preparar comandos:', e);
    }

    // Autopost do painel novo baseado em categorias
    const cfg = readConfig();
    // Reativar locks de reação em modo canal inteiro conforme config
    try {
      const lockStore = require('../utils/reactionLockStore');
      for (const [gid, gcfg] of Object.entries(cfg)) {
        const guild = client.guilds.cache.get(gid);
        if (!guild) continue;
        const list = Array.isArray(gcfg.reactionLockAllChannels) ? gcfg.reactionLockAllChannels : [];
        const extra = gcfg.factionConfirmChannelId && !list.includes(gcfg.factionConfirmChannelId)
          ? [...list, gcfg.factionConfirmChannelId] : list;
        for (const chId of extra) {
          lockStore.activate(gid, chId, [], 'all');
        }
      }
    } catch (e) { console.warn('Falha ao reativar locks de reação:', e?.message ?? e); }
    for (const [gid, gcfg] of Object.entries(cfg)) {
      try {
        const guild = client.guilds.cache.get(gid);
        if (!guild) continue;
        if (!gcfg.channelId) continue;
        const ch = guild.channels.cache.get(gcfg.channelId);
        if (!ch) continue;

        const panel = getPanelConfig(gid);
        const embed = new EmbedBuilder()
          .setTitle(panel.title)
          .setDescription(panel.description)
          .setColor(0xCC1100)
          .setFooter({ text: panel.footer });
        if (panel.banner) embed.setImage(panel.banner);

        if (!Array.isArray(panel.categories) || panel.categories.length === 0) {
          console.log(`[${guild.name}] Painel não postado: sem categorias configuradas.`);
          continue;
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId('ticket_select')
          .setPlaceholder('Selecione a categoria do seu problema')
          .addOptions(panel.categories.map(c => ({ label: c.label, value: c.id, emoji: c.emoji, description: c.description })));

        // Se já existir uma messageId salva, tenta editar; se não existir ou falhar, envia uma nova
        try {
          if (panel.messageId) {
            const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
            if (msg) {
              await msg.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
              console.log(`Painel atualizado em ${guild.name} -> ${ch.name}`);
              continue;
            }
          }
        } catch (e) {
          console.warn(`Não foi possível editar painel existente em ${guild.name}:`, e?.message ?? e);
        }

        const newMsg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
        // salvar novo messageId
        const { setPanelConfig } = require('../utils/panelConfig');
        setPanelConfig(gid, { messageId: newMsg.id });
        console.log(`Painel novo enviado em ${guild.name} -> ${ch.name}`);
      } catch (e) {
        console.error('Erro ao enviar painel automático (novo):', e?.message ?? e);
      }
    }

    // Retomar painel de status se configurado
    try { await statusPanel.resumeFromConfig(client); } catch (e) { console.warn('Falha ao retomar painel de status:', e?.message ?? e); }

    // Retomar agendamento de reinício diário
    try { restartScheduler.resumeFromConfig(); } catch (e) { console.warn('Falha ao retomar reinício diário:', e?.message ?? e); }
  }
};
