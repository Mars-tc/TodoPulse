# TodoPulse - 统信UOS 桌面待办应用

运行在统信 UOS (x86_64) 上的 Electron 桌面 Todo 应用，配套 Chromium 浏览器扩展，可一键将网页内容收藏为待办事项。

## 功能特性

### 待办管理

- **浏览器扩展一键收藏**：在任意网页选中文本并点击右下角「加入待办」悬浮按钮，展开面板后可编辑标题、描述、优先级、分类、截止时间与提醒再入库。
- **分类 / 标签管理**：左侧分类侧边栏（内置工作 / 生活 / 学习），支持新建、重命名、删除分类，带颜色标识与待办数量角标；删除分类后其下待办自动回落为「未分类」。
- **搜索与排序**：顶部全局搜索实时匹配标题 / 描述 / 来源网页标题 / 选中文本并高亮命中关键词；支持按创建时间、截止时间、优先级排序并可切换升降序。
- **重复待办**：支持每天 / 每周 / 每月（可指定间隔）循环，完成当前轮次后自动生成下一轮（含子任务复制），并保留历史完成记录。下一轮时间以「本轮截止时间」为基准滚动；若本轮已逾期，则改为以当前时间为基准，避免补勾后立刻生成一条已逾期的新待办。每月循环处理月末溢出（1/31 + 1 月 = 2/28，闰年为 2/29）。日期算法集中在 `src-main/repeat_rule.js`，主进程生成与界面「下一次」预览共用同一实现。
- **子任务清单**：一条待办可拆分为多个子项，支持勾选完成、增删改，列表显示「2/5」进度条。
- **自然语言时间解析**：基于 `chrono-node`（已启用中文简体 locale），自动识别「9月10日」「下周三」「明天下午5点」等表述。
- **状态 / 优先级筛选**：支持「全部 / 未完成 / 已完成」切换，以及「今天到期 / 已逾期」快捷视图。
- **批量管理**：多选后批量删除，或一键清除已完成项。

### 网页脚本（自定义匹配）

- **脚本管理页**：侧边栏「🧩 网页脚本」、顶栏图标或托盘菜单均可进入，左侧脚本列表 + 右侧编辑器，支持新建、复制、删除与启用停用。
- **URL 规则匹配**：每条脚本可配置多条通配规则（如 `jira.company.com/*`、`*.example.com`），当前网页命中才运行；无协议头的规则自动兼容 http / https，未以 `*` 结尾的规则自动允许后续路径。
- **双模式提取**：
    - **CSS 选择器模式**：为标题 / 描述 / 截止时间 / 优先级分别配置选择器与取值方式（文本、HTML、链接、图片地址、表单值、自定义属性），零代码。
    - **自定义 JS 模式**：编写函数体，可用 `doc`（网页文档）、`url`（网址）、`selection`（选中文本）三个变量，返回 `{ title, description, deadline, priority }`；提供示例模板与语法校验。
- **两种应用方式**：`预填面板` 将提取结果填入表单供确认修改；`一键入库` 直接提交，悬浮按钮切换为紫色「⚡ 一键收藏」态。
- **多脚本切换**：同一网页命中多条脚本时，面板顶部提示条可下拉切换并「重新提取」。
- **失败静默降级**：桌面端未运行、脚本拉取失败、执行异常或超时（2 秒）时，一律回退为手动填写，不影响原有收藏流程。

### 到期悬浮窗

- **独立置顶小窗**：无边框、始终置顶、可拖动、可缩放的桌面挂件，主窗口最小化到托盘时仍然可见，可单独关闭。
- **显示已完成**：设置页可切换；关闭时看板仅展示未完成项，开启后已完成事项也进入对应分段。
- **三段到期看板**：已逾期（红）/ 今天到期（橙）/ 本周到期（蓝）三段互斥展示，各带数量角标，段头可折叠；逾期显示「逾期 N 天」，今天显示「N 小时后」，本周显示「明天 17:00 / 周三 09:00」等相对时间。
- **窗内交互**：勾选框直接标记完成（划线淡出后移除），点击事项打开主窗口并按标题筛选定位，顶部刷新按钮带旋转动效。
- **开关与记忆**：设置页「📌 悬浮窗」分组与托盘菜单「到期悬浮窗」勾选项均可开关；位置与尺寸在移动 / 缩放停止 400ms 后自动记录，下次启动复原；显示器变化导致坐标越界时自动回落到屏幕右下角。
- **不透明度**：60%–100% 可调，鼠标悬停时自动恢复 100%，兼顾常驻不遮挡与可读性。
- **数据同步**：主窗口新增 / 修改 / 删除待办后，悬浮窗自动刷新（数据变更广播至所有窗口）；反之亦然。

### 任务模板与工作流

