# dsh-plugin-archive-folder

Archive a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web
session to disk, and restore any archive later as a new session.

给 DSH Web 的会话标题栏加两个按钮：**归档到文件夹** 和 **归档箱**。归档把当前会话
的完整事件日志落成一个 JSON 存档；恢复则以存档里的原始会话为源分叉出一个新会话，
接着聊。

---

## 功能

- **归档到文件夹** — 把当前会话的完整原始事件日志（`SessionEvent[]`）写成一份 JSON
  存档，落在 `<会话工作目录>/归档/<标题>-<YYYY-MM-DD_HHmm>.json`。
- **归档箱** — 下拉面板列出当前可见的存档，显示标题、归档时间和最后一条用户消息摘要。
- **恢复** — 以存档记录的原始会话 ID 为源分叉新会话，定位到归档时的 `anchorSeq`，
  并把新会话标题设为 `<原标题> - <归档时间>`。
- **删除** — 删除存档（连带同名的 `.md` / `.meta.json` 兄弟文件）。

## 安装

前提：dsh 已安装，机器上有 `git` 和 `pnpm`。

### 方式一：作为 bundle 安装（推荐）

```sh
dsh plugin --profile web add github:Seelerc/dsh-plugin-archive-folder
```

本包声明了 `dsh.bundle.patch`，所以这条命令会把包装进 profile 的
`node_modules`，并自动把包名加进 `dsh.profile.bundles`。**bundle 列表在启动时读取，
因此装完需要重启 `dsh web`。**

### 方式二：手工接线

把仓库克隆到任意位置，在 `~/.dsh/profiles/web/cordis.patch.yml` 里插入加载器行：

```yaml
- insert:
    - id: archive-folder
      name: dsh-plugin-archive-folder
```

并让该包名能被 profile 解析（例如链接进 `~/.dsh/profiles/web/node_modules`）。
`cordis.patch.yml` 是 `patchReload: live` 的，改完无需重启。

> ⚠️ **两种方式互斥。** bundle 层与 profile 补丁层若同时插入同一个包，该包会出现两个
> 活动的 Loader 行，客户端模块系统会拒绝从多个来源提供的包，报
> `resolves from multiple active Loader sources`。

### 卸载

```sh
dsh plugin --profile web remove dsh-plugin-archive-folder
```

若用的是方式二，删掉 `cordis.patch.yml` 里那段 `insert` 即可。

## 实现

双面插件，两半都提交在本仓库里：

| 文件 | 角色 |
| --- | --- |
| `lib/index.js` | 宿主半侧。注册 `/archive-folder` 前缀路由，注入 `fs`、`sessionQuery`、`workspaceRegistry`、`shell`、`sessionTitle`、`sessions`、`webServer`。 |
| `lib/client.js` | 浏览器半侧。按客户端模块系统的 lazy-CJS factory 格式预构建，通过 `package.json` 的 `dsh.client` 声明被发现。 |
| `cordis.patch.yml` | bundle 补丁层，插入宿主行。 |

浏览器半侧占用的槽位：

- `conversation.session.header.actions` — 会话标题栏的两个按钮。
- `shell.overlay` — 全局提示条。

## 已知限制

- **目前仅支持 Windows 宿主。** 宿主半侧用 `ctx.shell` 执行 PowerShell 命令
  （`Get-ChildItem` / `Remove-Item`）来枚举和删除存档，在 POSIX 宿主上这些命令会失败。
  改用 `ctx.fs` 的目录 API 即可跨平台。
- **归档落点是 `<会话工作目录>/归档`。** 如果工作目录本身就叫「归档」，会多套一层，
  变成 `…/归档/归档`。
- **同一会话无新内容时不能重复归档。** 插件用 `anchorSeq` 去重：存档里的锚点不早于
  当前日志末尾时，会拒绝并提示「请继续聊天后再归档」。
- **恢复依赖会话分叉能力。** 浏览器侧调用 `ctx.sessions.fork({ sessionId, atSeq })`，
  宿主未提供该能力时恢复会失败。
- **仓库内没有构建步骤。** `lib/*.js` 是直接提交的产物，改浏览器半侧需要自己复刻
  DSH 客户端 bundle 的构建（仓库外的插件没有现成的 `tsdown` 预设可用）。

## 验证环境

dsh `0.1.5-rc.2` / Node 24 / Windows。宿主路由与浏览器半侧的加载均已实测。

## License

[MIT](LICENSE)
