/**
 * config_store.js
 * 读写本地配置：port、token，以及用户偏好 settings
 * 配置文件存放于 Electron userData 目录
 * UOS下路径通常为 ~/.config/TodoPulse/config.json
 */
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { v4: uuid } = require('uuid');

let appDataPath = null;
let currentConfig = null; // 进程内缓存，避免反复读盘

/**
 * 默认设置（与渲染层设置页一一对应）
 * 任意缺失字段在读取时都会用默认值补齐，保证向后兼容
 */
const DEFAULT_SETTINGS = {
  theme: 'system',          // light | dark | system
  density: 'comfortable',   // comfortable | compact
  fontScale: 'normal',       // normal | large | xlarge
  reminder: {
    enabled: true,
    defaultLead: null,      // 新建待办时提醒下拉默认值（分钟）：null=不提醒，0=截止时提醒
    dndEnabled: false,      // 免打扰时段开关
    dndStart: '22:00',      // 免打扰起
    dndEnd: '08:00',        // 免打扰止（可跨零点）
    scanInterval: 60,       // 扫描间隔（秒）
    sound: false            // 提醒声音
  },
  startup: {
    autoLaunch: false,      // 开机自启
    closeAction: 'tray'     // tray | quit
  },
  widget: {
    enabled: false,         // 是否开启悬浮窗（记住状态）
    x: null,                // 位置（null 表示首次自动定位到屏幕右下角）
    y: null,
    width: 320,             // 尺寸
    height: 420,
    opacity: 100,           // 不透明度 60-100
    showCompleted: false    // 是否展示已完成（false 时看板仅显示未完成）
  },
  planning: {
    daily_capacity_minutes: 240,    // 每日容量（分钟）：今日排期能容纳的总投入
    default_estimate_minutes: 30,   // 未标注预估耗时的待办按此计入容量
    urgent_within_days: 3,          // 距截止 N 天内视为紧急（象限建议用）
    auto_defer_enabled: false,      // 逾期自动顺延开关（默认关闭，避免擅自改写截止时间）
    auto_defer_strategy: 'today',   // today 顺延到今天 | next_workday 下一个工作日 | mark_only 仅标记
    quadrant_suggest_enabled: true, // 是否提供象限自动建议
    energy_slots: [
      { label: '上午高能', start: '08:00', end: '12:00', energy: 'high' },
      { label: '午后中等', start: '13:00', end: '18:00', energy: 'medium' },
      { label: '晚间低能', start: '19:00', end: '22:00', energy: 'low' }
    ]
  }
};

/**
 * 深合并：对象逐层合并，数组/基本类型直接覆盖
 * 用递归而非 Object.assign，确保 settings 的嵌套子项（reminder/startup）不丢
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    const value = Array.isArray(override) ? override : base;
    return value.map((item) => deepMerge(undefined, item));
  }
  if (isRecord(base) || isRecord(override)) {
    const left = isRecord(base) ? base : {};
    const right = isRecord(override) ? override : {};
    const out = {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      out[key] = deepMerge(left[key], right[key]);
    }
    return out;
  }
  const value = override === undefined ? base : override;
  return Array.isArray(value) ? value.map((item) => deepMerge(undefined, item)) : value;
}

/**
 * 网页匹配脚本：可提取的字段白名单与长度上限
 * 用于归一化校验，避免脏数据或超长内容入库
 */
const SCRIPT_FIELDS = ['title', 'description', 'deadline', 'priority'];
const SCRIPT_LIMITS = { name: 60, pattern: 300, selector: 500, code: 20000, matchItem: 200, matchRules: 20 };
const SCRIPT_MODES = ['selector', 'js'];
const SCRIPT_ACTIONS = ['fill', 'submit'];
const SCRIPT_ATTRS = ['text', 'html', 'href', 'src', 'value', 'attr'];
// 高级匹配维度（与 patterns 正交）：标题/路径/域名/选中文字
const SCRIPT_MATCH_KEYS = ['title', 'path', 'domain', 'selection'];

/**
 * 归一化单条脚本：补齐缺失字段、枚举非法回落默认、超长截断、仅保留白名单键
 * 任何异常输入都会被修正为合法脚本，绝不让坏数据落到 config.json
 * @param {object} raw - 用户提交的脚本（可能缺字段）
 * @param {boolean} [preserveMeta=false] - 保留原有 updatedAt（读盘归一化时用，避免每次启动都刷新时间）
 * @returns {object} 合法脚本对象
 */