- **模板库管理页**：侧边栏「🧰 模板库」、顶栏图标或托盘菜单均可进入，左侧模板列表 + 右侧编辑器，支持新建、复制、删除、启用 / 停用、设置颜色与图标。
- **模板内容结构**：模板名称（即生成待办的标题模板）+ 描述 + 条目清单；条目既可作为子任务落地（单条模式），也可各自展开为独立待办（清单预设模式）。
- **默认属性**：默认分类、优先级、提醒提前量、重复规则、精力档位、四象限归属、相对截止日偏移（今天起算 N 天）。
- **变量占位**：标题与描述支持 `{date}` `{today}` `{tomorrow}` `{weekday}` `{category}` 占位符，生成时按目标日期与分类自动替换；未知占位符原样保留。
- **一键生成**：模板库内直接生成，或用 `Ctrl+Shift+T` 唤起「模板快速选择面板」（命令面板式浮层，↑↓ 选择、Enter 生成、Esc 关闭）；快速添加条（`Ctrl+Shift+A`）内也提供「🧰 模板」下拉。
- **内置模板保护**：内置模板只读、不可删除，仅可复制为自定义模板。

### 智能规划排期

- **四象限视图**：2×2 网格展示待办（Q1 重要且紧急 / Q2 重要不紧急 / Q3 不重要但紧急 / Q4 不重要不紧急），未归类项单独归集；卡片支持跨象限拖拽改归属。
- **自动建议象限**：按优先级与截止时间距离推导建议值并给出理由文案，仅作提示，采纳后才写入；已归类的条目不会被建议覆盖。
- **今日排期面板**：按「象限优先级 → 精力时段匹配 → 每日容量上限」排出今日执行清单，每项给出被排入原因；顶部展示已排时长与容量占用进度条，超出容量的条目顺延提示。
- **精力档位与时段**：每条待办可标注高 / 中 / 低精力档位；设置中的精力时段表（上午高能 / 午后中等 / 晚间低能等）决定时段偏好匹配。
- **逾期顺延**：支持「顺延到今天 / 顺延到下一个工作日（跳过周末）/ 仅标记不改动」三种策略，可在规划页手动一键顺延；也可在设置中开启逾期自动顺延（默认关闭，挂在既有提醒扫描周期内执行）。
- **规划设置**：设置中心新增「🧭 智能规划」分组，集中配置每日容量、默认预估耗时、紧急阈值、精力时段表、自动顺延开关与策略。

### 设置中心

- **外观主题**：浅色 / 深色 / 跟随系统（随系统主题实时变化）、界面密度（紧凑 / 舒适）、字号（常规 / 大 / 特大），即时生效。字号通过全局 `--font-scale` 变量缩放（所有字号均以 `calc(Npx * var(--font-scale))` 声明，基准值 1 / 1.12 / 1.24）。
- **提醒设置**：总开关、默认提前量（新建待办时提醒下拉的默认值；`不提醒` / `截止时提醒` / 提前 N 分钟）、免打扰时段（支持跨零点）、扫描间隔、提示音与测试通知。
- **本地服务与扩展**：端口显示与修改（保存前探测冲突）、Token 掩码显示 / 复制 / 重新生成、服务启停、扩展目录与指南入口。
- **启动与关闭**：开机自启（UOS 写入 `~/.config/autostart`，Windows / macOS 走系统 API）、关闭窗口最小化到托盘或直接退出。
- **数据管理**：导入（合并 / 覆盖）、导出 JSON / CSV、清空回收站与清空全部数据（需输入 `DELETE` 确认）。
- **关于与诊断**：版本与运行环境、数据目录与关键路径（一键打开）、运行日志查看（复制 / 清空）。

### 提醒与常驻

- **到期提醒**：主进程按配置的间隔扫描，对到点或逾期的未完成待办弹系统通知；支持截止时提醒 / 提前 5 分钟 / 10 分钟 / 30 分钟 / 1 小时 / 3 小时 / 1 天提醒，同一待办同一时间点只提醒一次（去重表）；免打扰时段内不弹窗也不写去重表，解除免打扰后仍会正常提醒（不会「永久吞掉」）。
- **系统托盘常驻**：关闭主窗口不再退出应用，最小化到托盘；托盘菜单支持「打开主界面 / 新建待办 / 查看今日待办 / 设置 / 网页脚本 / 到期悬浮窗 / 退出」。

### 数据与视图

- **数据统计面板**：完成率、总数 / 已完成 / 逾期指标卡，近 7 天新增与完成趋势（SVG 折线 + 面积图，带 hover 提示），优先级分布条形图与分类分布环形图，深浅主题自适应。
- **回收站与撤销**：删除改为软删除进入回收站，支持单条 / 批量恢复、彻底删除、清空；删除后弹出 Toast 提供「撤销」操作。
- **导入导出**：JSON 全量备份（含分类与子任务）支持 merge / replace 两种导入模式；CSV 导出待办清单（带 BOM，Excel 中文不乱码）。
- **深色模式**：界面支持浅色 / 深色主题切换（偏好持久化）。
- **本地数据存储**：使用 `better-sqlite3`（WAL 模式）持久化，文件位于 `userData/todos.db`；结构升级为增量迁移，旧库数据不丢失并自动备份。

