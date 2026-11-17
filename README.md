# abasthan-vless-ws

VLESS + WebSocket 代理，部署在 Abasthan 免费版（Node.js buildpack，512MB）。

## 原理
- Abasthan 免费版 Web Service 只提供 Node.js/Python/PHP/Static 构建包，无 Docker 入口。
- 本项目用 Node.js 构建阶段通过内置 https + zlib 下载并解压 Xray-core 二进制（无需 curl/unzip）。
- 运行阶段渲染配置并前台启动 Xray，监听平台注入的 `PORT`，TLS 由平台边缘终止。

## 部署
Abasthan Dashboard → Create App → Web Service → Public Git Repository:
`https://github.com/wzym1234/abasthan-vless-ws`

- Branch: `main`
- App Language: `Node.js`，版本 `22 (default)`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Instance: `Free`
- 环境变量: `XRAY_UUID=dcf87311-146f-462c-adbe-dd6bdb0cd94b`（可替换为自定义 UUID）

## 客户端
- 协议: VLESS
- 地址: `<app>.abasthan.app`
- 端口: `443`
- UUID: `dcf87311-146f-462c-adbe-dd6bdb0cd94b`
- 传输: WebSocket，路径 `/dcf87311-ws`
- TLS: 开启（sni 填地址，允许不安全置顶按需）