function normalizeScript(raw, preserveMeta = false) {
  const s = raw && typeof raw === 'object' ? raw : {};

  const mode = SCRIPT_MODES.includes(s.mode) ? s.mode : 'selector';
  const action = SCRIPT_ACTIONS.includes(s.action) ? s.action : 'fill';

  // 匹配规则：转字符串数组，去空去重，逐条截断
  const patterns = (Array.isArray(s.patterns) ? s.patterns : [s.patterns])
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim().slice(0, SCRIPT_LIMITS.pattern));

  // 字段映射（选择器模式）：仅保留白名单字段，attr 非法回落 text
  const fields = {};
  const rawFields = s.fields && typeof s.fields === 'object' ? s.fields : {};
  for (const key of SCRIPT_FIELDS) {
    const f = rawFields[key];
    if (!f || typeof f !== 'object') continue;
    const selector = typeof f.selector === 'string' ? f.selector.trim().slice(0, SCRIPT_LIMITS.selector) : '';
    if (!selector) continue;
    fields[key] = {
      selector,
      attr: SCRIPT_ATTRS.includes(f.attr) ? f.attr : 'text',
      attrName: typeof f.attrName === 'string' ? f.attrName.trim().slice(0, 60) : ''
    };
  }

  // 高级匹配条件：与 patterns 正交，归一化为白名单键的数组（子串或 /regex/）
  const match = {};
  const rawMatch = s.match && typeof s.match === 'object' ? s.match : {};
  for (const key of SCRIPT_MATCH_KEYS) {
    const arr = (Array.isArray(rawMatch[key]) ? rawMatch[key] : [])
      .filter((x) => typeof x === 'string' && x.trim())
      .map((x) => x.trim().slice(0, SCRIPT_LIMITS.matchItem));
    if (arr.length) match[key] = arr.slice(0, SCRIPT_LIMITS.matchRules);
  }

  return {
    id: typeof s.id === 'string' && s.id ? s.id : uuid(),
    name: (typeof s.name === 'string' && s.name.trim()
      ? s.name.trim()
      : '未命名脚本').slice(0, SCRIPT_LIMITS.name),
    enabled: s.enabled !== false,
    mode,
    action,
    patterns: Array.from(new Set(patterns)),
    fields,
    match,
    code: mode === 'js' && typeof s.code === 'string'
      ? s.code.slice(0, SCRIPT_LIMITS.code)
      : '',
    builtin: s.builtin === true,
    updatedAt: preserveMeta && typeof s.updatedAt === 'string'
      ? s.updatedAt
      : new Date().toISOString()
  };
}

/**
 * 设置应用数据目录（在main.js中调用）
 */
function setAppDataPath(userDataPath) {
  if (appDataPath !== userDataPath) currentConfig = null;
  appDataPath = userDataPath;
}

/**
 * 获取配置文件路径
 */
function getConfigPath() {
  if (!appDataPath) {
    throw new Error('请先调用 setAppDataPath 设置应用数据目录');
  }
  return path.join(appDataPath, 'config.json');
}

/**
 * 生成随机token（32位十六进制）
 */
function generateToken() {
  return randomBytes(16).toString('hex');
}

/**
 * 读取当前完整配置（含已与默认值合并的 settings）
 * 对已损坏的配置（port 不是合法数字、token 缺失）自动自愈
 * @returns {Promise<{ port: number, token: string, settings: object }>}
 */