## 项目结构

```
TodoPulse/
├── .github/workflows/build-deb.yml  # Debian 10 构建、安装验证与 tag 发布
├── src-main/                 # Electron 主进程
│   ├── main.js               # Electron 入口（窗口、托盘、通知、IPC）
│   ├── db.js                 # better-sqlite3 封装（v2 增量迁移、分类、子任务、统计、导入导出）
│   ├── reminder.js           # 到期提醒：定时扫描 + reminder_log 去重 + 通知下发
│   ├── local_server.js       # Express 本地 HTTP 服务 (仅 127.0.0.1)
│   ├── config_store.js       # 本地配置读写 (port / token / settings / scripts，含损坏自愈与归一化)
│   ├── logger.js             # 运行日志：环形缓冲 + 落盘 + token 脱敏
│   ├── autostart.js          # 开机自启（Linux desktop 文件 / win-mac 系统 API）
│   ├── widget_window.js      # 到期悬浮窗：创建/显示/隐藏/位置记忆/越界校正
│   ├── time_parser.js        # chrono-node 时间解析（中文简体 + 英文）
│   ├── repeat_rule.js        # 重复规则日期计算（主进程生成 + 界面预览的单一来源）
│   ├── template_engine.js    # 模板展开算法（占位符替换 / 相对截止日 / 清单预设）
│   ├── quadrant_planner.js   # 象限与排期算法（象限建议 / 分桶 / 今日排期 / 逾期顺延）
│   └── preload.js            # 预加载脚本（contextBridge 暴露 API）
├── tests/                    # 纯逻辑测试（node tests/run_all.cjs 汇总执行）
├── src-renderer/             # Vue3 + Vite 渲染层
│   ├── index.html            # 主窗口入口
│   ├── widget.html           # 悬浮窗入口（独立多入口）
│   ├── vite.config.js
│   ├── assets/               # 图标等静态资源
│   └── src/
│       ├── main.js
│       ├── App.vue           # 主界面（三栏布局、视图切换、底部状态栏、focus-todo 定位）
│       ├── widget.js          # 悬浮窗 Vue 应用入口
│       ├── WidgetApp.vue      # 悬浮窗主组件：可拖动标题栏 + 三段看板
│       ├── components/
│       │   ├── TodoList.vue          # 列表项（分类色标/子任务进度/重复标识/高亮）
│       │   ├── AddEditModal.vue      # 新增编辑（分类/提醒/重复/子任务/自然语言）
│       │   ├── CategorySidebar.vue   # 分类侧边栏（快捷视图 + 增删改 + 脚本入口）
│       │   ├── SearchSortBar.vue     # 搜索框 + 排序切换
│       │   ├── StatsPanel.vue        # 统计面板（SVG 手写图表）
│       │   ├── TrashView.vue         # 回收站视图
│       │   ├── SettingsPanel.vue     # 设置中心（分组导航 + 内容区）
│       │   ├── settings/             # 设置分组：外观 / 提醒 / 服务与扩展 / 启动关闭 / 自动分类 / 智能规划 / 数据 / 悬浮窗 / 关于
│       │   ├── ScriptManager.vue     # 网页脚本管理页（左列表 + 右编辑器）
│       │   ├── ScriptEditor.vue      # 单条脚本编辑（规则 / 选择器 / JS 代码）
│       │   ├── TemplateManager.vue   # 模板库管理页（左列表 + 右编辑）
│       │   ├── TemplateEditor.vue    # 单条模板编辑（属性 / 条目清单）
│       │   ├── TemplatePicker.vue    # 模板快速选择面板（命令面板式浮层）
│       │   ├── PlanningView.vue      # 智能规划视图（四象限 + 今日排期双栏）
│       │   ├── QuadrantView.vue      # 四象限网格（拖拽改象限）
│       │   ├── PlanPanel.vue         # 今日排期面板（容量条 / 排期清单 / 逾期顺延）
│       │   ├── SubtaskList.vue       # 子任务清单编辑
│       │   ├── RepeatRuleEditor.vue  # 重复规则编辑器
│       │   └── ToastHost.vue         # 全局提示 + 撤销删除
│       ├── composables/
│       │   ├── useTodos.js           # 列表 / 筛选 / CRUD / 软删除撤销
│       │   ├── useUi.js              # 界面态（视图切换 / 弹窗 / 选中项）
│       │   ├── useCategories.js      # 分类状态与操作
│       │   ├── useTheme.js           # 三态主题 / 密度 / 字号
│       │   ├── useSettings.js        # 设置单例与保存
│       │   ├── useScripts.js         # 网页脚本单例与增删改查
│       │   ├── useTemplates.js       # 模板单例与增删改查 / 一键生成
│       │   ├── usePlanning.js        # 四象限 / 今日排期 / 逾期清单单例
│       │   └── useToast.js           # 全局提示队列
│       ├── utils/highlight.js        # 安全转义 + 关键词高亮
│       └── styles/
│           └── index.css
├── browser-extension/        # Chrome MV3 浏览器扩展（独立）
│   ├── manifest.json         # MV3 配置（含 sandbox CSP 与 web_accessible_resources）
│   ├── popup.html / popup.js # 扩展弹窗：port / token 可视化配置与连通性自检
│   ├── background.js         # Service Worker（转发请求到本地服务、拉取并缓存脚本）
│   ├── content-script.js     # 网页悬浮「加入待办」面板 + 脚本匹配与提取
│   └── sandbox.html / sandbox.js  # 用户 JS 执行沙箱（MV3 下唯一允许 eval 的环境）
├── deb-pkg/                  # 历史 deb 辅助脚本（未接入当前打包）
├── electron-builder.yml      # Electron Builder 配置（打包配置的唯一来源）
├── install.ps1               # Windows 安装辅助脚本
├── kill-node.ps1             # 开发辅助脚本
└── package.json
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 主进程 | Electron 28、Express 4、better-sqlite3 9、chrono-node 2、uuid 9 |
| 渲染层 | Vue 3、Vite 5 |
| 浏览器扩展 | Chrome Manifest V3（Service Worker + Content Script） |
| 打包 | electron-builder（deb / x64） |

## 本机开发与测试

Windows 用于开发和测试，UOS 20 / Debian 10 x64 安装包由 GitHub Actions 构建。统一使用 npm 与 `package-lock.json`，不再维护 pnpm 锁文件。

### 安装依赖

建议使用 Node.js 22（CI 使用相同主版本）；Node.js 24 可运行现有测试。需要网络以下载 Electron 和原生模块，若必须从源码编译，Windows 还需要 Python 和 Visual Studio C++ Build Tools。

```bash
cd TodoPulse
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm rebuild electron esbuild --registry=https://registry.npmjs.org/
npm run rebuild:native
```

先跳过安装脚本，避免 `better-sqlite3` 被编译为宿主 Node 的 ABI；随后安装 Electron / esbuild 二进制，并用 `@electron/rebuild` 将 SQLite 模块重建为 Electron ABI。正式 deb 包已包含原生模块，最终用户无需安装 Node 或执行重建。

若 Electron 下载因无法访问 GitHub 而超时，可临时设置环境变量 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重试 `npm rebuild electron esbuild`；安装器仍校验下载文件的 SHA-256。该变量只用于 Electron 下载，不影响 git 推送，CI 保持默认官方下载源。

若提示缺少 `@rollup/rollup-win32-x64-msvc` 或 `@esbuild/win32-x64`，先确认没有禁用 npm 的 optional dependencies，再执行 `npm ci --ignore-scripts --include=optional --registry=https://registry.npmjs.org/` 并重复后两步。请勿复制 Linux 的 `node_modules` 到 Windows，也不要在 Electron 重建后单独执行 `npm rebuild better-sqlite3`。

