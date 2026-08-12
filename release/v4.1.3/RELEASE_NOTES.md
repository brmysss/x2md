# X2MD v4.1.3

X2MD 4.1.3 修复 X Article 阅读视图嵌套在状态推文中时，错误使用正文内引用推文 URL 去重的问题。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复

- 识别 X 的真实嵌套结构：外层状态推文包含内层 `twitterArticleReadView`。
- 点击内层文章工具栏的保存按钮时，仍以外层当前状态 URL 作为文章来源和去重键。
- 正文内引用推文继续正常保留，不再导致当前文章被误报“已存在”。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 4.1.1 Windows Beta 构建；本次修复位于扩展采集层）
