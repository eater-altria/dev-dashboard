# ⚡ Dev Dashboard

一个使用 [Ink](https://github.com/vadimdemedes/ink) 和 React 构建的终端开发者仪表盘。直接在命令行中管理你的待办事项（TODO）和分支记录。

## ✨ 功能特性

- **📋 待办列表 (Todo List)**: 以交互方式跟踪你的开发任务。支持添加、选择和管理待办事项。
- **🌿 分支管理 (Branch Management)**: 快速记录和管理你的分支信息。享受智能提示功能，可以立即在目标仓库中物理创建或删除真实的 Git 分支。
- **🚀 快捷操作 (Quick Actions)**: 内置的命令面板。自动加载本地 `package.json` 中的脚本，并允许你定义自定义全局命令，所有操作均可通过简单的按键执行。
- **💻 交互式 CLI UI**: 优雅、对键盘操作友好的控制台用户界面，并且完全响应式。
- **📦 本地存储**: 你的数据会安全并持久地保存在本地路径 `~/.dev-dashboard-data.json` 下。

## 📦 安装

你可以通过 npm 全局安装它：

```bash
npm install -g @eater-altria/dev-dashboard
```

## 🚀 使用方法

只需输入以下命令即可启动仪表盘：

```bash
dev-dashboard
```

### ⌨️ 键盘快捷键

- `Tab` : 在待办列表、分支管理和快捷操作标签页之间切换。
- `↑` / `↓` : 在列表项中上下移动。
- `Enter` : 选择 / 确认操作。
- `a` : 添加新项目（待办项/分支）。
- `Ctrl + C` : 退出仪表盘。

## 🛠️ 开发指南

安装依赖并启动本地开发环境：

```bash
# 安装依赖
npm install

# 在监听模式下启动编译器
npm run dev
```

## 📝 许可证

MIT
