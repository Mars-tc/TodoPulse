/**
 * logger.js
 * 运行日志：环形缓冲（上限 500 条）+ 落盘（单文件上限 1MB 截断）
 * 劫持 console.log/warn/error，使其同时进入缓冲与文件
 * 脱敏：任何含 token 关键字的输出值统一替换为 ***
 * 供「关于 / 诊断」中的「查看运行日志」使用
 */
const fs = require('fs');
const path = require('path');

const MAX_BUFFER = 500;
const MAX_FILE_BYTES = 1024 * 1024;

const buffer = [];
let logFile = null;

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function sanitize(args) {
  return args.map((a) => {
    const s = typeof a === 'string' ? a : safeStringify(a);
    // 脱敏：token 值替换为 ***
    return s.replace(/(token["'\s:=]+)([0-9a-f]{6,})/gi, '$1***');
  });
}

function initLogger(logDir) {
  if (!logDir) return;
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    logFile = path.join(logDir, 'app.log');
    // 超过 1MB 截断重写
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_FILE_BYTES) {
        fs.writeFileSync(logFile, '');
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    logFile = null; // 降级：不落盘
  }
}

function write(text) {
  buffer.push({ t: new Date().toISOString(), msg: text });
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (logFile) {
    try {
      fs.appendFileSync(logFile, text + '\n', 'utf-8');
    } catch {
      /* ignore */
    }
  }
}

// 劫持 console，保留原始方法以便仍输出到终端
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

console.log = (...args) => {
  const m = sanitize(args).join(' ');
  write('[INFO] ' + m);
  origLog(m);
};
console.warn = (...args) => {
  const m = sanitize(args).join(' ');
  write('[WARN] ' + m);
  origWarn(m);
};
console.error = (...args) => {
  const m = sanitize(args).join(' ');
  write('[ERROR] ' + m);
  origError(m);
};

function getLogs(n = 100) {
  const list = buffer.slice(-Math.max(1, n));
  return list.map((x) => `${x.t} ${x.msg}`).join('\n');
}

function clearLogs() {
  buffer.length = 0;
  if (logFile) {
    try {
      fs.writeFileSync(logFile, '');
    } catch {
      /* ignore */
    }
  }
}

function getLogPath() {
  return logFile;
}

module.exports = { initLogger, getLogs, clearLogs, getLogPath };
