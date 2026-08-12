# X2MD v4.1.4

X2MD 4.1.4 修复 X Article 正文内引用推文的位置，并允许用户主动再次保存重复内容。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复

- 识别 X Article 阅读视图内真实的嵌套推文卡片，并在 Markdown 中保留其正文原始位置。
- 内容已存在时显示“再次保存”按钮；点击后使用 `always_new` 策略生成新文件，不再强制阻止保存。
- “再次保存”请求继续沿用当前捕获内容和保存目录，只在本次操作中覆盖去重策略。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 4.1.1 Windows Beta 构建；本次修复位于扩展采集与请求链路）
