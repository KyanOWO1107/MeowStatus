# MeowStatus

可扩展的个人状态中心（Status Hub），用于公开展示个人状态与服务挂件状态。

- 公开展示页：`/`（只读）
- 管理页：自定义路径（`MEOWSTATUS_ADMIN_PATH`）
- 管理页采用登录弹窗认证
- 首次登录强制修改 Token
- 认证接口支持限流与锁定
- Token 存储为带盐慢哈希（PBKDF2）
- 支持 Minecraft Java / Bedrock 挂件
- 支持主题、自定义样式、本地背景/字体与公开页文案配置
- 支持后台定时刷新、手动刷新与挂件排序

## 快速开始

### 本地运行

先安装依赖：

```bash
python -m pip install "mcstatus>=13,<14"
```

可选：如果需要更完整地读取本地字体的授权元数据，可额外安装：

```bash
python -m pip install fonttools
```

启动服务：

```bash
python -m app.main
```

也可以在 Windows 下运行：

```bat
start.bat
```

默认访问：`http://localhost:8080`

### Docker Compose

```bash
docker compose up --build -d
```

默认访问：`http://localhost:8080`

当前 `docker-compose.yml` 默认持久化 `./data:/app/data`。如果要在 Docker 中使用本地背景、字体或持久化日志，可按需增加挂载：

```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
  - ./@localonly:/app/@localonly:ro
```

## 环境变量

- `STATUS_HUB_HOST` 默认 `0.0.0.0`
- `STATUS_HUB_PORT` 默认 `8080`
- `STATUS_HUB_DB` 默认 `./data/status_hub.db`
- `WIDGET_POLL_INTERVAL` 默认 `60`（秒，最小 5）
- `MEOWSTATUS_ADMIN_TOKEN` 默认自动生成一次性随机 Token（首次引导 Token）
- `MEOWSTATUS_ADMIN_PATH` 默认 `/admin`（管理面板入口路径）
- `MEOWSTATUS_AUTH_MAX_ATTEMPTS` 默认 `5`（限流窗口内最大失败次数，最小 1）
- `MEOWSTATUS_AUTH_WINDOW_SEC` 默认 `60`（限流窗口秒数，最小 5）
- `MEOWSTATUS_AUTH_LOCKOUT_SEC` 默认 `300`（触发后锁定秒数，最小 10）
- `LOG_LEVEL` 默认 `INFO`（日志级别）
- `MEOWSTATUS_LOG_DIR` 默认 `./logs`（日志目录）
- `MEOWSTATUS_LOG_MAX_BYTES` 默认 `5242880`（单日志文件大小上限，字节，最小 1024）
- `MEOWSTATUS_LOG_BACKUP_COUNT` 默认 `5`（轮转保留文件数，最小 1）
- `MEOWSTATUS_LOCAL_ASSETS_DIR` 默认 `./@localonly`（本地背景与字体根目录）
- `MEOWSTATUS_TRUST_PROXY_HEADERS` 默认 `false`（是否信任 `X-Real-IP` / `X-Forwarded-For`）
- `MEOWSTATUS_CORS_ORIGINS` 默认空（跨源白名单，逗号分隔；默认仅同源访问）

如果未设置 `MEOWSTATUS_ADMIN_TOKEN`，或仍设置为旧默认值 `change-me`，首次创建数据库时会自动生成一次性随机 Token，并写入启动日志。使用该 Token 首次登录后，需要立刻修改为新 Token。

建议部署时至少修改：

- `MEOWSTATUS_ADMIN_TOKEN`
- `MEOWSTATUS_ADMIN_PATH`

注意：`MEOWSTATUS_ADMIN_PATH` 不能与保留路由冲突（如 `/api/*`、`/static/*`、`/`、`/index.html`、`/favicon.ico`）。

## 页面说明

- `/`：公开状态展示页，仅查看；自动读取主题、文案、个人状态和挂件状态。
- `MEOWSTATUS_ADMIN_PATH` 对应路径：管理页；用于登录、修改 Token、更新状态、管理挂件、切换主题、配置本地素材和公开页文案。
- `/static/*`：前端静态资源。
- `/local-assets/bg/*` 与 `/local-assets/fonts/*`：本地素材读取路由，仅公开当前已保存配置正在使用的背景与字体文件。

