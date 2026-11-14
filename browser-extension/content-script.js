/**
 * content-script.js - 网页注入脚本
 * 在任意网页右下角渲染悬浮"加入待办"按钮，
 * 展开后可编辑标题 / 描述 / 优先级 / 分类 / 截止时间 / 提醒再入库
 *
 * 自定义脚本能力：从桌面端拉取脚本，按 URL 规则命中后自动提取网页内容，
 * 支持 CSS 选择器（直接读 DOM）与自定义 JS（沙箱执行）两种模式，
 * 命中结果可预填到面板或直接一键入库；未命中任何脚本时行为与旧版完全一致
 */
(function() {
  if (document.getElementById('__todopulse_widget')) return;

  var CSS = [
    '#__todopulse_widget { position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;user-select:none; }',
    '#__todopulse_btn { display:flex;align-items:center;gap:6px;padding:10px 18px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(37,99,235,0.4);transition:all .2s;white-space:nowrap; }',
    '#__todopulse_btn:hover { transform:translateY(-2px);box-shadow:0 6px 24px rgba(37,99,235,0.5) }',
    '#__todopulse_btn.flash { background:linear-gradient(135deg,#7c3aed,#5b21b6);box-shadow:0 4px 16px rgba(124,58,237,.45) }',
    '#__todopulse_panel { display:none;position:absolute;bottom:56px;right:0;width:330px;background:white;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.22);padding:16px;color:#1e293b;max-height:76vh;overflow-y:auto; }',
    '#__todopulse_widget.open #__todopulse_panel { display:block;animation:tpfade .22s ease }',
    '@keyframes tpfade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }',
    '#__todopulse_panel h4 { margin:0 0 12px 0;font-size:14px;color:#334155;display:flex;align-items:center;gap:6px; }',
    '.tp-field { margin-bottom:10px; }',
    '.tp-field label { display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px; }',
    '.tp-field input,.tp-field textarea,.tp-field select { width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#1e293b;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit;transition:border-color .18s ease,box-shadow .18s ease; }',
    '.tp-field input:focus,.tp-field textarea:focus,.tp-field select:focus { border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.14) }',
    '.tp-field textarea { resize:vertical;min-height:52px }',
    '.tp-row { display:flex;gap:8px } .tp-row > * { flex:1 }',
    '#__todopulse_src { font-size:11px;color:#64748b;background:#f8fafc;padding:7px 9px;border-radius:7px;margin-bottom:10px;max-height:56px;overflow-y:auto;word-break:break-all;line-height:1.5 }',
    '#__todopulse_submit { width:100%;padding:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;transition:filter .18s ease }',
    '#__todopulse_submit:hover { filter:brightness(1.07) } #__todopulse_submit:disabled { opacity:.55;cursor:not-allowed }',
    '.panel-hint { font-size:10.5px;color:#94a3b8;margin-top:8px;text-align:center;line-height:1.5 }',
    '.todopulse-toast { position:fixed;bottom:90px;right:24px;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:500;z-index:2147483647;animation:tpslide .3s ease;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:80vw; }',
    '.todopulse-toast.success { background:#16a34a;color:white }',
    '.todopulse-toast.error { background:#dc2626;color:white }',
    '@keyframes tpslide { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }',
    /* ---- 脚本命中提示条 ---- */
    '#__todopulse_hit { display:none;align-items:center;gap:6px;padding:7px 9px;margin-bottom:10px;border-radius:8px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.28);font-size:11px;color:#1d4ed8;line-height:1.5 }',
    '#__todopulse_hit.show { display:flex;flex-wrap:wrap }',
    '#__todopulse_hit .hit-name { font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }',
    '#__todopulse_hit select { flex:1;min-width:110px;padding:3px 6px;border:1px solid rgba(59,130,246,.35);border-radius:6px;background:white;color:#1d4ed8;font-size:11px;outline:none;font-family:inherit }',
    '#__todopulse_hit button { padding:3px 8px;border:1px solid rgba(59,130,246,.35);border-radius:6px;background:white;color:#1d4ed8;font-size:11px;font-weight:600;cursor:pointer;transition:all .16s ease }',
    '#__todopulse_hit button:hover { background:#3b82f6;color:white;border-color:#3b82f6 }',
    '#__todopulse_hit .hit-name { font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }',
    '#__todopulse_hit .hit-via { padding:1px 7px;border-radius:6px;background:rgba(59,130,246,.16);color:#1d4ed8;font-size:10.5px;font-weight:600 }',
    '#__todopulse_hit .hit-conf { margin-left:auto;padding:1px 8px;border-radius:6px;background:rgba(22,163,74,.14);color:#15803d;font-size:10.5px;font-weight:700 }',
    '#__todopulse_hit .hit-chips { flex-basis:100%;display:flex;flex-wrap:wrap;gap:5px;margin-top:2px }',
    '#__todopulse_hit .hit-chip { display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;background:white;border:1px solid rgba(59,130,246,.3);font-size:10.5px;color:#334155;max-width:100%; }',
    '#__todopulse_hit .hit-chip i { font-style:normal;color:#1d4ed8;font-weight:700 }',
    '#__todopulse_hit .hit-note { flex-basis:100%;opacity:.8;font-size:10.5px;margin-top:2px }',
    /* ---- 选中文字推荐浮窗 ---- */
    '#__todopulse_selpill { display:none;position:absolute;z-index:2147483646;align-items:center;gap:6px;padding:7px 12px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:18px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(37,99,235,.4);transition:transform .18s ease,box-shadow .18s ease;font-family:inherit;white-space:nowrap; }',
    '#__todopulse_selpill.show { display:flex;animation:tpslide .25s ease }',
    '#__todopulse_selpill:hover { transform:translateY(-2px);box-shadow:0 6px 22px rgba(37,99,235,.5) }',
    '#__todopulse_selpill .pill-name { max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var widget = document.createElement('div');
  widget.id = '__todopulse_widget';
  widget.innerHTML = [
    '<button id="__todopulse_btn"><span>📋</span><span>加入待办</span></button>',
    '<div id="__todopulse_panel">',
    '  <h4>📌 收藏到 TodoPulse</h4>',
    '  <div id="__todopulse_hit"></div>',
    '  <div id="__todopulse_src"></div>',
    '  <div class="tp-field"><label>标题</label><input id="__todopulse_title" type="text" placeholder="待办标题" /></div>',
    '  <div class="tp-field"><label>描述</label><textarea id="__todopulse_desc" placeholder="补充描述（可选）"></textarea></div>',
    '  <div class="tp-row">',
    '    <div class="tp-field"><label>优先级</label><select id="__todopulse_priority"><option value="medium">中</option><option value="high">高</option><option value="low">低</option></select></div>',
    '    <div class="tp-field"><label>分类</label><select id="__todopulse_category"><option value="">未分类</option></select></div>',
    '  </div>',
    '  <div class="tp-row">',
    '    <div class="tp-field"><label>截止时间</label><input id="__todopulse_deadline" type="text" placeholder="明天下午5点" /></div>',
    '    <div class="tp-field"><label>提醒</label><select id="__todopulse_remind"><option value="">不提醒</option><option value="0">截止时</option><option value="10">提前10分钟</option><option value="60">提前1小时</option><option value="1440">提前1天</option></select></div>',
    '  </div>',
    '  <button id="__todopulse_submit">添加到待办</button>',
    '  <div class="panel-hint">截止时间支持自然语言，如「周五 17:00」</div>',
    '</div>'
  ].join('');
  document.body.appendChild(widget);

  var btn = widget.querySelector('#__todopulse_btn');
  var hitDiv = widget.querySelector('#__todopulse_hit');
  var srcDiv = widget.querySelector('#__todopulse_src');
  var titleInput = widget.querySelector('#__todopulse_title');
  var descInput = widget.querySelector('#__todopulse_desc');
  var prioritySel = widget.querySelector('#__todopulse_priority');
  var categorySel = widget.querySelector('#__todopulse_category');
  var deadlineInput = widget.querySelector('#__todopulse_deadline');
  var remindSel = widget.querySelector('#__todopulse_remind');
  var submitBtn = widget.querySelector('#__todopulse_submit');

  var isOpen = false;
  var categoriesLoaded = false;
  var defaults = { categoryId: '', remindLead: '', priority: 'medium' };

  // ============================================================
  // 自定义脚本：状态
  // ============================================================
  var scriptList = [];        // 桌面端拉取到的全部启用脚本
  var matched = [];           // 当前 URL 命中的脚本
  var activeScript = null;    // 当前生效脚本
  var scriptsLoaded = false;
  var matchedVia = {};        // scriptId -> 命中的维度（url/title/domain/path），用于反馈来源
  var lastSelectionScripts = []; // 当前选中文字命中的脚本（智能推荐）
  var forcedSelection = '';   // 选中文字浮窗点击后保留的选中文本，供面板/沙箱使用
  var lastExtract = { data: {}, via: '' }; // 最近一次提取结果，用于命中反馈展示

  function escapeHtml(t) {
    var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML;
  }

  function getSelectionText() {
    if (forcedSelection) return forcedSelection;
    return String(window.getSelection().toString() || '').trim();
  }

  function collectInfo() {
    return {
      sel: getSelectionText(),
      title: document.title || '无标题',
      url: window.location.href
    };
  }

  // ---------- URL 通配匹配 ----------
  /**
   * 将通配规则转为正则：* 匹配任意字符，? 匹配单个字符
   * 无协议头的规则（如 jira.xxx.com/*）自动兼容 http / https
   * 规则未以通配结尾时（如 *.example.com），自动允许其后跟随任意路径
   */
  function patternToRegExp(pattern) {
    var p = String(pattern || '').trim();
    if (!p) return null;
    var escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) escaped = '(https?:\\/\\/)?' + escaped;
    if (!/\*$/.test(p)) escaped += '(\\/.*)?';
    try {
      return new RegExp('^' + escaped + '$', 'i');
    } catch (e) {
      return null;
    }
  }

  function matchUrl(url, pattern) {
    var re = patternToRegExp(pattern);
    return !!re && re.test(url);
  }

  function pickMatched(list, url) {
    matchedVia = {};
    var ctx = pageCtx();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = matchPage(list[i], ctx);
      if (r.hit) {
        matchedVia[list[i].id] = r.via;
        out.push(list[i]);
      }
    }
    return out;
  }

  /** 当前页面的匹配上下文（标题 / 域名 / 路径） */
  function pageCtx() {
    return {
      url: window.location.href,
      title: document.title || '',
      host: window.location.hostname || '',
      path: window.location.pathname || ''
    };
  }

  /**
   * 单条脚本的页面级匹配：URL 通配命中，或标题/域名/路径任一维度命中
   * @returns {{hit:boolean, via:string}}
   */
  function matchPage(script, ctx) {
    if (Array.isArray(script.patterns) && script.patterns.some(function(p) { return matchUrl(ctx.url, p); })) {
      return { hit: true, via: 'url' };
    }
    var m = script.match || {};
    if (matchToken(ctx.title, m.title)) return { hit: true, via: 'title' };
    if (matchToken(ctx.host, m.domain)) return { hit: true, via: 'domain' };
    if (matchPath(ctx.path, m.path)) return { hit: true, via: 'path' };
    return { hit: false, via: '' };
  }

  /**
   * 子串（不区分大小写）或 /正则/ 匹配：目标串命中任一规则即返回 true
   * 正则支持可选修饰符，如 /issue/i；非法正则静默跳过，不阻断其他规则
   */
  function matchToken(target, patterns) {
    if (!target || !Array.isArray(patterns) || !patterns.length) return false;
    var t = String(target).toLowerCase();
    for (var i = 0; i < patterns.length; i++) {
      var p = String(patterns[i] || '').trim();
      if (!p) continue;
      try {
        if (p.charAt(0) === '/' && p.length > 1) {
          var lastSlash = p.lastIndexOf('/');
          if (lastSlash > 0) {
            var body = p.slice(1, lastSlash);
            if (body) {
              var flags = p.slice(lastSlash + 1);
              if (new RegExp(body, flags.indexOf('i') === -1 ? 'i' : flags).test(t)) return true;
            }
            continue;
          }
        }
        if (t.indexOf(p.toLowerCase()) !== -1) return true;
      } catch (e) { /* 跳过非法正则或匹配异常 */ }
    }
    return false;
  }

  /** 路径通配（* 匹配任意段）：/issues/* 之类，仅对 pathname 生效 */
  function matchPath(pathname, patterns) {
    if (!pathname || !Array.isArray(patterns) || !patterns.length) return false;
    for (var i = 0; i < patterns.length; i++) {
      var re = pathToRegExp(patterns[i]);
      if (re && re.test(pathname)) return true;
    }
    return false;
  }

  function pathToRegExp(pattern) {
    var p = String(pattern || '').trim();
    if (!p) return null;
    var escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    try { return new RegExp('^' + escaped + '$', 'i'); } catch (e) { return null; }
  }

  /**
   * 选中文字智能推荐：脚本配置了 match.selection 且命中选中文本
   */
  function pickSelectionScripts(list, text) {
    if (!text) return [];
    return list.filter(function(s) {
      var m = s.match || {};
      return matchToken(text, m.selection);
    });
  }

  // ---------- 选择器模式提取 ----------
  function normalizePriority(v) {
    var p = String(v || '').trim().toLowerCase();
    if (!p) return '';
    if (p === '高' || p.indexOf('high') === 0 || p.indexOf('urgent') === 0 || p.indexOf('紧急') === 0) return 'high';
    if (p === '低' || p.indexOf('low') === 0) return 'low';
    if (p === '中' || p.indexOf('medium') === 0 || p.indexOf('normal') === 0) return 'medium';
    return '';
  }

  function extractBySelector(script) {
    var out = {};
    var fields = script.fields || {};
    Object.keys(fields).forEach(function(key) {
      var f = fields[key];
      if (!f || !f.selector) return;
      var el = null;
      try { el = document.querySelector(f.selector); } catch (e) { return; }
      if (!el) return;

      var v = '';
      switch (f.attr) {
        case 'html': v = el.innerHTML || ''; break;
        case 'href': v = el.getAttribute('href') || ''; break;
        case 'src': v = el.getAttribute('src') || ''; break;
        case 'value': v = typeof el.value === 'string' ? el.value : ''; break;
        case 'attr': v = f.attrName ? (el.getAttribute(f.attrName) || '') : ''; break;
        default: v = el.textContent || '';
      }
      v = String(v).replace(/\s+/g, ' ').trim();
      if (!v) return;

      if (key === 'priority') {
        var p = normalizePriority(v);
        if (p) out.priority = p;
        return;
      }
      var limit = key === 'title' ? 100 : key === 'description' ? 2000 : 200;
      out[key] = v.slice(0, limit);
    });
    return out;
  }

  // ---------- JS 模式：沙箱执行 ----------
  var sandboxFrame = null;
  var sandboxSeq = 0;
  var pendingRuns = {};
  var sandboxToken = null; // 沙箱握手令牌，收到 TP_SANDBOX_READY 后置位
  var MAX_SNAPSHOT = 1500000; // 网页快照上限，避免超大页面传输卡顿
  var SANDBOX_READY_TIMEOUT = 3000; // 等待沙箱就绪的最长时间

  function ensureSandbox() {
    if (sandboxFrame) return sandboxFrame;
    try {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = chrome.runtime.getURL('sandbox.html');
      document.body.appendChild(f);
      sandboxFrame = f;
      window.addEventListener('message', onSandboxMessage);
    } catch (e) {
      sandboxFrame = null;
    }
    return sandboxFrame;
  }

  function onSandboxMessage(event) {
    var d = event.data;
    if (!d) return;
    if (d.type === 'TP_SANDBOX_READY') {
      // 沙箱页就绪，持有令牌后才允许发起执行
      if (d.token) sandboxToken = d.token;
      return;
    }
    if (d.type !== 'TP_SCRIPT_RESULT') return;
    var resolve = pendingRuns[d.id];
    if (!resolve) return;
    delete pendingRuns[d.id];
    resolve(d);
  }

  /** 等待沙箱页完成握手（返回 true 表示已拿到令牌） */
  function waitSandboxToken() {
    return new Promise(function(resolve) {
      if (sandboxToken) return resolve(true);
      var waited = 0;
      var timer = setInterval(function() {
        if (sandboxToken) {
          clearInterval(timer);
          return resolve(true);
        }
        waited += 100;
        if (waited >= SANDBOX_READY_TIMEOUT) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  /** 在沙箱中执行用户 JS，2 秒超时 */
  function extractByJs(script) {
    return new Promise(function(resolve) {
      var frame = ensureSandbox();
      if (!frame) return resolve({ ok: false, error: '沙箱不可用' });

      return waitSandboxToken().then(function(ready) {
        if (!ready) return resolve({ ok: false, error: '沙箱初始化超时' });
        runInSandbox(frame, script, resolve);
      });
    });
  }

  function runInSandbox(frame, script, resolve) {
      var id = 'tp_' + (++sandboxSeq);
      var timer = setTimeout(function() {
        if (pendingRuns[id]) {
          delete pendingRuns[id];
          resolve({ ok: false, error: '执行超时（2 秒）' });
        }
      }, 2000);

      pendingRuns[id] = function(res) {
        clearTimeout(timer);
        resolve(res);
      };

      var html = '';
      try { html = document.documentElement.outerHTML || ''; } catch (e) { html = ''; }
      if (html.length > MAX_SNAPSHOT) html = html.slice(0, MAX_SNAPSHOT);

      frame.contentWindow.postMessage({
        type: 'TP_RUN_SCRIPT',
        id: id,
        token: sandboxToken,
        code: script.code || '',
        html: html,
        url: window.location.href,
        selection: getSelectionText()
      }, '*');
  }

  /** 按脚本模式提取内容，返回 { ok, data } 或 { ok:false, error } */
  function runScript(script) {
    if (script.mode === 'js') {
      return extractByJs(script).then(function(res) {
        return res.ok ? { ok: true, data: res.data || {} } : { ok: false, error: res.error };
      });
    }
    try {
      return Promise.resolve({ ok: true, data: extractBySelector(script) });
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message });
    }
  }

  // ---------- 脚本加载 ----------
  function loadScripts() {
    return new Promise(function(resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'FETCH_SCRIPTS' }, function(res) {
          if (res && res.success && Array.isArray(res.data)) {
            scriptList = res.data;
          } else {
            scriptList = [];
          }
          scriptsLoaded = true;
          resolve(scriptList);
        });
      } catch (e) {
        scriptList = [];
        scriptsLoaded = true;
        resolve(scriptList);
      }
    });
  }

  function refreshMatched() {
    matched = pickMatched(scriptList, window.location.href);
    activeScript = matched.length ? matched[0] : null;
    applyButtonStyle();
  }

  /** 命中「一键入库」脚本时，按钮改为紫色闪电态 */
  function applyButtonStyle() {
    var oneClick = matched.some(function(s) { return s.action === 'submit'; });
    btn.classList.toggle('flash', oneClick);
    var label = btn.querySelector('span:last-child');
    if (label) label.textContent = oneClick ? '一键收藏' : '加入待办';
  }

  // ---------- 命中提示条 ----------
  function viaLabel(via) {
    switch (via) {
      case 'url': return 'URL 规则匹配';
      case 'title': return '页面标题匹配';
      case 'domain': return '域名关键词匹配';
      case 'path': return 'URL 路径匹配';
      case 'selection': return '选中文字匹配';
      default: return '脚本匹配';
    }
  }

  function renderHitBar(note, via) {
    if (!activeScript) {
      hitDiv.classList.remove('show');
      hitDiv.innerHTML = '';
      return;
    }
    hitDiv.classList.add('show');

    var html = '<span>⚡</span><span class="hit-name">' +
      escapeHtml(activeScript.name) + '</span>';
    html += '<span class="hit-via">' + escapeHtml(viaLabel(via)) + '</span>';

    if (matched.length > 1) {
      html += '<select id="__todopulse_scriptsel">' + matched.map(function(s) {
        return '<option value="' + escapeHtml(s.id) + '"' +
          (s.id === activeScript.id ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
      }).join('') + '</select>';
    }

    // 已提取字段胶囊 + 置信度
    var data = lastExtract.data || {};
    var chips = [];
    var count = 0;
    [['title', '标题'], ['description', '描述'], ['deadline', '截止'], ['priority', '优先级']].forEach(function(pair) {
      var v = data[pair[0]];
      if (v) {
        count++;
        chips.push('<span class="hit-chip"><i>' + pair[1] + '</i>' +
          escapeHtml(String(v).slice(0, 40)) + '</span>');
      }
    });
    if (chips.length) {
      var pct = Math.round((count / 4) * 100);
      html += '<span class="hit-conf">置信度 ' + pct + '%</span>';
      html += '<div class="hit-chips">' + chips.join('') + '</div>';
    }

    html += '<button id="__todopulse_rerun" type="button">重新提取</button>';
    if (note) html += '<span class="hit-note">' + escapeHtml(note) + '</span>';

    hitDiv.innerHTML = html;

    var sel = hitDiv.querySelector('#__todopulse_scriptsel');
    if (sel) {
      sel.addEventListener('change', function() {
        var next = matched.filter(function(s) { return s.id === sel.value; })[0];
        if (!next) return;
        activeScript = next;
        applyResultFlow(false);
      });
    }
    var rerun = hitDiv.querySelector('#__todopulse_rerun');
    if (rerun) rerun.addEventListener('click', function() { applyResultFlow(false); });
  }

  /**
   * 执行当前脚本并应用结果
   * @param {boolean} allowSubmit - 是否允许「一键入库」直接提交
   */
  function applyResultFlow(allowSubmit) {
    if (!activeScript) return Promise.resolve(false);

    var via = matchedVia[activeScript.id] || '';
    if (!via && lastSelectionScripts.indexOf(activeScript) >= 0) via = 'selection';

    return runScript(activeScript).then(function(res) {
      if (!res.ok) {
        lastExtract = { data: {}, via: via };
        renderHitBar('提取失败：' + res.error, via);
        return false;
      }
      var data = res.data || {};
      if (!data.title && !data.description && !data.deadline && !data.priority) {
        lastExtract = { data: {}, via: via };
        renderHitBar('未提取到内容，请手动填写', via);
        return false;
      }

      fillForm(data);
      lastExtract = { data: data, via: via };
      renderHitBar('已自动提取，可修改后提交', via);

      // 一键入库模式：直接提交
      if (allowSubmit && activeScript.action === 'submit') {
        submitDirectly(data);
        return true;
      }
      return true;
    });
  }

  function fillForm(data) {
    if (data.title) titleInput.value = data.title;
    if (data.description) descInput.value = data.description;
    if (data.deadline) deadlineInput.value = data.deadline;
    if (data.priority) prioritySel.value = data.priority;
  }

  /** 一键入库：不展开面板，直接提交并提示 */
  function submitDirectly(data) {
    var info = collectInfo();
    var payload = {
      type: 'ADD_TODO',
      pageTitle: info.title,
      url: info.url,
      selectedText: info.sel,
      title: (data && data.title) || info.title,
      description: (data && data.description) || '',
      priority: (data && data.priority) || 'medium',
      categoryId: defaults.categoryId || '',
      deadline: (data && data.deadline) || '',
      remindLead: remindSel.value
    };

    chrome.runtime.sendMessage(payload, function(result) {
      if (result && result.success) {
        showToast('⚡ 已按脚本「' + activeScript.name + '」收藏', 'success');
      } else {
        showToast('❌ ' + ((result && result.error) || '添加失败'), 'error');
      }
    });
  }

  // ---------- 原有：分类与默认值 ----------
  function loadDefaults() {
    try {
      chrome.storage.local.get(['defaultCategoryId', 'remindLead'], function(data) {
        defaults.categoryId = data.defaultCategoryId || '';
        defaults.remindLead = data.remindLead || '';
        if (defaults.remindLead !== '') remindSel.value = String(defaults.remindLead);
        if (defaults.categoryId && categoriesLoaded) categorySel.value = defaults.categoryId;
      });
    } catch (e) { /* ignore */ }
  }

  function loadCategories() {
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_CATEGORIES' }, function(res) {
        if (!res || !res.success) return;
        var list = res.data || [];
        categorySel.innerHTML = '<option value="">未分类</option>' +
          list.map(function(c) {
            return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
          }).join('');
        categoriesLoaded = true;
        if (defaults.categoryId) categorySel.value = defaults.categoryId;
      });
    } catch (e) { /* ignore */ }
  }

  // ---------- 交互 ----------
  function openPanel() {
    isOpen = true;
    widget.classList.add('open');

    var info = collectInfo();
    srcDiv.innerHTML = '📄 ' + escapeHtml(info.title) +
      (info.sel ? '<br>📝 ' + escapeHtml(info.sel.slice(0, 80)) + (info.sel.length > 80 ? '…' : '') : '');

    // 标题默认取选中文本，否则网页标题
    var defaultTitle = info.sel ? info.sel.slice(0, 100) : info.title;
    if (!titleInput.value) titleInput.value = defaultTitle;

    if (!categoriesLoaded) loadCategories();
    loadDefaults();

    // 脚本：首次打开时拉取，命中则预填
    var flow = scriptsLoaded ? Promise.resolve(scriptList) : loadScripts();
    flow.then(function() {
      refreshMatched();
      // 优先页面命中脚本；否则使用选中文字智能推荐的脚本
      if (matched.length) {
        applyResultFlow(false);
      } else if (lastSelectionScripts.length) {
        activeScript = lastSelectionScripts[0];
        applyResultFlow(false);
      } else {
        renderHitBar();
      }
    });
  }

  btn.addEventListener('click', function(e) {
    e.stopPropagation();

    if (isOpen) {
      isOpen = false;
      widget.classList.remove('open');
      resetSelectionState();
      return;
    }

    // 命中「一键入库」脚本时直接提交；提取失败则降级为展开面板手动填写
    if (activeScript && activeScript.action === 'submit') {
      applyResultFlow(true).then(function(ok) {
        if (!ok) openPanel();
      });
      return;
    }

    openPanel();
  });

  document.addEventListener('click', function(e) {
    if (!widget.contains(e.target) && isOpen) {
      isOpen = false;
      widget.classList.remove('open');
      resetSelectionState();
    }
  });

  submitBtn.addEventListener('click', async function(e) {
    e.stopPropagation();
    var info = collectInfo();
    var title = (titleInput.value || '').trim() || (info.sel ? info.sel.slice(0, 100) : info.title);

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中…';

    try {
      var result = await chrome.runtime.sendMessage({
        type: 'ADD_TODO',
        pageTitle: info.title,
        url: info.url,
        selectedText: info.sel,
        title: title,
        description: (descInput.value || '').trim(),
        priority: prioritySel.value,
        categoryId: categorySel.value || '',
        deadline: (deadlineInput.value || '').trim(),
        remindLead: remindSel.value
      });

      if (result && result.success) {
        var extra = result.data && result.data.formattedDeadline
          ? '（截止 ' + result.data.formattedDeadline + '）'
          : '';
        showToast('✅ 已添加到待办' + extra, 'success');
        titleInput.value = '';
        descInput.value = '';
        deadlineInput.value = '';
        hitDiv.classList.remove('show');
      } else {
        showToast('❌ ' + ((result && result.error) || '添加失败'), 'error');
      }
    } catch (err) {
      showToast('❌ 连接失败：请先打开 TodoPulse 桌面应用', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '添加到待办';
      isOpen = false;
      widget.classList.remove('open');
      resetSelectionState();
    }
  });

  function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'todopulse-toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(function() { t.remove(); }, 300);
    }, 3000);
  }

  /** 清空选中文字缓存（面板关闭或提交后调用，避免残留影响后续匹配） */
  function resetSelectionState() {
    forcedSelection = '';
    lastSelectionScripts = [];
    hideSelPill();
  }

  // ============================================================
  // 选中文字智能推荐浮窗
  // ============================================================
  var selPill = null;
  var selDebounce = 0;

  function ensureSelPill() {
    if (selPill) return selPill;
    selPill = document.createElement('button');
    selPill.id = '__todopulse_selpill';
    selPill.type = 'button';
    selPill.addEventListener('click', function(e) {
      e.stopPropagation();
      hideSelPill();
      openPanel();
    });
    document.body.appendChild(selPill);
    return selPill;
  }

  function hideSelPill() {
    if (selPill) selPill.classList.remove('show');
  }

  function showSelPill(text, scripts) {
    var pill = ensureSelPill();
    var sel = window.getSelection();
    var rect = null;
    try {
      if (sel && sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (e) { rect = null; }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      // 选区无有效矩形（如跨 iframe / 隐藏），降级为视口顶部居中
      rect = { top: 12, left: window.innerWidth / 2, width: 0, height: 0 };
    }
    var name = scripts.length === 1 ? scripts[0].name : ('匹配到 ' + scripts.length + ' 个脚本');
    pill.innerHTML = '⚡ 用「<span class="pill-name">' + escapeHtml(name) + '</span>」收藏选中内容';
    pill.style.top = (window.scrollY + rect.top - 44) + 'px';
    pill.style.left = (window.scrollX + rect.left + rect.width / 2) + 'px';
    pill.style.transform = 'translateX(-50%)';
    pill.classList.add('show');
  }

  /** 监听选中变化：防抖 200ms，命中 match.selection 的脚本则浮出提示 */
  function onSelectionChange() {
    clearTimeout(selDebounce);
    selDebounce = setTimeout(function() {
      var text = getSelectionText();
      if (!text) {
        forcedSelection = '';
        lastSelectionScripts = [];
        hideSelPill();
        return;
      }
      var scripts = pickSelectionScripts(scriptList, text);
      if (!scripts.length) {
        forcedSelection = '';
        lastSelectionScripts = [];
        hideSelPill();
        return;
      }
      forcedSelection = text;
      lastSelectionScripts = scripts;
      showSelPill(text, scripts);
    }, 200);
  }

  // 失焦 / 选区收起时隐藏浮窗
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('blur', hideSelPill);

  // 页面加载后静默拉取一次脚本，使悬浮按钮能提前切换为「一键收藏」态
  try {
    loadScripts().then(refreshMatched);
  } catch (e) { /* ignore */ }
})();
