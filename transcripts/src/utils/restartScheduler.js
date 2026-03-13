const { readConfig, writeConfig } = require('./config');

let timer = null;

function msUntilNext(hour = 8, minute = 0) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function schedule(hour = 8, minute = 0) {
  clear();
  const delay = msUntilNext(hour, minute);
  timer = setTimeout(() => {
    // Sair com código 0; requer process manager (pm2/systemd/docker) para reiniciar
    process.exit(0);
  }, delay);
  // Evita manter o processo ativo só por causa do timer
  timer.unref?.();
}

function enableDaily(hour = 8, minute = 0) {
  const cfg = readConfig();
  cfg._service = cfg._service || {};
  cfg._service.restartSchedule = { enabled: true, hour, minute };
  writeConfig(cfg);
  schedule(hour, minute);
}

function disableDaily() {
  const cfg = readConfig();
  if (cfg._service && cfg._service.restartSchedule) {
    delete cfg._service.restartSchedule;
    writeConfig(cfg);
  }
  clear();
}

function clear() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function resumeFromConfig() {
  const cfg = readConfig();
  const rs = cfg._service?.restartSchedule;
  if (rs && rs.enabled) {
    schedule(rs.hour ?? 8, rs.minute ?? 0);
  }
}

module.exports = { enableDaily, disableDaily, resumeFromConfig };
