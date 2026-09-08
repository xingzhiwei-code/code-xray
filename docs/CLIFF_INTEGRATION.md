# cliff 接入考察与 T002 执行说明

考察日期：2026-09-08。范围：通过 GitHub 读取仓库、清单、导出、命令执行、配置、解析器、UI 与测试工具源码；**未安装、未构建、未运行，未核实 npm tarball**。以下“已核实”仅代表读取到的代码/元数据事实。

## 1. 固定来源与已核实事实

考察基线为 `master` 当时指向的 commit `0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c`。后续实现固定 commit 或经核实的精确发布版本，不跟随移动分支。[固定 commit](https://github.com/xingzhiwei-code/cliff/commit/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c)

| 观察 | 证据来源 | 对 Code X-Ray 的含义 |
|---|---|---|
| 包名为 `@cliffx/core`、`@cliffx/ui`、`@cliffx/test`，清单版本均为 `0.0.1` | [core 清单](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/package.json)、[ui 清单](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/ui/package.json)、[test 清单](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/test/package.json) | 使用已核实的 `@cliffx/*`，不沿用旧对话可能出现的 `@cliff/*`；清单版本不证明 npm 已发布 |
| 根项目声明 Node `>=20`、pnpm `10.33.0`，使用 TypeScript、Vitest、Biome | [根清单](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/package.json) | 适合 TypeScript CLI 的候选基础；兼容性仍需在 Code X-Ray 选定运行时实测 |
| core 导出 `defineCommand`、`createCli`、`parseArgs`、help/config/plugin/completion 等能力 | [导出入口](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/index.ts) | 复用命令基础设施；无需自行重写 CLI 框架 |
| `RunContext` 包含 `options / ui / config / args / cli`；`Cli.register()` 接受 command definition | [类型](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/types.ts)、[Cli 实现](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/cli.ts) | 命令回调负责输入校验→调用 facade→呈现；显式注册随产品发布的命令 |
| UI 有日志、表格、交互输入、spinner 等接口；`stdout()` 写 stdout，常用状态日志写 stderr | [Ui 类型](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/ui/src/types.ts)、[输出实现](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/ui/src/output.ts) | 可构建渐进展开的终端体验，但所有组件的管道/TTY/中文表现仍需实测 |
| 测试工具 `createTestApp` 捕获 stdout/stderr/exitCode，并临时替换进程全局函数 | [测试工具实现](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/test/src/index.ts) | 复用 CLI 行为测试；涉及全局替换的测试串行执行，另做真实子进程验证 |
| README 与三个包清单声明 MIT；完整树检索未发现 LICENSE/COPYING 文件 | [README](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/README.md)、[固定树](https://github.com/xingzhiwei-code/cliff/tree/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c) | 将许可全文、版权声明与发布包内容列为分发材料核查项；不能把 README 一行当作已完成分发审查 |

辅助元数据：当日[仓库 API](https://api.github.com/repos/xingzhiwei-code/cliff) 返回 `license: null`；[releases 列表](https://api.github.com/repos/xingzhiwei-code/cliff/releases?per_page=10) 返回空列表。这些是查询时点的结果，不表示不存在 npm 发布，也不否定源码中的 MIT 声明。最终安装来源与许可材料以 T002 实际取得的内容为准。

## 2. 已发现的接入约束

这些是源码观察与由此提出的验证要求，不是已经执行的缺陷复现。

| 源码行为 | 接入策略 / 必须验证 |
|---|---|
| `Cli.run()` 在有 version 时调用更新检查；检查请求 npm registry | 默认零外发必须覆盖此路径。起始方案：不向 cliff 传 version，CLI 外壳处理自身 `--version`，不调用更新 API；若体验需要，采用有记录的通用基础设施补丁添加默认关闭的开关。不能只靠断网后吞错误。[Cli](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/cli.ts)、[update](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/update.ts) |
| command/plugin discovery 动态 import 文件 | 只显式注册安装包内的可信命令；不以被分析仓库为 discovery 根目录，不扫描其 plugins 目录。fixture 放置带副作用模块，证明扫描不会执行。[Cli](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/cli.ts)、[plugin](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/plugin.ts) |
| 配置读取候选包括 cwd、父目录与 home；`.config.js` 实际跳过执行；YAML/TOML 解析是有限平面解析 | Code X-Ray 使用自己明确、受限且经 schema 校验的有效配置；安全范围/provider 授权不能直接信任 `RunContext.config`。v0.1 配置优先选 JSON，不宣称支持复杂 YAML/TOML。需要扩展时添加小范围、通用的配置注入接口。[config](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/config.ts) |
| options 合并以“解析值是否不同于默认值”判断 CLI 是否显式覆盖 | 测试显式输入恰好等于默认值、`--no-*` 与 env/config 冲突。隐私开关、范围和 provider 选择必须基于显式来源解析，`--offline` 必须胜出；不要把该合并方式当作已满足产品优先级。[config](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/config.ts) |
| `parseArgs` 遇到未识别选项没有显式抛错分支；位置参数 helper 未在 core 公共入口导出 | T002 实测未知参数、缺值、`--`、带空格路径和位置参数。Code X-Ray 入口需要明确参数验证；可用小型校验适配层/通用上游补丁，不能让错拼静默扩大分析范围。[parser](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/parser.ts)、[exports](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/index.ts) |
| 错误路径使用 `process.exit(1)` | 仅 CLI composition root 可以终止进程；Engine 返回类型化错误。T002 验证 JSON 错误包、资源清理和取消，不将 cliff 对退出码的默认行为当作 PRD 契约已实现。[Cli](https://github.com/xingzhiwei-code/cliff/blob/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c/packages/core/src/cli.ts) |

不在本次启动包里修改 cliff，不向上游提交变更。后续若确需补丁，应保留 base SHA、最小 patch、测试与 Decision；修复只涉及通用 CLI infrastructure，不向 cliff 加入 Code X-Ray 的规则/学习/债务领域逻辑。

## 3. 复用边界

```text
cliff command / parser / UI
           ↓
Code X-Ray CLI adapter + presenter
           ↓
Protocol / Engine facade
           ↓
analysis / evidence / learning / debt
```

CLI adapter 负责参数、有效配置、TTY、输出格式、取消信号与退出码。Presenter 控制默认摘要、证据展开、解释与学习入口，避免把一大段 LLM 文本直接倒入终端。Engine 返回结构化结果，不接收 cliff 的 ui/config/cli 对象。

复用表格、spinner、提示与测试工具不意味着每项都必须启用。非 TTY / `--format json` 下不显示 spinner、不弹提示、不等待键盘。高级感以信息层次、短路径、稳定布局和清晰错误体现，视觉效果以 [PRD](PRD.md) 的 AC07 验收。

## 4. T002 的最小 spike

1. **固定来源**：记录选定 commit、包名/版本、运行时、包管理器版本、lockfile 与实际获取的制品摘要。检查 npm 上同名包的 repository/provenance/内容；未经核实不执行 README 的 `npx create-cli` 指令。
2. **选择安装方式**：若存在经核实的发布包，固定精确版本；否则从固定 upstream checkout 构建并为 `core/ui/test` 生成本地 tarball，验证跨包依赖不残留无法解析的 `workspace:*`。不要假定可直接把 monorepo Git URL 当作单包安装。
3. **最小命令**：用 cliff 注册 `scan` 与 `doctor`，调用返回固定 fixture 的 fake facade，覆盖路径输入、help、未知参数、异常、取消、JSON 输出；假 facade 仅用于接入测试，不能充当产品实现。
4. **隐私与宿主**：联网拦截下执行 version/help/scan/test harness；验证没有 registry 更新请求。放置恶意 discovery fixture 与父目录配置，验证不会执行其代码、扩大 scope 或启用 provider。
5. **运行验证**：包构建后从临时空目录运行真实 CLI，测试 TTY/非 TTY、无色、窄窗口、中文路径/文件名、Ctrl-C 与 stdout/stderr 分离；至少在首发支持系统上保存证据，其他系统明确标未验证。
6. **记录结果**：将来源、检查命令、实际退出码、日志/截图、已验证限制登记到 [EVIDENCE](state/EVIDENCE.md)，将安装/补丁决定写入 [DECISIONS](state/DECISIONS.md)，更新 [BACKLOG](state/BACKLOG.md) 的 T002。

T002 完成标准：可复现安装及构建、真实命令通过上述验证、有明确制品与许可材料状态、零默认外发、cliff 依赖仅出现在 CLI 及 CLI 测试层。若安装或分发材料仍不完整，标记具体子项 blocked；T003 Protocol、T004 workspace/privacy、T005 analyzer 可继续通过 fake CLI adapter 开发。v0.1 最终交付仍须真实复用 cliff，不能静默换框架或把接入 spike 宣称为完成产品。

## 5. 后续变更

更换 cliff 版本或补丁后，重跑受影响的 CLI 及隐私契约，并更新固定来源。不得因为一个上游更新声明修复问题就直接复用旧证据；证据必须对应本次实际运行的制品。整个过程遵守 [Loop Engineering 协议](LOOP_PROTOCOL.md) 与 [接力规范](HANDOFF_PROTOCOL.md)。
