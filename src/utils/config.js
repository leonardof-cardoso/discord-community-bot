const fs = require('fs');
const path = require('path');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'configs.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}'); } catch (e) { return {}; }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

module.exports = { readConfig, writeConfig };