公开页已移除管理入口按钮；只有知道管理路径的人才能访问管理页。公开页和管理页都会定时刷新仪表盘数据。

## 管理功能

管理页当前包含：

- 个人状态管理：`working`、`studying`、`resting`、`away`，并可填写备注。
- Minecraft 挂件管理：新增、编辑、删除、手动刷新、刷新全部、上移/下移排序。
- 主题管理：从内置主题中搜索并切换。
- 自定义主题：启用自定义颜色、明暗模式、背景样式、字体缩放、圆角比例、阴影强度和分区透明度。
- 本地背景与字体：从 `@localonly/bg` 与 `@localonly/fonts` 扫描可用素材，支持本地预览和保存。
- 公开页文案：可配置标题、副标题、字段标签和空状态文案。

## 管理页认证流程

1. 访问管理路径时，会先看到登录弹窗。
2. 输入 Token 后认证。
3. 如果是首次登录（系统首次初始化），会强制要求修改 Token。
4. 新 Token 至少 8 位，且不能以空白字符开头或结尾。
5. 修改成功后才能进入管理面板并执行写操作。

## 认证方式（API）

管理接口需要请求头：

- `X-Admin-Token: <token>`

也支持：

- `Authorization: Bearer <token>`

认证限流：

- `POST /api/admin/login`
- `POST /api/admin/change-token`

当触发限流时返回 `429` 并带 `Retry-After` 头。

## API 概览

### 公共读取接口

- `GET /api/health`
- `GET /api/profile/status`
- `GET /api/widgets`
- `GET /api/widgets?kind=minecraft-java`
- `GET /api/widgets?kind=minecraft-bedrock`
- `GET /api/widgets/{id}`
- `GET /api/dashboard`
- `GET /api/theme`
- `GET /api/copy`
- `GET /api/assets`

### 管理认证接口

- `POST /api/admin/login`
- `POST /api/admin/change-token`
- `GET /api/admin/check`

### 管理操作接口（需已认证且已完成首次改 token）

- `GET /api/admin/widgets`
- `GET /api/admin/dashboard`
- `GET /api/admin/local-assets`
- `POST /api/profile/status`
- `POST /api/widgets/minecraft`
- `PUT /api/widgets/{id}/minecraft`
- `POST /api/widgets/{id}/order`
- `POST /api/widgets/{id}/refresh`
- `DELETE /api/widgets/{id}`
- `POST /api/theme`
- `POST /api/copy`
- `POST /api/assets`

## 主题、文案与本地素材

内置主题 ID：

`bluery`、`midnight`、`nature`、`lake`、`coder`、`github`、`vscode`、`dark`、`fox`、`flamingo`、`lavender`、`amethyst`、`sky`、`cyan`、`lemon`、`chocolate`、`strawberry`、`mint`、`lime`、`obsidian`、`ocean`、`pale`、`honey`、`indigo`、`rose`、`paradox`、`gingercat`、`galaxy`、`pine`

自定义主题支持：

- `enabled`
- `background` / `accent`：3 位或 6 位十六进制颜色
- `mode`：`auto`、`light`、`dark`
- `background_style`：`gradient`、`solid`
- 字体选项：`default`、`mono`、`serif`、`round`、`display`
- 组件字体额外支持：`inherit`
- `font_scale`：85-130
- `radius_scale`：75-150
- `shadow_strength`：50-180
- `panel_opacity`：35-100，控制主面板与弹窗卡片透明度
- `card_opacity`：20-100，控制挂件卡片、状态块和主题选项透明度
- `input_opacity`：35-100，控制输入框和下拉框透明度
- `overlay_opacity`：20-90，控制登录遮罩透明度

本地素材目录结构：

```text
@localonly/
  bg/
    example.jpg
  fonts/
    ExampleFont.ttf
```

背景支持：`.jpg`、`.jpeg`、`.png`、`.webp`

字体支持：`.ttf`、`.otf`、`.ttc`、`.woff`、`.woff2`

字体会进行授权提示分类：

- `allowed`：检测到常见开源授权标记，可在管理页选择。
- `review`：未检测到明确开源授权信息，建议人工确认，默认不能直接用于保存。
- `blocked`：检测到个人/非商用、商业字体或品牌字体关键词，默认禁用。

