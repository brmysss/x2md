# X2MD v4.1.7

X2MD 4.1.7 按 X Article GraphQL 接口的正文 block 顺序精确插入引用推文。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复

- 解析 Article `content_state.entityMap` 中的 `TWEET` 实体。
- 在引用该实体的 atomic block 原始位置生成引用块，不再依赖 DOM 推断或追加到文末。
- 使用已捕获的推文文字、媒体和原文地址填充接口实体。
- 新增接口级回归测试，覆盖引用前文、TWEET atomic block、引用后文的精确顺序。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 4.1.1 Windows Beta 构建；本次修复位于扩展 GraphQL Article 解析链路）
