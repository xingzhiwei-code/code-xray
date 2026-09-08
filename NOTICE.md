# NOTICE

Code X-Ray 0.1.0 · 2026-09-08

## Vendored components

### cliff（@cliffx/core、@cliffx/ui、@cliffx/test）— MIT

- 来源：npm registry `@cliffx/*@0.0.1`（repository: github.com/xingzhiwei-code/cliff）。
- 以 `vendor/cliffx-*` 形式引入：发布的 tarball 携带 `workspace:*` 协议依赖不可直接安装（npm EUNSUPPORTEDPROTOCOL），已重写为本地 `file:` 链接；并施加 4 点通用嵌入补丁（更新检查默认关闭、错误重抛、禁用隐式配置发现、依赖协议重写）。补丁全文与溯源见 [vendor/VENDOR_PATCH.md](vendor/VENDOR_PATCH.md)。
- 许可依据：上游 README 与三个包清单声明 MIT。**注意：tarball 内未包含独立 LICENSE 全文文件**；分发前需在上游仓库确认许可全文并补充归档（见 docs/state 的 T010 待办）。
- cliff 仅用于 CLI 表面（命令注册/解析）；领域逻辑不进入 cliff，cliff 类型不进入领域协议。

## 运行时依赖

| 包 | 版本 | 许可（依据 package.json 声明） |
|---|---|---|
| ajv | 8.20.0 | MIT |
| ignore | 7.0.8 | MIT |
| java-parser | 3.0.1 | Apache-2.0 |

## 开发依赖（不分发进运行时）

esbuild（MIT）、tsx（MIT）、typescript（Apache-2.0）、vitest（MIT）、@types/node（MIT）。

## 本产品

Code X-Ray 自身代码与文档随仓库分发；开发进度状态与证据见 docs/state/。