`@localonly/` 已在 `.gitignore` 中排除，适合放置只在本机或部署机器上使用、无需提交到仓库的背景和字体。公开素材路由不会开放整个目录，只会服务当前已保存配置引用的文件。

管理页预览未保存素材时，会通过需认证的 `/api/admin/local-assets/{bg|fonts}/...` 拉取文件并生成临时浏览器预览；公开页仍只能访问已保存配置引用的素材。

## Minecraft 字段说明

创建或更新 Minecraft 挂件时支持：

- `edition`：`java` 或 `bedrock`
- `host`：服务器主机，必填
- `port`：端口；Java 默认 `25565`，Bedrock 默认 `19132`，范围 `1-65535`
- `timeout_sec`：查询超时秒数，默认 `6`，范围 `1-30`
- `source`：`auto`、`mcstatus`、`mcsrvstat`
- `name`：挂件名称
- `enabled`：是否启用

当前实现支持三种来源：

- `source=auto`（默认）：先使用 `mcstatus` 直连协议查询，失败后自动回退 `api.mcsrvstat.us`
- `source=mcstatus`：仅使用 `mcstatus`
- `source=mcsrvstat`：仅使用 `api.mcsrvstat.us`

主要输出：

- 在线状态
- MOTD
- 版本
- 服务端信息（如 Paper / NeoForge，尽力识别）
- 在线人数 / 最大人数
- favicon（Java 可取；Bedrock 通常没有自定义图标）
- 延迟（仅当返回数值时）
- `ping_protocol_used` / `query_protocol_used`（协议探测标识）
- `fallback_from`（当 `auto` 回退到 mcsrvstat 时出现）
- `checked_at`
- `raw`（仅管理接口返回；公开接口会移除原始响应）

说明：`debug.ping` 在 `mcsrvstat` 中是布尔标志，不是毫秒值；解析时已显式排除布尔值，避免出现 `true/false ms` 或 `1.0/0.0 ms`。

## 数据与刷新

- SQLite 数据库默认位于 `./data/status_hub.db`。
- 服务启动时会自动创建所需表和默认设置。
- 后台轮询线程会立即刷新一次所有启用挂件，之后按 `WIDGET_POLL_INTERVAL` 周期刷新。
- 管理页创建或更新启用的 Minecraft 挂件时，会立即触发一次刷新。
- 公开页前端每 10 秒重新读取 `/api/dashboard`；管理页每 10 秒读取 `/api/admin/dashboard`。
- 公开接口只返回启用挂件，并移除 `config` 与 `raw` 等管理/原始字段。
- 挂件排序通过 `sort_order` 持久化，删除挂件后会自动重建连续排序。

## 反向代理与跨源

默认情况下，认证限流使用直接连接 IP，不信任代理转发头。若部署在可信反向代理后，并且代理会覆盖 `X-Real-IP` 或 `X-Forwarded-For`，可设置：

```bash
MEOWSTATUS_TRUST_PROXY_HEADERS=true
```

跨源访问默认不开放。确需让其他域名访问 API 时，可设置：

```bash
MEOWSTATUS_CORS_ORIGINS=https://status.example.com,https://admin.example.com
```

服务会同时发送基础安全响应头，包括 `X-Content-Type-Options`、`Referrer-Policy` 与 `Content-Security-Policy`。

## 日志

服务启动后会自动创建日志目录（默认 `./logs`），并写入滚动日志文件：

- `logs/meowstatus.log`
- `logs/meowstatus.log.1` ... `logs/meowstatus.log.N`

日志会同时输出到控制台和文件，文件会按大小自动轮转。

## 错误展示安全策略

Minecraft 挂件错误会返回：

- `last_error_code`：稳定错误码（如 `MC_NET_FAIL`）
- `last_error`：安全文案（不包含底层 SSL/堆栈细节）

完整异常细节仅保留在服务端日志中。

## 项目许可证

本项目采用 **Apache License 2.0**。

- 许可证全文见 `LICENSE`
- 归属声明见 `NOTICE`
- 第三方依赖声明见 `THIRD_PARTY_NOTICES.md`

## 第三方许可说明

当前已记录的第三方组件许可见 `THIRD_PARTY_NOTICES.md`。
后续新增依赖或引入第三方代码时，请同步更新该文件。
