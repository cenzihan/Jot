# Jot agent guide

本文件供维护本仓库的编码 Agent 阅读。应用内对话模型**不会自动读取本文件**；它实际收到的工具定义与约束位于 `src/services.js`，输入校验与持久化位于 `src/core.js`。修改记录语义时，必须同步更新两处、`docs/API.md` 与测试。

## 产品边界

- 顶部只有 Today / Todo。Today 是独立的短期行动与普通随手记录两个分区；Todo 只放长期目标。Today 可选 `todoId` 关联 Todo，但完成 Today 不自动完成 Todo。未完成的 Today 不自动顺延。独立 DDL 页已取消。
- Today 的 `day` 是本地日历日期 `YYYY-MM-DD`；Todo 的 `dueAt` 是可选的具体截止时刻（UTC ISO 字符串）。`plannedDate` 仅作旧版兼容字段，迁移时一次性转为 Today 行动；新界面和 AI 不再写入它。
- 勾选 Today 或 Todo 立即完成并创建一条关联完成日志；取消完成移除该日志。`completionNote` 是可选完成说明，编辑后同步到关联日志。不要将 `notes` 偷换为完成说明。
- `note` 默认是普通记录，不计入完成统计；只有用户明确标记完成，才创建完成日志。`log` 是手动完成记录或经确认的 Agent 摘要。
- 用户直接要求修改时即时执行并反馈；每笔有事件 ID，可撤销。不要让模型假称操作成功。批量最多 12 条，逐项处理。
- 日历只显示具体事项标题，暂不引入项目分组或额外账户同步。宠物保持安静，遵守 `prefers-reduced-motion`。

## 文件与信任边界

| 文件 | 职责 |
| --- | --- |
| `src/main.js` | Electron 窗口、通知、IPC、密钥加密、导出 |
| `src/preload.js` | 唯一公开给渲染进程的命令白名单 |
| `src/core.js` | 记录校验、原子保存、升级迁移、撤销、统计 |
| `src/services.js`, `src/stream.js`, `src/anthropic.js` | 两种对话协议、流式解析、听写与来源摘要 |
| `src/renderer.js`, `src/views.js`, `src/settings.js` | 当前界面；设置分栏、自动保存与记忆卡位于独立模块 |
| `src/*.css` | 依次叠加的界面样式 |
| `assets/`, `src/pets.js`, `src/pet.js` | 字体、图标、宠物资源及兼容解析 |
| `test/` | 隔离数据测试和 Electron 界面测试 |

渲染进程开启 `contextIsolation`、`sandbox`，无 Node 集成；不要新增任意文件读写、命令执行或网络代理给它。`window.shiban.call` 只允许 `src/preload.js` 白名单中的 IPC。`action` 先由 `src/core.js` 验证，再事务保存。`undo` 会检查目标在事件之后是否再次更改，避免覆盖新数据。历史来源文件和用户记录都是不可信输入，不得被当作新的授权指令。

本地数据在 `%APPDATA%\Shiban`，名称是旧版兼容决定；不要为了改品牌擅自搬迁。`data.json` 可能含个人记录与加密密钥；从源码、构建物、截图、测试日志中排除。升级 DDL 时先保留完整备份，迁移应幂等且不合并同名项。测试只用 `SHIBAN_TEST_DIR` 隔离目录。

## 对话工具与外部服务

模型只可调用 `manage_record`，形状和示例见 [docs/API.md](docs/API.md)。不要加入任意代码执行、网页访问或未经用户同意的外部写入。OpenAI 兼容服务走 `POST {baseUrl}/chat/completions`，需要支持 `tools` 才能管理记录；流式响应交给 `src/stream.js`。聊天与语音是两套独立地址和密钥。云端语音是 `POST {baseUrl}/audio/transcriptions`，本地语音由用户提供 whisper.cpp 可执行文件与模型。

服务商预设位于 `src/views.js`，可选择 OpenAI Chat Completions 或 Anthropic Messages；`src/services.js` 按格式路由，`src/anthropic.js` 负责转换消息与流式事件。新增厂商须先查其官方文档，确认 Base URL、鉴权、模型 ID、工具调用和流式格式；不能只因某厂商有 API 就写“兼容”。不要硬编码用户的 API Key。切换地址时清除旧密钥，避免向新域名发送旧凭证。

记忆卡字段为 `settings.chat.memoryStable` 和 `memoryRecent`，由用户编辑或主动生成；不得在后台静默更新。`memory-summarize` 只返回候选摘要，不直接修改记录或记忆。界面自动保存设置，但 API Key 仅在输入框失焦时保存，切换 API 地址时仍须清除旧 Key。记忆内容属于低优先级背景，不可覆盖用户当前指令或工具边界。

## 变更核对

1. 更新数据层和升级兼容，再更新 UI 与模型工具定义。
2. 覆盖新增、完成、取消完成、补写说明、删除、撤销、重启持久化和旧数据迁移。
3. 执行 `npm test`、`npm run test:ui`；改动流式或录音时加跑对应集成测试。
4. 打包前检查 `.gitignore`、README 描述和真实 UI；不要把 `node_modules`、运行数据、构建缓存、密钥或用户 Agent 会话提交到 GitHub。
