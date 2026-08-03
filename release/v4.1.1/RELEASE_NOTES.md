# X2MD v4.1.1

X2MD 4.1.1 修复 X 推文和文章保存时的 HTML 实体格式错误，并收紧发行资产。

> 本次 macOS 资产因 GitHub 环境缺少 Developer ID 与公证凭据，采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 修复与优化

- 修复 GraphQL 推文正文中的 `&gt;`、`&lt;`、`&amp;`、引号和数字实体被原样写入 Markdown 的问题。
- 同步修复线程、引用推文、转推、作者名、oEmbed 与 X 长文章标题/正文/代码块中的同类实体问题。
- 实体只解码一层，避免把用户原本输入的实体文本二次转换。
- 已删除本地 Markdown 时，重新保存不再被历史去重索引错误跳过。
- 修复 X 详情页带引用推文时误用引用来源、并混入无关同作者回复的问题。
- 修复 X 正文翻译后的行内超链接被拆到下一行，以及链接目标在翻译替换中丢失的问题。
- 发行版不再生成或上传 `SHA256SUMS.txt` 与 `update.json`。

## 升级说明

- App 与 Chrome 扩展建议同时升级到 4.1.1。
- macOS 本地备用构建为 Electrobun ad-hoc 签名版本，未经过 Apple 公证。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`
