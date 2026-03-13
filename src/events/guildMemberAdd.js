const { Events } = require('discord.js');
const { readConfig } = require('../utils/config');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      const { PermissionsBitField } = require('discord.js');
      const cfg = readConfig();
      const gcfg = cfg[member.guild.id] || {};

      // Atribuir autorole, se configurado
      if (gcfg.autoRoleId) {
        console.log(`[Autorole] guild=${member.guild.id} autoRoleId=${gcfg.autoRoleId} user=${member.id}`);
        const role = member.guild.roles.cache.get(gcfg.autoRoleId);
        const me = member.guild.members.me;

        // escolher canal para avisos (prioriza joinLogsChannelId, depois membersLogsChannelId)
        const warnChId = gcfg.joinLogsChannelId || gcfg.membersLogsChannelId || gcfg.logsChannelId;
        const warnCh = warnChId ? member.guild.channels.cache.get(warnChId) : null;

        if (!role) {
          console.warn('[Autorole] Cargo não encontrado:', gcfg.autoRoleId);
          if (warnCh && warnCh.isTextBased()) await warnCh.send(`⚠️ Autorole configurado, mas o cargo (ID: ${gcfg.autoRoleId}) não foi encontrado.`);
        } else if (role.managed) {
          // cargos gerenciados por integrações não podem ser atribuídos manualmente
          console.warn('[Autorole] Cargo é gerenciado (integration role), não pode ser atribuído manualmente:', role.id);
          if (warnCh && warnCh.isTextBased()) await warnCh.send(`⚠️ O cargo configurado para autorole (${role.name}) é gerenciado por uma integração e não pode ser atribuído automaticamente.`);
        } else {
          // checar permissões do bot
          const hasManagePerm = me && me.permissions && me.permissions.has && me.permissions.has(PermissionsBitField.Flags.ManageRoles);
          const positionOk = me && me.roles && me.roles.highest && (me.roles.highest.position > role.position);
          console.log(`[Autorole] botHasManagePerm=${!!hasManagePerm} botPosOK=${!!positionOk} rolePos=${role.position} botTopPos=${me?.roles?.highest?.position}`);

          if (!hasManagePerm) {
            console.warn('[Autorole] Bot não tem a permissão Manage Roles.');
            if (warnCh && warnCh.isTextBased()) await warnCh.send(`⚠️ Autorole falhou: o bot não tem permissão de Gerenciar Cargos.`);
          } else if (!positionOk) {
            console.warn('[Autorole] Cargo alvo está acima ou igual ao cargo mais alto do bot.');
            if (warnCh && warnCh.isTextBased()) await warnCh.send(`⚠️ Autorole falhou: o cargo ${role.name} está acima do cargo do bot. Mova o cargo do bot para cima na hierarquia.`);
          } else {
            try {
              await member.roles.add(role, 'Autorole automático');
              console.log('[Autorole] cargo aplicado com sucesso:', role.id);
            } catch (e) {
              console.error('Falha ao aplicar autorole:', e);
              if (warnCh && warnCh.isTextBased()) await warnCh.send(`⚠️ Erro ao aplicar autorole (${role.name}): ${e.message || e}`);
            }
          }
        }
      }
      
      // Novo modo (apenas entradas) -> mensagem simples
      if (gcfg.joinLogsOnly && gcfg.joinLogsChannelId) {
        const ch = member.guild.channels.cache.get(gcfg.joinLogsChannelId);
        if (ch && ch.isTextBased()) {
          await ch.send(`🔥 <@${member.id}> entrou!`);
        }
        return;
      }
      
      // Modo antigo (entrada + saída)
      if (!gcfg.logMembers) return;
      const chId = gcfg.membersLogsChannelId || gcfg.logsChannelId;
      if (!chId) return;
      const { EmbedBuilder, Colors } = require('discord.js');
      const { sendToConfiguredChannels } = require('../utils/logger');
      const embed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle('🟢 Membro entrou')
        .setColor(Colors.Green)
        .addFields({ name: 'Membro', value: `<@${member.id}>`, inline: true })
        .setTimestamp();
      await sendToConfiguredChannels(member.guild, ['membersLogsChannelId'], { embeds: [embed] });
    } catch (e) { console.error('guildMemberAdd error', e); }
  }
};