### 运行测试

```bash
npm test
```

8 个测试套件由 `tests/run_all.cjs` 自动发现并汇总，覆盖配置持久化与损坏恢复、HTTP 鉴权和输入校验、主进程服务生命周期、提醒、重复规则、模板展开、象限排期及数据库 SQL 契约。逻辑测试不直接加载 `better-sqlite3`；数据层契约测试使用 Node 内置 `node:sqlite`，不可用时会明确输出跳过提示。CI 的 Debian 10 安装验证另行测试真实 Electron / SQLite 原生模块。

### 开发模式运行

```bash
# 热更新：启动本机 Vite 和 Electron
npm run dev:electron

# 或验证生产构建
npm run build
npm run electron:dev
```

Vite 仅监听本机 `127.0.0.1:5173`。退出应用请使用托盘菜单「退出」，关闭主窗口默认只是最小化到托盘。

## 持续集成与发布

工作流为 `.github/workflows/build-deb.yml`，目标为 UOS 20（Debian 10、glibc 2.28、x86_64）。不在 Windows 跨平台打包，也不在新版 Ubuntu 直接编译原生模块，以免产物要求高于 UOS 20 的 glibc 版本。

| Job | 环境与验证 |
|-----|------------|
| `build` | Debian 10 容器、Node 22；`npm ci` 锁定依赖，运行测试，强制从源码为 Electron 编译 SQLite，构建 deb，检查 Electron 和 `.node` 的 glibc 要求不高于 2.28 |
| `verify` | 全新 Debian 10 容器；通过 apt 安装 deb 及声明依赖，运行包内 Electron 加载 SQLite 并查询内存数据库，检查随包浏览器扩展 |
| `release` | 仅 `v*` tag 且前两步成功时发布 GitHub Release，附加 deb 和自动生成的更新说明 |

