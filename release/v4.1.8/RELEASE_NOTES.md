# X2MD v4.1.8

X2MD 4.1.8 修复 X Article 内嵌推文虽然识别到接口位置、但仍被追加到文末的问题。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复

- 按 Article `content_state.entityMap` 中每个 `TWEET.tweetId` 单独获取引用推文，而不再误用母推的 `quoted_status_result`。
- 将获取到的推文文字、图片和原文地址替换到对应 atomic block 的原始位置。
- 同步覆盖文章保存、复制和个人主页批量文章链路，避免内部占位符泄露。
- 引用接口临时不可用时在原位置保留可点击链接，并继续优先保留 DOM 中的完整引用。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 v4.1.7 Windows Beta 构建；本次修复位于浏览器扩展）
