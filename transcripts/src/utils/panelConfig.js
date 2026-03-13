const { readConfig, writeConfig } = require('./config');

const defaultPanel = {
  useSelect: false,
  title: 'Atendimento — Central de Solicitações',
  description: 'Abra um pedido para nossa equipe responsável.\n\nEscolha entre **Revisões** (análise por líderes) ou **Bugs** (relate um erro que precisa ser corrigido).',
  banner: 'https://via.placeholder.com/900x220/1E90FF/ffffff?text=Atendimento',
  footer: 'Atenda às regras do servidor. Use com responsabilidade.',
  categories: [], // when empty or useSelect=false, fallback to buttons
  // categoryPerms: { [categoryId]: { roles: string[], minRoleId?: string } }
  categoryPerms: {}
};

function getPanelConfig(guildId) {
  const cfg = readConfig();
  const gcfg = cfg[guildId] || {};
  return gcfg.ticketPanel ? { ...defaultPanel, ...gcfg.ticketPanel } : { ...defaultPanel };
}

function setPanelConfig(guildId, partial) {
  const cfg = readConfig();
  if (!cfg[guildId]) cfg[guildId] = {};
  const current = cfg[guildId].ticketPanel ? { ...defaultPanel, ...cfg[guildId].ticketPanel } : { ...defaultPanel };
  cfg[guildId].ticketPanel = { ...current, ...partial };
  writeConfig(cfg);
  return cfg[guildId].ticketPanel;
}

function addCategory(guildId, category) {
  const panel = getPanelConfig(guildId);
  const categories = Array.isArray(panel.categories) ? panel.categories : [];
  const exists = categories.find(c => c.id === category.id);
  const next = exists
    ? categories.map(c => (c.id === category.id ? { ...exists, ...category } : c))
    : [...categories, category];
  return setPanelConfig(guildId, { categories: next });
}

function removeCategory(guildId, categoryId) {
  const panel = getPanelConfig(guildId);
  const categories = Array.isArray(panel.categories) ? panel.categories : [];
  const next = categories.filter(c => c.id !== categoryId);
  return setPanelConfig(guildId, { categories: next });
}

function clearCategories(guildId) {
  return setPanelConfig(guildId, { categories: [] });
}

function setCategoryPerms(guildId, categoryId, perms) {
  const panel = getPanelConfig(guildId);
  const next = { ...(panel.categoryPerms || {}) };
  next[categoryId] = { roles: Array.isArray(perms.roles) ? perms.roles : [], minRoleId: perms.minRoleId || undefined };
  return setPanelConfig(guildId, { categoryPerms: next });
}

function getCategoryPerms(guildId, categoryId) {
  const panel = getPanelConfig(guildId);
  const all = panel.categoryPerms || {};
  return all[categoryId] || { roles: [], minRoleId: undefined };
}

function clearCategoryPerms(guildId, categoryId) {
  const panel = getPanelConfig(guildId);
  const next = { ...(panel.categoryPerms || {}) };
  delete next[categoryId];
  return setPanelConfig(guildId, { categoryPerms: next });
}

module.exports = {
  defaultPanel,
  getPanelConfig,
  setPanelConfig,
  addCategory,
  removeCategory,
  clearCategories,
  setCategoryPerms,
  getCategoryPerms,
  clearCategoryPerms
};