触发条件：推送 `master`、发往 `master` 的 PR、推送 `v*` tag，以及 Actions 页面手动运行。构建产物位于运行页面的 **Artifacts → TodoPulse-deb**；发布包位于仓库 **Releases**。首次推送前需允许仓库运行 GitHub Actions；发布 job 使用仓库提供的 `GITHUB_TOKEN`，无需配置个人访问令牌。

Debian 10 已停止维护，工作流使用归档 apt 源并在更新时关闭过期日期检查，但仍验证软件包签名。此容器仅用于兼容性构建，不代表系统或 Electron 28 仍获得安全支持；桌面、托盘、通知和窗口管理器行为仍需在真实 UOS 20 上验收。

### 发布版本

1. 更新 `package.json` 的版本、运行 `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/` 同步锁文件，再更新 README 更新日志和用户手册版本。
2. 本机运行 `npm test`、`npm run build` 并测试 Electron 后，提交并推送 `master`，等待 `build` / `verify` 成功。
3. 创建与 `package.json` 一致的版本 tag；不一致会阻止构建和发布：

```bash
git tag v1.4.1
git push origin v1.4.1
```

tag 工作流验证通过后自动发布 Release。普通分支构建不会发布，`npm run dist` 也关闭 electron-builder 的隐式发布。

### Linux 本地打包（可选）

仅在 Debian 10 / UOS 20 x64 构建环境中执行，需 Python、C++17 工具链及打包依赖：

```bash
npm ci --ignore-scripts
npm rebuild electron esbuild
npm test
npm run rebuild:native -- --build-from-source
npm run dist
```

产物输出到 `dist-electron/`。无法保证在较新的 Linux 系统构建的 deb 与 UOS 20 兼容；推荐使用上述 Actions 工作流。

## 本地 HTTP API

本地服务仅监听 `127.0.0.1`，**所有接口（含 GET）均需携带 `X-Todo-Token` 鉴权头**。

### 健康检查

```http
GET /api/health
X-Todo-Token: <config.json 中的 token>
```

返回：`{ "success": true, "message": "Todo服务运行中", "port": 3210 }`

> 扩展弹窗的「测试连接」已携带 Token，因此健康检查同样受鉴权保护。

### 分类列表

```http
GET /api/categories
X-Todo-Token: <config.json 中的 token>
```

返回：`{ "success": true, "data": [{ "id": "uuid", "name": "工作", "color": "#3b82f6", "todo_count": 3 }] }`

### 网页匹配脚本列表

```http
GET /api/scripts
X-Todo-Token: <config.json 中的 token>
```

返回：`{ "success": true, "data": [{ "id": "uuid", "name": "Jira 工单", "mode": "selector", "action": "fill", "patterns": ["jira.company.com/*"], "fields": {...}, "code": "" }] }`

仅下发已启用脚本；异常时返回空数组而非错误，避免扩展侧报错。

### 新增待办

```http
POST /api/add-todo
Content-Type: application/json
X-Todo-Token: <config.json 中的 token>

{
  "pageTitle": "网页标题",
  "url": "https://example.com/page",
  "selectedText": "需要处理的文本内容（可含时间，如「周五前提交」）",

  "title": "自定义标题（可选，优先于 selectedText）",
  "description": "补充描述（可选）",
  "priority": "high | medium | low",
  "categoryId": "分类 ID（可选）",
  "deadline": "2026-09-10T09:00:00.000Z 或 自然语言「明天下午5点」",
  "remindLead": 30
}
```

