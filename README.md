<p align="center"><img src="assets/icon.png" width="88" alt="Jot 图标"></p>

# Jot - 极简ToDo agent

<p align="center">把今天的小事、长期目标和完成记录分开放；需要时，让你自己的 AI 帮忙整理。</p>

<p align="center"><a href="README_EN.md">English</a> · <a href="https://github.com/cenzihan/Jot/releases">下载</a> · <a href="docs/API.md">接口文档</a></p>

Jot 是一款 Windows 桌面应用。平时只是一个安静、可拖动的小胶囊；点开后，你可以手动管理事项，也可以接入自己的模型，在对话中管理 Todo 和日志。**Jot 不附带 AI 额度，也不会要求你注册 Jot 账号。**

![Jot 的 Today 页面与 AI 对话侧栏，使用隔离演示数据](docs/images/chat.png)

> 真实运行界面；文字来自隔离演示数据和测试模型，不包含用户记录或 API Key。

## 为什么用 Jot

普通清单容易把“今天顺手做一下”和“需要几周推进的目标”混在一起。Jot 刻意把它们分开：

| Today | Todo | 完成日志 |
| --- | --- | --- |
| 今天的行动与普通随手记录 | 长期目标，可设截止时间 | 已完成事项与简单统计 |

Today 行动可以关联 Todo，但勾掉今天的一步**不会自动完成整个 Todo**；普通记录默认也不算“已完成”。

## 核心功能

- **可接入的 AI Agent**：配置你自己的 OpenAI 兼容或 Anthropic 接口。Jot 可以通过受限工具新增、修改和完成记录；对话流式显示，修改立即生效且可撤销。可选择模型、调整 System Prompt 和风格。
- **不会越用越乱的任务视图**：Today 只管今天，Todo 留给长期目标；日历提供日、周、月视图，完成日志记录真正做完的事情。完成事项还能补写说明。
- **记忆与语音**：记忆卡保存你确认的稳定偏好；近期摘要只在你主动点击时生成。语音识别与对话模型分开配置，转写文字可先修改再发送。
- **安静的桌面入口**：默认黑白胶囊无持续动画，支持快捷键、拖动，也可导入兼容的 Codex Pet 外观。
- **本地优先**：记录存在本机。只有使用云端模型、听写，或你主动启用 Agent 记录来源时，相关内容才会发送到所配置的服务商。

Jot 的 AI 只能管理 Jot 内的 Todo、Today、记录和聊天，**不能执行任意电脑命令**。模型仍可能误解日期或内容，请检查重要修改。

## 默认外观

**Black Default** 是默认桌面胶囊，保持安静；需要记录或对话时再打开面板。

![Jot Black Default 桌面胶囊](docs/images/default-black.png)

## 快速开始

1. 从 [Releases](https://github.com/cenzihan/Jot/releases) 下载 Windows 压缩包，**解压整个文件夹**，运行其中的 `Jot.exe`。不要只移动 exe；安装包目前未签名。
2. 不配置 AI 也能直接手动记录。要启用对话，在设置里填写你自己的 API 地址、模型和 Key；语音服务另行配置。设置改动会自动保存。
3. `Ctrl + Shift + J` 打开面板；`Ctrl + Shift + Space` 开始或停止语音。聊天框里 `Enter` 发送，`Shift + Enter` 换行。

## 项目目录

| 目录 | 内容 |
| --- | --- |
| `src/` | Electron 应用、任务数据层、AI 接口和界面 |
| `assets/` | 应用图标与字体许可 |
| `docs/` | 接口说明、界面与外观截图、历史设计记录 |
| `test/` | 隔离数据的单元测试和界面测试 |

开发需要 Windows 与 Node.js 24+。运行 `npm ci`、`npm start`；验证使用 `npm test` 和 `npm run test:ui`。AI 工具与数据结构见 [接口文档](docs/API.md)，开发 Agent 约定见 [AGENTS.md](AGENTS.md)。

## 隐私与许可

个人记录位于 `%APPDATA%\Shiban`（沿用旧版目录），不在仓库中。API Key 在本机加密保存，不会写入源码或导出文件；导出的记录可能仍有隐私，请勿提交。升级前建议备份，旧版本未必能理解新版记录。

源码采用 [MIT License](LICENSE)。第三方字体和宠物素材保留各自许可。
