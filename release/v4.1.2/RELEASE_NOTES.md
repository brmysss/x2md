# X2MD v4.1.2

X2MD 4.1.2 修复 X 新文章包含已保存引用内容时，被错误判断为已存在而跳过保存的问题。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复与优化

- 保存 X 文章时，始终以当前页面的主文章 URL 作为去重键，不再误用正文内引用推文的 URL。
- 引用内容仍会保留在生成的 Markdown 中，但不会参与当前文章的重复判断。
- 修复 X 详情页引用推文、回复和翻译展开场景中的来源边界问题。

## 升级说明

- App 与 Chrome 扩展建议同时升级到 4.1.2。
- macOS 本地备用构建为 Electrobun ad-hoc 签名版本，未经过 Apple 公证。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 4.1.1 Windows Beta 构建；本次修复位于扩展采集层）