- 校验：`pageTitle`、`selectedText`、`title` 不能同时为空。
- 标题规则：优先取 `title`，其次 `selectedText` 前 100 字符，最后 `pageTitle`；均无则记「未命名待办」。
- `deadline` 支持 ISO 串或自然语言（服务端自动识别）；`remindLead` 为提前提醒分钟数，需配合 `deadline` 生效。
- 成功返回：

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "…",
    "priority": "medium",
    "deadline": "2026-09-10T17:00:00.000Z",
    "formattedDeadline": "2026-09-10 17:00",
    "source_url": "https://example.com/page",
    "…": "其余字段"
  }
}
```

## UOS 安装与运行

在 [GitHub 仓库](https://github.com/Mars-tc/TodoPulse) 的 **Releases** 下载目标版本的 x64 deb（Actions 构建产物需先解压下载的 ZIP）。在 deb 所在目录安装，例如：

```bash
sudo apt install ./TodoPulse-1.4.1-amd64.deb
```

以实际下载文件名为准；apt 会自动安装声明的运行依赖。也可使用 `sudo dpkg -i <安装包.deb>`，缺少依赖时再执行 `sudo apt-get -f install`。

数据目录由应用首次启动创建，UOS 通常为 `~/.config/TodoPulse`，扩展目录为 `/opt/TodoPulse/resources/browser-extension/`。安装和升级不需要执行源码中的 `deb-pkg/` 脚本。

### 首次使用

1. 启动 TodoPulse 应用。
2. 应用自动生成配置：`~/.config/TodoPulse/config.json`（含随机 `port` 与 `token`）。
3. 点击界面 🧩 按钮打开「浏览器扩展使用指南」，其中直接展示当前端口与 Token，并可一键打开扩展目录。
4. 在扩展弹窗中填入端口与 Token，点击「测试连接并保存」即可，无需手动写 `chrome.storage.local`。

## 浏览器扩展加载

1. 打开 Chromium 系浏览器（Chrome / Edge / 360 极速等）。
2. 地址栏输入 `chrome://extensions`。
3. 开启右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择 `/opt/TodoPulse/resources/browser-extension/`（开发期可选源码中的 `browser-extension/`）。
5. 点击浏览器工具栏的扩展图标，在弹窗中填写端口与 Token，点击「测试连接并保存」，还可设置默认分类与默认提醒。
6. 任意网页右下角出现【加入待办】悬浮按钮；点击后展开面板，可编辑标题、描述、优先级、分类、截止时间与提醒，确认后入库。
7. 如需使用自定义脚本：在桌面端「🧩 网页脚本」中新建脚本并保存，扩展会在下次打开面板时自动拉取；命中「一键入库」脚本的网页，悬浮按钮会变为紫色「⚡ 一键收藏」。

> 端口与 Token 读取自 `~/.config/TodoPulse/config.json`。若提示未配置，请先确认 TodoPulse 已启动，再在扩展弹窗中重新测试连接。
>
> **升级后请重新加载扩展**：`manifest.json` 发生变更（新增沙箱页声明）时，需在 `chrome://extensions` 中点击扩展卡片上的刷新按钮重新加载，否则自定义 JS 模式不可用；选择器模式不受影响。

## 网页脚本配置说明

脚本统一保存在 `config.json` 顶层 `scripts` 数组，可随配置文件备份迁移。单条结构：

```json
{
  "id": "uuid",
  "name": "Jira 工单",
  "enabled": true,
  "mode": "selector",
  "action": "fill",
  "patterns": ["jira.company.com/*"],
  "fields": {
    "title":       { "selector": "h1", "attr": "text" },
    "description": { "selector": ".description", "attr": "text" },
    "deadline":    { "selector": ".due-date", "attr": "text" },
    "priority":    { "selector": ".priority", "attr": "text" }
  },
  "code": "",
  "builtin": false,
  "updatedAt": "2026-09-06T10:00:00.000Z"
}
```

- `mode`：`selector` 选择器模式 / `js` 自定义 JS 模式（此时 `code` 生效）。
- `action`：`fill` 预填面板 / `submit` 一键入库。
- `patterns`：URL 通配规则，支持 `*`、`?`；无协议头自动兼容 http / https，未以 `*` 结尾自动允许后续路径。
- `fields[].attr`：`text` / `html` / `href` / `src` / `value` / `attr`（配合 `attrName` 取自定义属性）。

JS 模式可用变量与返回值：

```js
// doc：网页文档（沙箱内 DOMParser 解析的快照，支持 querySelector 等）
// url：当前网页地址
// selection：页面上选中的文本
const titleEl = doc.querySelector('h1');
return {
  title: titleEl ? titleEl.textContent.trim() : doc.title,
  description: selection || '',
  deadline: '',
  priority: 'medium'   // high / medium / low，也支持「高 / 中 / 低」
};
```

所有字段均可选，返回值会经白名单过滤与长度截断（标题 100、描述 2000、截止时间 200 字符）。

## 数据库

- 数据库路径：`userData/todos.db`（UOS 通常为 `~/.config/TodoPulse/todos.db`）。
- 使用 `better-sqlite3`，WAL 模式；索引覆盖 `completed` / `deadline` / `create_at` / `category_id` / `deleted_at` / `parent_id` / `subtask.todo_id`。
- 结构升级通过 `db.js` 的 `migrate()` 增量执行（`PRAGMA table_info` 判列 + `ALTER TABLE ADD COLUMN`），**不会重建表、不丢历史数据**；首次升级会自动生成 `todos.db.<日期>.bak` 备份。
- `todo` 表字段：`id`、`title`、`description`、`completed`、`priority`、`deadline`、`create_at`、`source_url`、`source_page_title`、`source_selected_text`，以及 v2 新增的 `category_id`、`remind_at`、`remind_lead`、`repeat_rule`、`parent_id`、`deleted_at`、`completed_at`、`updated_at`。
- v2 新增表：
  - `category(id, name, color, sort_order, create_at)` —— 分类
  - `subtask(id, todo_id, title, completed, sort_order, create_at)` —— 子任务
  - `reminder_log(id, todo_id, fire_at, create_at)` —— 提醒去重（`(todo_id, fire_at)` UNIQUE）
