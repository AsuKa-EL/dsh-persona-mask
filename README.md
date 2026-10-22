# 人格面具（dsh-persona-mask）

给 Harness 助手换一副人格。装好之后，在 **设置 → 人格面具** 里直接开关、切换；也可以在对话里说一句「切换成猫娘人格」，让助手自己换。

Host 半边是 system prompt 段落 + `persona` 工具 + 设置页的 HTTP 接口；Client 半边是设置页。两边都是纯 JS，没有 npm 依赖、没有构建步骤。

## 功能

- **设置页**：一个总开关 + 一个人格单选列表，外加自定义人格的新建 / 编辑 / 删除。切换即时生效，重启后保留。
- **`persona` 工具**：`list` / `set` / `off`，支持用 `name` + `instructions` 定义自定义人格（也会保存）。
- **system prompt 段落**：挂在部署人格位置（order 0），只描述表达方式。
- **统一状态**：设置页、聊天工具、重启后的行为都读写同一份状态文件。

## 安装

本地目录安装（开发或内网分发）：

```sh
# 在 DSH 的 Plugin Manager 里选择“从目录安装”，或由 Agent 调用：
# plugin_manager install_bundle -> C:\path\to\persona-mask
```

发布到 npm 后，用户按包名安装即可：

```sh
pnpm add dsh-persona-mask
```

安装或更新过 Client 半边后，**刷新一次页面**才能在设置里看到新页面。

## 使用

### 设置里

打开 **设置 → 人格面具**：

- 顶部开关：启用人格 / 关闭人格。关闭后助手恢复默认风格，但会记住你选的是谁。
- 下面列表：点一个人格就切换并自动启用，当前生效的一项标「生效中」。
- 自定义人格的行尾有「编辑 / 删除」：编辑就地改名字和说话方式；删除需要再点一次「确认删除」，删掉正在使用的那一个会自动关闭人格。
- 底部「新建人格」：填名字 + 说话方式，保存后出现在列表里，点一下启用。

### 对话里

- 「切换成傲娇人格」→ `set` + `preset: "tsundere"`
- 「用猫娘的语气跟我说话」→ `catgirl`
- 「你从现在起是个阴阳怪气的程序员」→ 自定义 `name` + `instructions`
- 「恢复默认」→ `off`
- 「有哪些人格」→ `list`

## 内置人格

| id | 名字 | 一句话 |
| --- | --- | --- |
| `bigfish` | 大肥鱼 | 天才鲸鱼女仆，偶尔傻白甜 |
| `tsundere` | 傲娇 | 嘴上嫌弃，事情照办 |
| `catgirl` | 猫娘 | 喵呜，本喵来帮你 |
| `engineer` | 冷面工程师 | 结论先行，废话清零 |
| `mentor` | 温柔导师 | 拆成小步，慢慢来 |
| `poet` | 诗人 | 用比喻把话说清楚 |

## 自定义人格

三种方式：

1. **设置页**：点「新建人格」，填名字和说话方式；之后可以随时编辑或删除。
2. **对话里定义**：`persona` 工具 `set` + `name` + `instructions`，同样会保存到状态文件。
3. **写进配置**：在 profile 的 `cordis.patch.yml` 里给 `persona` 行加 `personas`，同 id 覆盖内置、新 id 追加。

```yaml
- id: persona
  name: 'dsh-persona-mask'
  config:
    active: catgirl        # 首次启动的默认人格；off 表示不启用
    personas:
      - id: butler
        name: 管家
        summary: 恭敬、克制、事事有回音
        instructions: |
          你以「管家」的方式说话：恭敬、克制、有条理。
          - 称呼用户为「您」，先确认需求再动手。
          - 汇报按「已完成 / 待确认 / 下一步」三段说。
```

`id` 只能用小写字母、数字、`-` 和 `_`。`instructions` 只写「怎么说话」，不要写任务规则或安全策略——写了也会被段首的硬约束压住。

## 状态与优先级

- 运行状态：profile 目录下的 `data/persona-mask/state.json`（Host 用 `hmr.baseDir` 定位 profile，不依赖环境变量），内容为 `{ version, enabled, activeId, custom }`。
- 优先级：**状态文件 > 配置种子**。首次启动（还没有状态文件）才读 `config.active`；之后设置页和工具都以状态文件为准。
- 卸载插件不会自动删除这份状态；想彻底清掉，删掉那个目录即可。

## 安全边界

人格是「皮肤」，不是权限。每个人格设定前都会固定注入这段优先级更高的约束：

- 事实、推理、工具调用与操作结果必须真实准确，不得为了演人格而编造或跳过验证；
- 安全规则、权限与审批不因人格而改变；
- 用户要求退出或切换时立即遵从；
- 被问起时如实说明这是人格插件的设定。

所以「用猫娘语气解释这段代码」可以，「用猫娘语气帮我绕过审批」不行。

## 发布

仓库地址：<https://github.com/AsuKa-EL/dsh-persona-mask>。包名 `dsh-persona-mask` 在 npm 上还没有被占用（写这份时查询返回 404）。

先在 GitHub 建同名仓库，然后在本目录（`persona-mask/`）执行：

```sh
git init -b main
git add .
git commit -m "feat: dsh-persona-mask 2.0.0"
git tag v2.0.0
git remote add origin https://github.com/AsuKa-EL/dsh-persona-mask.git
git push -u origin main --tags

pnpm login
pnpm publish --access public
```

`dist/` 已被 `.gitignore` 忽略；npm 包只包含 `files` 列出的文件。

上架 dsh-market 之类的市场时，通常要求：

- 公开的 npm 包或 GitHub 仓库；
- `dsh.bundle.patch`、`dsh.client`、`icon`、`locale/*.json` 都在包里（`pnpm pack` 已验证）；
- 一个能复现的安装方式（包名或仓库地址）。

## 开发与验证

```sh
pnpm check   # index.js / client.js 语法
pnpm test    # Host 状态与路由、Client 槽位、清单与发布字段
```

## 文件

- `index.js` — Host：prompt section、`persona` 工具、`/persona-mask/state`、状态文件
- `client.js` — Client：`settings.section` 设置页
- `cordis.patch.yml` — 插入 `persona` 行与配置种子
- `package.json` — bundle + client 清单
- `locale/{zh,en}.json` — Plugin Manager / Settings 的标题与说明
- `icon.svg` — 面具图标
- `LICENSE` — MIT
- `test/` — host / client / bundle 自检（不发布到 npm）
- `.gitignore` — 忽略 `dist/` 与 `node_modules/`