async function loadConfig() {
  const configPath = getConfigPath();

  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!isRecord(config)) throw new SyntaxError('配置必须为 JSON 对象');
  } catch (e) {
    if (e instanceof SyntaxError) {
      const backupPath = `${configPath}.corrupt-${Date.now()}-${uuid()}`;
      fs.copyFileSync(configPath, backupPath, fs.constants.COPYFILE_EXCL);
      console.warn('[config_store] 已保留损坏配置副本:', backupPath);
    } else if (e.code !== 'ENOENT') {
      throw e;
    }
    config = null;
  }

  if (config) {
    const portOk = Number.isInteger(config.port) && config.port > 0 && config.port <= 65535;
    const tokenOk = typeof config.token === 'string' && config.token.trim().length > 0;
    if (!portOk) config.port = await findAvailablePort();
    if (!tokenOk) config.token = generateToken();
  }

  // 自动生成配置
  if (!config) {
    config = {
      port: await findAvailablePort(),
      token: generateToken()
    };
  }

  // 确保 settings 子对象存在，并与默认值深合并（补齐缺失字段、保留未知字段）
  if (!config.settings || typeof config.settings !== 'object') config.settings = {};
  config.settings = deepMerge(DEFAULT_SETTINGS, config.settings);

  // 确保 scripts 为数组（旧版本配置无此字段，此处补齐为空数组，不影响 port/token/settings）
  if (!Array.isArray(config.scripts)) {
    config.scripts = [];
  } else {
    config.scripts = config.scripts.map((s) => normalizeScript(s, true));
  }

  // 落盘：确保新结构（含完整 settings）被持久化，且不破坏既有 port/token
  saveConfig(config);

  return deepMerge({}, currentConfig);
}

/**
 * 保存配置到文件
 */
function saveConfig(config) {
  if (!isRecord(config)) throw new TypeError('配置必须为对象');
  const next = deepMerge({}, config);
  next.settings = deepMerge(DEFAULT_SETTINGS, next.settings);
  const content = JSON.stringify(next, null, 2);
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${configPath}.${uuid()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, configPath);
    currentConfig = next;
  } finally {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn('[config_store] 清理临时配置失败:', e.message);
      }
    }
  }
  console.log('[config_store] 配置已保存到:', configPath);
}

/**
 * 返回当前完整配置（如未加载则先加载）
 */
async function getConfig() {
  if (!currentConfig) return loadConfig();
  return deepMerge({}, currentConfig);
}

/**
 * 读取设置（已与默认值合并）
 */
function getSettings() {
  if (!currentConfig) {
    return deepMerge(DEFAULT_SETTINGS, {});
  }
  return deepMerge(DEFAULT_SETTINGS, currentConfig.settings);
}

/**
 * 深合并并保存设置，返回完整 settings
 * @param {object} patch - 部分设置（任意层级）
 */
function saveSettings(patch) {
  const config = { ...(currentConfig || { port: 0, token: '' }) };
  config.settings = deepMerge(getSettings(), patch);
  saveConfig(config);
  return getSettings();
}

/**
 * 读取全部网页匹配脚本（已归一化）
 * @returns {Array<object>}
 */
function getScripts() {
  if (!currentConfig) return [];
  return Array.isArray(currentConfig.scripts) ? deepMerge(undefined, currentConfig.scripts) : [];
}

/**
 * 整体覆盖保存脚本列表，返回归一化后的列表
 * 脚本是数据集合（数组），不做深合并，避免删除操作失效
 * @param {Array<object>} list - 脚本数组
 * @returns {Array<object>}
 */
function saveScripts(list) {
  const config = { ...(currentConfig || { port: 0, token: '', settings: {} }) };
  const input = Array.isArray(list) ? list : [];
  config.scripts = input
    .filter((s) => s && typeof s === 'object')
    .map((s) => normalizeScript(s));
  saveConfig(config);
  console.log('[config_store] 已保存脚本，共', config.scripts.length, '条');
  return getScripts();
}

/**
 * 返回关键路径信息（供「关于 / 诊断」与「打开数据目录」使用）
 */
function getDataPaths() {
  const dir = appDataPath || '';
  return {
    userData: dir,
    config: getConfigPath(),
    database: path.join(dir, 'todos.db'),
    logs: path.join(dir, 'logs')
  };
}

/**
 * 查找可用端口（从3210开始递增）
 */
function findAvailablePort(startPort = 3210) {
  const net = require('net');

  function tryPort(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.once('error', () => resolve(null));
      server.listen(port, '127.0.0.1');
    });
  }

  async function find() {
    for (let port = startPort; port < startPort + 100; port++) {
      const available = await tryPort(port);
      if (available) return available;
    }
    throw new Error('无法找到可用端口');
  }

  return find();
}

module.exports = {
  setAppDataPath,
  loadConfig,
  getConfig,
  saveConfig,
  getConfigPath,
  getSettings,
  saveSettings,
  getDataPaths,
  generateToken,
  getScripts,
  saveScripts,
  normalizeScript,
  SCRIPT_FIELDS,
  SCRIPT_ATTRS,
  SCRIPT_MATCH_KEYS
};