- 删除为软删除（`deleted_at` 非空），数据进入回收站，可恢复或彻底清除。

## 安全说明

1. HTTP 服务仅绑定 `127.0.0.1`，禁止 `0.0.0.0`。
2. **所有**接口（含 `GET /api/categories`）请求携带 `X-Todo-Token` 鉴权，Token 启动时随机 32 位十六进制生成并保存在本地 `config.json`。
3. CORS 仅放行 `http://127.0.0.1`。
4. 渲染进程启用 `contextIsolation`，关闭 `nodeIntegration`；preload 只暴露 IPC 包装，不暴露任何 Node 能力。
5. 搜索关键词高亮先做 HTML 转义再包裹 `<mark>`，来源网页文本不会带来 XSS 风险。
6. SQL 一律使用参数化绑定，排序字段走白名单映射，禁止拼接用户输入。
7. 日志只输出端口，不输出 Token。
8. **自定义 JS 在沙箱中执行**：MV3 禁止扩展页面使用 `eval` / `new Function`，因此 JS 模式运行在 manifest 的 `sandbox.pages` 中声明的 `sandbox.html`（该页才适用含 `unsafe-eval` 的 sandbox CSP）。该环境无 `chrome.*` 扩展 API、无网络能力、无法访问真实页面 DOM，仅能操作传入的网页快照；执行超时为 2 秒，返回结果经字段白名单与长度截断后才可使用。
   沙箱页在 `web_accessible_resources` 中启用 `use_dynamic_url`，URL 每次会话随机、只能通过 `chrome.runtime.getURL()` 取得，避免被网页硬编码 iframe 加载；且沙箱只接受来自宿主窗口、携带握手令牌（`TP_SANDBOX_READY` 下发）的执行请求。
9. 脚本数据在主进程统一归一化：枚举值非法回落默认、选择器与规则去空去重、字段白名单过滤，坏数据不会落盘。

## 常见问题

**Q: better-sqlite3 原生模块错误**
A: 开发环境执行 `npm run rebuild:native`；Actions 构建的正式 deb 已包含为 Debian 10 / Electron 编译的模块，无需用户重建。若正式包仍报错，请检查是否下载了 x64 包，并反馈包版本、系统架构和完整错误；出现 `GLIBC_2.xx not found` 通常说明使用了来自较新系统的非兼容构建。

**Q: 扩展无法连接 / 提示未配置端口或 Token**
A: 确认 TodoPulse 已启动；点击扩展图标，在弹窗中填入从 `~/.config/TodoPulse/config.json`（或应用内 🧩 指南弹窗）读取的 `port` 与 `token`，点击「测试连接并保存」。

**Q: 系统通知不显示**
A: 确保已安装 `libnotify4`，并检查系统通知权限。到期提醒每 60 秒扫描一次，且同一待办同一时间点只提醒一次。

**Q: 脚本没有生效**
A: 依次检查：① 脚本已启用且规则能匹配当前网址；② TodoPulse 桌面端处于运行状态；③ 扩展已按上文提示重新加载过（manifest 变更后必须刷新）；④ 打开面板时顶部是否出现脚本命中提示条，失败提示会显示具体原因。若自定义 JS 模式提示「沙箱不可用 / 初始化超时」，说明扩展仍是旧版本（未声明 sandbox 页），请在 `chrome://extensions` 刷新扩展。

**Q: 悬浮窗不显示或位置错乱**
A: 在设置页「📌 悬浮窗」分组或托盘菜单「到期悬浮窗」勾选项开启；若位置跑到屏幕外，关闭后重新开启会自动回落到屏幕右下角；透明背景在部分 Linux WM 下可能失效，可尝试关闭窗口特效或反馈具体环境。

**Q: 端口被占用**
A: 应用启动时会从 3210 起自动探测可用端口；若固定端口冲突，可修改 `config_store.js` 中的起始端口后重启。

**Q: 关闭窗口后应用没退出**
A: 这是预期行为——应用已最小化为系统托盘常驻（到期提醒才能持续工作）。需要退出请点击托盘图标菜单中的「退出」。

**Q: 升级后旧数据丢失了吗**
A: 不会。结构升级为增量迁移，且首次升级会自动生成 `todos.db.<日期>.bak` 备份；如需回滚，用备份文件替换 `todos.db` 即可。

## 打包配置

