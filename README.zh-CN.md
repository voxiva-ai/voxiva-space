<p align="center">
  <img src="src/assets/brand/voxiva-space-mark.png" width="112" alt="Voxiva Space 标志" />
</p>

<h1 align="center">Voxiva Space</h1>

<p align="center">面向 Windows 的终端、编程智能体、文件与浏览器工作区。</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

> **Beta v0.2.1。** 当前版本已可日常使用，但界面与会话恢复机制仍在持续改进。

## 在一个窗口中完成智能体工作流

Voxiva Space 可运行 Claude Code、Codex、OpenCode、Gemini CLI、Aider、Amp、Goose、Cursor Agent，以及任何其他终端工具。终端、文件、浏览器预览、任务和智能体提醒都保留在同一个可调整布局中。

### 功能

- Vault 中的终端智能体和普通 shell；
- 横向/纵向分屏、标签页与单窗格最大化；
- Claude Code 与 OpenCode 全屏 TUI 会随窗格正确重排，不再裁切；
- 工作区文件树与媒体预览；
- 用于本地站点的内置浏览器；
- 等待输入时的窗格和工作区提醒；
- 布局恢复与受支持智能体会话续接；
- 可配置快捷键、命令面板和拖放；
- 本地优先：此 beta 版本无需 Voxiva 账号，也不包含遥测。

## 安装

从 [GitHub Releases](https://github.com/voxiva-ai/voxiva-space/releases) 下载并运行最新的 `*-setup.exe`，或在 PowerShell 中执行：

```powershell
irm https://raw.githubusercontent.com/voxiva-ai/voxiva-space/main/scripts/tester-install.ps1 | iex
```

如果希望先审阅脚本，请打开 [`scripts/tester-install.ps1`](scripts/tester-install.ps1)，下载后在本机运行。

要求：Windows 10/11 与 Microsoft Edge WebView2。卸载路径：**设置 → 应用 → 已安装的应用 → Voxiva Space → 卸载**。

## 快速开始

1. 打开 Voxiva Space 并选择项目文件夹。
2. 选择 1、2、4 或 8 窗格布局。
3. 打开 **Agents**，启动在 `PATH` 中检测到的 CLI。
4. 拆分终端、打开浏览器窗格，或把文件拖入智能体提示作为 `@路径`。

Voxiva Space 不会替你安装第三方 CLI 或登录。请从各工具的官方来源安装并完成一次登录。

## 从源码构建

需要 Node.js 20+、Rust stable（MSVC）、Visual Studio Build Tools 与 WebView2。

```powershell
git clone https://github.com/voxiva-ai/voxiva-space.git
cd voxiva-space
npm ci
npm run dev
```

检查与打包：

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE) © 2026 Voxiva AI contributors。
