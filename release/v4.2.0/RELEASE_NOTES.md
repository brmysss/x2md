# X2MD v4.2.0

X2MD 4.2.0 新增 X/Twitter 桌面宽屏阅读模式。

> 本次 macOS 资产采用已通过本地发行烟测的 Electrobun ad-hoc 签名备用构建；该资产未使用 Developer ID 签名，也未经过 Apple 公证。

## 新增

- 在桌面宽屏下隐藏 X 右侧搜索、直播、趋势和推荐侧栏。
- 将主时间线从原生 600px 扩展到最高 1050px，利用释放出的页面空间。
- 将包含四张图片的横向媒体轮播改为完整四列布局，四张图片无需横向滚动即可同时看到。
- 低于 1200px 的窗口保持 X 原生响应式布局。

## 验证

- 1504px 宽真实 X 首页中，主时间线实测 1050px。
- 四图推文实测每张约 235px，四张完整排列在同一行。

## 发行产物

- `X2MD_Mac.zip`（arm64，ad-hoc 签名，未公证）
- `X2MD_Extension.zip`
- `X2MD_Windows_Beta.zip`（沿用 v4.1.9 Windows Beta 构建）