打包配置以 `electron-builder.yml` 为**唯一来源**（`package.json` 中不再重复 `build` 字段，避免两处漂移）。
`files` 已包含 `src-renderer/assets/**`（托盘与窗口图标）与 `browser-extension/**`。`npmRebuild: false` 表示打包器不会重建原生模块；CI 必须在打包前执行 `npm run rebuild:native -- --build-from-source`。构建目标为 deb / x64，发布只由 Actions 的 `release` job 负责。

## 开发计划

- [ ] Native Messaging 替换 HTTP 方案
- [ ] 数据云同步（可选）
- [ ] 为 db.js / time_parser.js 补充自动化测试（当前 better-sqlite3 需 Electron ABI，需配套重建流程）
- [x] 多分类管理
- [x] 提醒功能
- [x] 扩展内可视化配置 port / token（免去手动写入 storage）
- [x] 搜索与排序
- [x] 重复待办与子任务
- [x] 数据统计面板
- [x] 导入导出与回收站撤销

## 更新日志

### v1.4.1

修复（严重）

- 浏览器扩展 `manifest.json` 补上 `sandbox.pages` 声明——此前未声明导致沙箱页按普通扩展页加载、被 CSP 拦截，**自定义 JS 模式完全不可用**；同时为沙箱页启用 `use_dynamic_url` 与握手令牌校验。
- 打包 `files` 补上 `src-renderer/assets/**`——此前成品包内托盘图标与窗口图标丢失。
- 字号设置真正生效——此前 `--font-scale` 只写不读；现所有字号改为 `calc(Npx * var(--font-scale))` 声明，`body` 基准字号同步缩放。

修复（功能）

- 服务停止 / 启动失败时清空 `port`，状态栏不再误报「运行中」；改端口时若服务原本停止则不再被意外拉起，同端口原地重启不再误判「端口被占用」。
- 「清除截止时间」不再被服务端从标题 / 描述重新解析出来（改为只解析用户显式输入的时间文本）。
- 重复待办：本轮逾期时下一轮改为从当前时间滚动，不再生成已逾期的新待办；`remind_lead = 0`（截止时提醒）不再丢失；每月循环修正月末溢出（1/31 + 1 月 = 2/28）。
- 到期悬浮窗三段改为各自 `LIMIT`，逾期项不再挤掉「今天 / 本周」；「显示已完成」开关正式生效。
- 扩展指南显示的目录改为真正的 `browser-extension` 目录（此前显示的是数据目录）。
- 悬浮窗内的提示（如勾选完成）现在可见（补上 Toast 渲染宿主）。
- 免打扰期间不再写入提醒去重表，解除免打扰后仍能收到提醒。
- 清空回收站的返回结果改为 `{ success, deleted }`，失败能正确提示。
- 子任务输入时光标不再跳到末尾；侧边栏深色模式适配规则（此前 `:deep([data-theme])` 写法永不命中）。
- CSV 导出所有字段统一转义；数据库备份前先做 WAL checkpoint；导入时补齐缺失的 `completed_at`。
- 退出时在 `before-quit` 等待资源清理完成，避免数据库 / 服务未正常关闭。

工程化

- 新增 `.gitignore` 与 git 仓库；打包配置收敛到 `electron-builder.yml` 单一来源。
- 新增 `tests/` 与 `npm test`；新增 `npm run rebuild:native`。
- 开发服务器不再对局域网开放（`127.0.0.1`）。
- 新增 GitHub Actions：在 Debian 10 / glibc 2.28 容器中构建 UOS 20 x64 deb，检查原生二进制兼容性，在干净容器安装验证后才允许 tag 发布 GitHub Release。
- 统一 npm 锁文件，将原生重建工具迁移至 `@electron/rebuild ~3.6.2`（node-gyp 9 兼容 Debian 10 的 Python 3.7），移除过期 pnpm 文件；同步本机开发、CI 发布和用户安装说明。

## 后续规划

本轮交付为「可扩展底座 + 端到端最小可用链路」，以下增强项已预留扩展点，后续批次逐步填充：

- **模板增强**：条件规则（按优先级 / 分类触发不同模板）、循环清单模板（每周 / 每月重复的清单预设）、模板导入导出、模板变量扩展（如 `{week}` `{month}` `{count}`）。
- **规划增强**：排期结果按天回写 `planned_at` / `planned_order`、排期统计图表（专注时长趋势、象限分布随时间变化）、把模板与四象限打通（模板可直接指定象限与精力档位，已支持字段但未做联动 UI）。
- **数据增强**：新增字段（象限 / 精力档位 / 计划日 / 预估耗时）尚未进入 `AddEditModal` 表单与 CSV 导出，暂只由规划视图维护。
- **本地 HTTP API**：模板与规划相关能力暂未开放为 HTTP 接口（浏览器扩展仍只走原有待办接口）。

