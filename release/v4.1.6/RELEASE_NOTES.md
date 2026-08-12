# X2MD v4.1.6

X2MD 4.1.6 修复后台接口补全再次覆盖页面正文、导致 X Article 引用推文被移到文末的问题。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复

- 当页面正文已包含原位引用块时，不再使用缺少引用卡片的 GraphQL 正文整段覆盖。
- 仍保留接口返回的媒体、发布时间和缺失代码块补全。
- 新增后台 enrichment 回归测试，覆盖“接口正文更长但缺少原位引用”的真实失败路径。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 4.1.1 Windows Beta 构建；本次修复位于扩展后台补全链路）
