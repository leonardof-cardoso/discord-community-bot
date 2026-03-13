const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { readConfig } = require('../utils/config');
const lockStore = require('../utils/reactionLockStore');

async function fetchMessagesPaged(channel, maxToFetch) {
  const result = [];
  let lastId = undefined;
  while (result.length < maxToFetch) {
    const remaining = maxToFetch - result.length;
    const batch = await channel.messages.fetch({ limit: Math.min(100, remaining), before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = [...batch.values()];
    arr.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    result.push(...arr);
    lastId = arr[0]?.id; // next page: before oldest we just got
    if (!lastId) break;
  }
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analisar')
    .setDescription('Ferramentas de análise e correção')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup(g => g
      .setName('votacoes')
      .setDescription('Análises relacionadas às votações')
      .addSubcommand(sc => sc
        .setName('repetidas')
        .setDescription('Detecta votos repetidos (🔥 em mensagens diferentes) e remove as reações excedentes')
        .addChannelOption(o => o.setName('canal').setDescription('Canal a analisar (default: canal de facções)').addChannelTypes(ChannelType.GuildText))
        .addIntegerOption(o => o.setName('limite').setDescription('Quantas mensagens varrer (default: 200, máx 1000)').setMinValue(10).setMaxValue(1000))
      )
    )
    .addSubcommandGroup(g => g
      .setName('contas')
      .setDescription('Análises relacionadas a contas de usuários')
      .addSubcommand(sc => sc
        .setName('reacoes-recentes')
        .setDescription('Verifica reações feitas por contas criadas nas últimas 2 semanas')
        .addChannelOption(o => o.setName('canal').setDescription('Canal para analisar (default: canal atual)').addChannelTypes(ChannelType.GuildText))
        .addIntegerOption(o => o.setName('limite').setDescription('Quantas mensagens varrer (default: 100, máx 500)').setMinValue(10).setMaxValue(500))
        .addIntegerOption(o => o.setName('dias').setDescription('Contas criadas há quantos dias (default: 14)').setMinValue(1).setMaxValue(30))
      )
    ),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);
    
    await interaction.deferReply({ ephemeral: true });

    // Análise de votações repetidas
    if (group === 'votacoes' && sub === 'repetidas') {
      const cfg = readConfig();
      const gcfg = cfg[interaction.guildId] || {};
      let channel = interaction.options.getChannel('canal');
      if (!channel) {
        const chId = gcfg.factionConfirmChannelId;
        if (!chId) {
          return interaction.editReply('Canal de confirmação não definido. Use /faccao set-canal ou informe o canal.');
        }
        channel = interaction.guild.channels.cache.get(chId);
      }

      if (!channel || !channel.isTextBased()) {
        return interaction.editReply('O canal informado/não é válido ou não é de texto.');
      }

      // garantir lock ativo em modo canal inteiro (não limpa seleções se já ativo)
      try { lockStore.activate(interaction.guildId, channel.id, [], 'all'); } catch (_) {}

      const maxMessages = interaction.options.getInteger('limite') ?? 200;

      // Buscar mensagens (do mais antigo para o mais novo em result)
      const messages = await fetchMessagesPaged(channel, maxMessages);

      // Mapear reações 🔥 por usuário ao longo das mensagens
      const userReactions = new Map(); // userId -> [{ messageId, ts }]
      const botId = interaction.client.user.id;

      for (const msg of messages) {
        // Apenas considera reações 🔥
        const reaction = msg.reactions?.cache?.find(r => r.emoji.name === '🔥');
        if (!reaction) continue;
        const users = await reaction.users.fetch().catch(() => null);
        if (!users) continue;
        for (const [uid, user] of users) {
          if (uid === botId) continue; // ignora o bot
          if (user.bot) continue;
          if (!userReactions.has(uid)) userReactions.set(uid, []);
          userReactions.get(uid).push({ messageId: msg.id, ts: msg.createdTimestamp });
        }
      }

      // Para cada usuário com mais de uma reação 🔥 em mensagens diferentes, remover todas as excedentes mantendo a mais antiga
      let totalUsers = 0;
      let totalRemoved = 0;
      for (const [uid, entries] of userReactions.entries()) {
        if (entries.length <= 1) continue;
        totalUsers++;
        entries.sort((a, b) => a.ts - b.ts);
        const keep = entries[0];
        const toRemove = entries.slice(1); // todas as "últimas" (mais recentes)

        // Ajustar o mapeamento do lock para a mensagem mantida
        try { lockStore.setSelection(interaction.guildId, channel.id, uid, keep.messageId); } catch (_) {}

        for (const rem of toRemove) {
          try {
            const targetMsg = messages.find(m => m.id === rem.messageId) || await channel.messages.fetch(rem.messageId).catch(() => null);
            if (!targetMsg) continue;
            const react = targetMsg.reactions?.cache?.find(r => r.emoji.name === '🔥');
            if (!react) continue;
            await react.users.remove(uid);
            totalRemoved++;
          } catch (_) { /* ignore */ }
        }
      }

      if (totalRemoved === 0) {
        return interaction.editReply('Nenhuma votação repetida encontrada dentro do limite analisado.');
      }

      return interaction.editReply(`Análise concluída: ${totalUsers} jogadores com votos repetidos. Remoções aplicadas: ${totalRemoved}.`);
    }

    // Análise de contas recentes com reações
    if (group === 'contas' && sub === 'reacoes-recentes') {
      const channel = interaction.options.getChannel('canal') || interaction.channel;
      const maxMessages = interaction.options.getInteger('limite') ?? 100;
      const daysThreshold = interaction.options.getInteger('dias') ?? 14;

      if (!channel || !channel.isTextBased()) {
        return interaction.editReply('O canal informado não é válido ou não é de texto.');
      }

      // Calcular data limite (contas criadas após esta data são consideradas recentes)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

      // Buscar mensagens
      const messages = await fetchMessagesPaged(channel, maxMessages);

      const recentAccountReactions = [];

      for (const msg of messages) {
        if (!msg.reactions || msg.reactions.cache.size === 0) continue;

        // Verificar cada reação da mensagem
        for (const [, reaction] of msg.reactions.cache) {
          try {
            const users = await reaction.users.fetch();
            for (const [, user] of users) {
              if (user.bot) continue;

              // Verificar se a conta é recente
              const accountAge = user.createdAt;
              if (accountAge > cutoffDate) {
                // Conta recente! Adicionar aos resultados
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                const displayName = member ? member.displayName : user.username;
                
                recentAccountReactions.push({
                  username: user.username,
                  displayName: displayName,
                  userId: user.id,
                  accountCreated: accountAge,
                  messageId: msg.id,
                  messageContent: msg.content?.slice(0, 100) || '[sem conteúdo]',
                  messageUrl: msg.url,
                  emoji: reaction.emoji.name || reaction.emoji.toString(),
                  daysOld: Math.floor((Date.now() - accountAge.getTime()) / (1000 * 60 * 60 * 24))
                });
              }
            }
          } catch (error) {
            console.error('Erro ao buscar usuários da reação:', error);
          }
        }
      }

      if (recentAccountReactions.length === 0) {
        return interaction.editReply(`Nenhuma reação de contas criadas nos últimos ${daysThreshold} dias encontrada.`);
      }

      // Organizar por conta mais recente primeiro
      recentAccountReactions.sort((a, b) => b.accountCreated - a.accountCreated);

      // Criar relatório
      let report = `🔍 **Reações de Contas Recentes** (${recentAccountReactions.length} encontradas)\n`;
      report += `📅 Critério: Contas criadas nos últimos ${daysThreshold} dias\n`;
      report += `📊 Mensagens analisadas: ${messages.length}\n\n`;

      for (let i = 0; i < Math.min(recentAccountReactions.length, 10); i++) {
        const r = recentAccountReactions[i];
        report += `**${i + 1}.** ${r.displayName} (@${r.username})\n`;
        report += `   👤 ID: \`${r.userId}\`\n`;
        report += `   📅 Conta criada: ${r.daysOld} dias atrás\n`;
        report += `   ${r.emoji} Reagiu em: [Mensagem](${r.messageUrl})\n`;
        report += `   💬 Conteúdo: "${r.messageContent}"\n\n`;
      }

      if (recentAccountReactions.length > 10) {
        report += `... e mais ${recentAccountReactions.length - 10} reações encontradas.`;
      }

      // Discord tem limite de 2000 caracteres por mensagem
      if (report.length > 1900) {
        report = report.slice(0, 1900) + '...\n\n*Relatório truncado devido ao limite de caracteres.*';
      }

      return interaction.editReply(report);
    }

    return interaction.editReply('Comando não reconhecido.');
  }
};
