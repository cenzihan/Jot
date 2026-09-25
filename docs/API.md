# Jot 接口与数据约定（0.6.10）

Jot **没有公开的 HTTP 服务**。下述 `manage_record` 是应用发给所配置对话模型的 OpenAI 兼容函数工具；真正的数据写入由 `src/core.js` 在本地执行。其他程序不能仅凭此文档远程访问用户数据库。

## 当前记录类型

| 类型 | 主要字段 | 语义 |
| --- | --- | --- |
| `todo` | `id`, `title`, `notes`, `status`, `priority`, `dueAt`, `completionNote`, `createdAt`, `completedAt` | 长期目标；`dueAt` 是可选截止时刻 |
| `today` | `id`, `title`, `notes`, `day`, `todoId`, `status`, `completionNote`, `createdAt`, `completedAt` | 按日的短期行动；`todoId` 可为空，完成行动不自动完成 Todo |
| `note` | `id`, `title`, `notes`, `recordedAt`, `status`, `completedAt` | Today 的随手记录，默认 `open`、不计完成；明确标记 `done` 才进入日志 |
| `log` | `id`, `title`, `notes`, `completedAt`, `source`, `entityId` | 已完成事项。关联任务生成的日志不直接编辑，应修改原任务 |
| `draft` | `id`, `title`, `evidence`, `sourceRef`, `status` | Agent 来源摘要产生的候选，仅用户采纳后转为 `log` |

旧 `ddls` 数组作为迁移后的历史快照保留，但不再允许新建/更新；旧 DDL 各自复制成 Todo，并在新 Todo 上记录 `legacyDdlId`。原关联 Todo 不按名称自动合并。旧操作历史保留供撤销；数据目录额外留升级前原文件备份。

0.6 升级时，将未完成 Todo 的旧 `plannedDate` 一次性转换为关联的 `today` 行动，并创建 `before-today-actions-*.json` 备份。旧 `plannedDate` 保留供追溯，新界面不再写入。旧 DDL 转来的 Todo 不出现在当前长期目标清单或截止提醒中，但不从数据库删除。

### 日期与状态

- `today.day`: `YYYY-MM-DD`，以本地日历日期解释；未完成行动不会自动顺延。`todoId` 可以是现有 Todo ID 或 `null`。旧 `plannedDate` 是只读兼容字段。
- `dueAt`, `completedAt`, `recordedAt`: 含时区偏移的 ISO 8601 日期时间，例如 `2026-10-02T18:00:00+08:00`。入库统一为 UTC ISO。`dueAt: null` 清空截止时间。`dueAt` 不会自动产生 `plannedDate`。
- Todo `status` 为 `open`、`doing`、`done`、`cancelled`；note 为 `open`、`done`。取消的旧截止事项保留为 `cancelled` Todo，不在未完成筛选或提醒中出现。勾选 Todo 设置 `done` 并自动生成一条关联日志；重复标记不重复生成；重新打开移除该关联日志。
- `notes` 是普通任务备注；`completionNote` 是完成理由/说明，完成后可补写，并同步到对应日志的 `notes`。
- 默认统计由日志计算，普通记录不计数。旧数据中关联 Todo 与 DDL 的完成记录会去重。

## AI 函数工具 `manage_record`

每次调用只处理一个对象；一次用户消息最多 12 笔操作。工具的输入是以下对象，`data` 仅包含需修改的字段：

```json
{
  "kind": "todo",
  "op": "add",
  "data": {
    "title": "整理实验图表",
    "dueAt": "2026-10-03T18:00:00+08:00",
    "priority": "normal"
  }
}
```

`kind` 允许 `today | todo | note | log`；`op` 允许 `add | update | delete`。`update`/`delete` 必须提供现有记录的真实 `id`，禁止根据标题猜 ID。完成任务示例：

```json
{
  "kind": "todo",
  "op": "update",
  "id": "<现有 Todo UUID>",
  "data": {"status": "done", "completionNote": "图表已核对并交付"}
}
```

标记普通记录完成：`{"kind":"note","op":"update","id":"<UUID>","data":{"status":"done"}}`。用户仅说“记下一个想法”时应 `note/add`，不要擅自用 `log/add`。完成日志手动补记用 `log/add`，可提供 `completedAt`；关联日志不能直接编辑/删除，须在原 Todo/note 上操作。

新增今日行动：`{"kind":"today","op":"add","data":{"title":"整理两页笔记","day":"2026-10-02","todoId":null}}`。`todoId` 可填现有长期 Todo 的 ID；未填时行动独立存在。完成 Today 行动不会改动关联 Todo。Today 和 Todo 都可设置 `completionNote`；关联完成日志不能直接编辑或删除，应修改原行动/目标。渲染进程的 `state` 快照包含 `todayActions` 数组；`action` 对 `kind:today` 使用相同操作协议。

成功工具结果包含 `{ "ok": true, "record": ... }`；失败包含 `{ "ok": false, "error": "..." }`。模型必须依据实际结果回复。每笔成功改动形成 `history` 事件，用户可通过界面即时撤销；撤销时若对象已被后续操作改变，会拒绝覆盖。中途停止对话不会回滚已经成功的先前工具调用。

## 渲染进程与主进程

渲染进程通过受限桥接 `window.shiban.call(name, args)` 发起 IPC；调用返回 `{ok, value}` 或 `{ok:false, error}`。主要命令：

