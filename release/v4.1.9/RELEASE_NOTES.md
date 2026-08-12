# X2MD v4.1.9

X2MD 4.1.9 优化普通单条推文的多图 Markdown 排版。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 新增

- 普通单条推文包含两张及以上图片时，使用 HTML flex 图片组在同一行展示。
- 根据图片数量平均分配最大宽度，保留原始顺序和图片 ALT。
- 单图推文、X Article 正文图片、引用推文图片及 Obsidian 本地嵌入继续使用原格式。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 v4.1.8 Windows Beta 构建）
