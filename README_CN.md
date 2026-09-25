<p align="center"><img src="assets/icon.png" width="88" alt="Jot 图标"></p>

# Jot - 极简ToDo agent

<p align="center">一个极简 Todo agent，让 AI 把每天的进展自然整理成日志。</p>

<p align="center"><a href="https://github.com/cenzihan/Jot/releases"><img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white" alt="Windows"></a> <a href="https://github.com/cenzihan/Jot/releases"><img src="https://img.shields.io/github/v/release/cenzihan/Jot?include_prereleases&label=version" alt="最新版本"></a> <a href="https://github.com/cenzihan/Jot/actions/workflows/test.yml"><img src="https://github.com/cenzihan/Jot/actions/workflows/test.yml/badge.svg?branch=main" alt="构建状态"></a> <a href="LICENSE"><img src="https://img.shields.io/github/license/cenzihan/Jot" alt="MIT 许可证"></a></p>

<p align="center"><a href="README.md">English</a> · <a href="https://github.com/cenzihan/Jot/releases">下载</a> · <a href="docs/API.md">接口文档</a></p>

Jot 是一款极简的 Windows 桌面 Todo agent。平时，它只是桌面上一枚安静、可拖动的小胶囊；需要时点开，安排今天的行动、管理长期 Todo，或直接和 AI 聊聊。**完成的事会自然进入日志**，不必再专门维护一份完成清单。

![Jot 的 Today 页面与 AI 对话侧栏](docs/images/chat.png)

## ✨ 为什么用 Jot？

很多待办工具让人花不少时间整理清单。Jot 尽量把这件事变轻：**Today** 放眼前的一小步，**Todo** 放需要慢慢推进的事，**日志** 留下已经完成的部分。

你可以手动添加和勾选，也可以告诉 Jot 你准备做什么、刚做完什么。接入模型后，AI 能在对话中整理 Today、Todo 和完成记录；**改动会显示出来，也能撤销**。今日行动可以关联长期 Todo，完成一步不会让整个长期目标提前消失。

## 能做什么

- 📅 **今天与长期计划分开。** Today 管短期行动，Todo 管长期事项；可设计划日期和截止时间，在日、周、月日历中查看安排。
- 📓 **不用刻意维护的日志。** 完成行动后自动留下记录和简单统计，也可补写完成说明。普通随手记录独立保存，不会算作完成事项。
- ✨ **AI 帮你整理。** 多套 OpenAI 兼容或 Anthropic 模型配置可以分别保存、测试连接、一键切换；在流式对话里管理记录，也能选择本地 Codex、Claude 等 Agent 记录交给 AI 总结。
- 🧠 **轻量记忆。** 稳定偏好由你自己写，近期摘要会随对话自动更新，不会因此改动任务或日志。
- 🎙️ **语音随手记。** 听写与对话模型分开配置，识别结果可以先修改，再发给 Jot。
- 🖤 **安静的桌面入口。** 默认黑色胶囊简洁、不持续跳动；也有白色版本，并支持导入兼容的 Codex Pet 外观。

![Black Default 黑色胶囊](docs/images/default-black.png)

## 🚀 开始使用

1. 从 [Releases](https://github.com/cenzihan/Jot/releases) 下载 Windows 压缩包，完整解压后运行 `Jot.exe`。
2. Today 和 Todo 开箱即用。想用 AI，就在设置中填入 API 地址、密钥并选择模型；语音识别单独配置。
3. `Ctrl + Shift + J` 打开 Jot，`Ctrl + Shift + Space` 开始或停止语音输入。

## 开发

`src/` 是应用源码，`assets/` 放图标等素材，`docs/` 放接口说明与截图，`test/` 放测试。Windows 和 Node.js 24+ 环境下，运行 `npm ci`、`npm start` 即可启动；`npm test` 与 `npm run test:ui` 用于验证。记录与 Agent 接口见 [API 文档](docs/API.md)，开发约定见 [AGENTS.md](AGENTS.md)。

Jot 将记录保存在本机；使用 AI 时由你配置模型服务。项目采用 [MIT License](LICENSE)。