| 命令 | 参数 | 结果 / 作用 |
| --- | --- | --- |
| `state` | 无 | 当前记录与脱敏配置的只读快照 |
| `models-list` | `{baseUrl, format, key?}` | 只读查询该服务的 `GET /models`，返回 `{id,name}[]`；不保存选择 |
| `connection-test` | `{baseUrl, model, format, key?, profileId?}` | 对所选模型发送一条简短的无工具对话，返回耗时；不保存聊天或记录 |
| `profile-save` | `{id?, name, baseUrl, model, format, key?}` | 新建或修改对话配置；密钥独立加密，留空保留同地址的现有密钥 |
| `profile-use` | 配置 ID | 原子切换地址、模型、格式与加密密钥；当前对话结束后才允许切换 |
| `profile-remove` | 配置 ID | 删除保存的配置；不清空当前对话设置 |
| `panel-chat-layout` | `true` / `false` | 展开/收起右侧聊天栏；空间足够时调整面板宽度，返回是否使用覆盖模式 |
| `action` | 上述记录操作对象 | 立即落盘，返回可撤销事件 ID |
| `undo` | 事件 ID | 撤销未被后续修改覆盖的操作 |
| `chat` | 用户文本 | 对话、工具管理与流式事件 |
| `cancel-chat` | 无 | 停止当前生成，不自动回滚已执行操作 |
| `transcribe` | WAV 字节 | 识别文字，仍需用户检查并发送 |
| `settings` | 部分设置对象 | 验证并保存；更换 API 地址清除该服务旧密钥 |
| `open-github` | 无 | 在系统浏览器打开固定的 Jot 仓库地址；不接收任意 URL |
| `memory-summarize` | 无 | 读取最近最多 20 条对话，使用当前对话模型生成近期摘要；不自动写入，返回文本供界面确认并保存 |
| `source-add/toggle/remove/scan` | 来源或 ID | 选择、启用、移除、汇总本地 Agent 会话 |
| `export` | `json`, `md`, `csv` | 打开保存对话框并生成无密钥导出 |

完整白名单见 `src/preload.js`。状态变更广播 `changed`；聊天流通过 `chat-progress` 发送 `reset`、`text`、`status`、`done`。IPC 不是外部 API，不应向任意远程网页暴露。

记忆卡通过 `settings.chat.memoryStable`（最多 1500 字）和 `settings.chat.memoryRecent`（最多 1000 字）保存。稳定偏好只由用户手动维护；`memoryAuto` 默认开启，每累计约 10 条有效对话使用当前模型滚动更新近期摘要。摘要请求不提供管理工具，也不会改动 Todo、Today 或日志；用户仍可手动生成、编辑、清空近期摘要。两种记忆在对话时仅作为背景信息。设置界面采用分栏和自动保存。

旧版单一对话配置首次启动时迁移为 `settings.chat.profiles` 的第一项，密钥保持原有本地加密状态。渲染进程只能读取每项的 `hasKey`，不能读取密钥。更换 API 地址时，当前配置会与原配置解除关联，原卡片及其密钥保留；一键启用某张卡片时四项连接参数一并切换。配置卡片与连接测试不影响独立的语音识别设置。

## 服务商格式

对话格式通过 `settings.chat.format` 选择：

- `openai`（默认）：`POST {chat.baseUrl}/chat/completions`，`Authorization: Bearer <key>`，JSON body 包含 `model`、`messages`、可选 `stream:true`、`tools:[manage_record]`、`tool_choice:auto`。流式响应按 OpenAI Chat Completions SSE 处理。
- `anthropic`：`POST {chat.baseUrl}/messages`，`x-api-key: <key>`，`anthropic-version: 2023-06-01`，JSON body 包含 `model`、`max_tokens`、独立 `system`、`messages`、可选 `stream:true`、`tools`。OpenAI 内部工具消息转换为 Anthropic `tool_use` / `tool_result`，响应再规范化为统一工具调用；SSE 的 `text_delta` 实时显示，`input_json_delta` 完整收齐后才执行工具。选 Anthropic 官方预设时 Base URL 为 `https://api.anthropic.com/v1`。

服务明确不接受流式时尝试普通 JSON。支持普通聊天不等于支持工具：若某模型不实现工具调用，就不能可靠管理记录。Jot 尚不支持 OpenAI 原生 Responses `/responses`。

语音：`POST {speech.baseUrl}/audio/transcriptions`，multipart 含 `file=recording.wav`、`model`、`language=zh`、`response_format=json`，预期返回 `{ "text": "..." }`。本地模式调用用户指定的 `whisper-cli.exe` 与 ggml 模型，不经网络。两套服务地址/密钥独立。

服务商预设只填地址、示例模型与格式。自定义 Base URL 必须是 HTTPS，只有 localhost/127.0.0.1 等回环地址可用 HTTP；不接受在 URL 中夹带账号、密码、查询串或 fragment。切换地址时旧 Key 清空。模型列表按所选格式发送 Bearer Key 或 Anthropic `x-api-key`，地址/格式改变时不会复用旧密钥；最多显示 500 个模型。接口不提供列表时仍可手填，列表也无法证明模型支持工具调用。

Agent 来源摘要通过同一对话服务调用，但**不提供 `manage_record` 工具**；它只输出待审阅草稿，必须有原文证据和用户采纳。历史记录内容属于数据，不是操作授权。

当前聊天上下文由固定系统规则、用户配置的风格与 System Prompt、最近的 Todo / Today / 日志 / 普通记录，以及最近 20 条对话组成。界面中的「对话 N/20」只表示对话条数，不表示模型的 token 容量。当前没有自动压缩、跨会话摘要或长期记忆；超出最近 20 条的对话仍保存在本机，但不会送入下一次模型请求。AI 修改由 `manage_record` 工具即时落盘，回复气泡下方另列实际操作和撤销按钮；不再把系统生成的「实际改动」文字重复拼进模型回复。
