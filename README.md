# MeowStatus

可扩展的个人状态中心（Status Hub）：

- 公开展示页：`/`（只读）
- 管理页：自定义路径（`MEOWSTATUS_ADMIN_PATH`）
- 管理页采用登录弹窗认证
- 首次登录强制修改 Token
- 认证接口支持限流与锁定
- Token 存储为带盐慢哈希（PBKDF2）

## 快速开始

### 本地运行

```bash
python -m app.main
```

默认访问：`http://localhost:8080`

### Docker Compose

```bash
docker compose up --build -d
```

默认访问：`http://localhost:8080`

## 环境变量

- `STATUS_HUB_HOST` 默认 `0.0.0.0`
- `STATUS_HUB_PORT` 默认 `8080`
- `STATUS_HUB_DB` 默认 `./data/status_hub.db`
- `WIDGET_POLL_INTERVAL` 默认 `60`（秒）
- `MEOWSTATUS_ADMIN_TOKEN` 默认 `change-me`（首次引导 Token）
- `MEOWSTATUS_ADMIN_PATH` 默认 `/admin`（管理面板入口路径）
- `MEOWSTATUS_AUTH_MAX_ATTEMPTS` 默认 `5`（限流窗口内最大失败次数）
- `MEOWSTATUS_AUTH_WINDOW_SEC` 默认 `60`（限流窗口秒数）
- `MEOWSTATUS_AUTH_LOCKOUT_SEC` 默认 `300`（触发后锁定秒数）
- LOG_LEVEL 默认 INFO（日志级别）
- MEOWSTATUS_LOG_DIR 默认 ./logs（日志目录）
- MEOWSTATUS_LOG_MAX_BYTES 默认 5242880（单日志文件大小上限，字节）
- MEOWSTATUS_LOG_BACKUP_COUNT 默认 5（轮转保留文件数）

建议部署时至少修改：

- `MEOWSTATUS_ADMIN_TOKEN`
- `MEOWSTATUS_ADMIN_PATH`

注意：`MEOWSTATUS_ADMIN_PATH` 不能与保留路由冲突（如 `/api/*`、`/static/*`、`/`）。

## 页面说明

- `/`：公开状态展示页，仅查看
- `MEOWSTATUS_ADMIN_PATH` 对应路径：管理页

公开页已移除管理入口按钮；只有知道管理路径的人才能访问管理页。

## 管理页认证流程

1. 访问管理路径时，会先看到登录弹窗。
2. 输入 Token 后认证。
3. 如果是首次登录（系统首次初始化），会强制要求修改 Token。
4. 修改成功后才能进入管理面板并执行写操作。

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
- `GET /api/widgets/{id}`
- `GET /api/dashboard`

### 管理认证接口

- `POST /api/admin/login`
- `POST /api/admin/change-token`
- `GET /api/admin/check`

### 管理写操作接口（需已认证且已完成首次改 token）

- `POST /api/profile/status`
- `POST /api/widgets/minecraft`
- `PUT /api/widgets/{id}/minecraft`
- `DELETE /api/widgets/{id}`
- `POST /api/widgets/{id}/refresh`

## Minecraft 字段说明

当前实现基于 `api.mcsrvstat.us`，主要输出：

- 在线状态
- MOTD
- 版本
- 服务端信息（如 Paper / NeoForge，若上游可识别）
- 在线人数 / 最大人数
- favicon
- 延迟（仅当上游返回数值时）
- `ping_protocol_used` / `query_protocol_used`（协议探测标识）

说明：`debug.ping` 是布尔标志，不是毫秒值；解析时已显式排除布尔值，避免出现 `true/false ms` 或 `1.0/0.0 ms`。

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


