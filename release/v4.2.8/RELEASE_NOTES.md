# X2MD v4.2.8

## 修复

- 修复 X 多图推文的 ALT 内容只存在于 HTML 属性、在 Markdown 正文中不可见且难以被后续工具识别的问题。
- 多图推文现在会在图片行后按图片序号显式保存 ALT 文本。
- X DOM 后备抓取新增读取 `tweetPhoto` 的 `aria-label`，降低官方接口或图片节点属性调整造成的 ALT 丢失风险。
