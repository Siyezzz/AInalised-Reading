# AInalised Reading

一个会根据读者反馈持续调整讲法、阅读题和阅读路径的名著阅读实验。

## 在线体验

**公开网站：[知己读书](https://zhiji-reading.your-account.workers.dev/)**

（把 `your-account` 替换为部署后 Cloudflare 提供的真实子域名。任何拿到这个链接的人都可以浏览网站。个人书架、PDF 导入和云端阅读画像需要登录。）

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 部署到 Cloudflare Workers（免费域名）

1. 确保 `wrangler.cloudflare.jsonc` 中的 D1 和 R2 绑定已创建。
2. 设置 Agnes API Key：
   ```bash
   npx wrangler secret put AGNES_API_KEY --config wrangler.cloudflare.jsonc
   ```
3. 部署主站：
   ```bash
   npm run build
   npx wrangler deploy --config wrangler.cloudflare.jsonc
   ```
4. 部署 AI Worker：
   ```bash
   cd ai-worker
   npx wrangler deploy --config wrangler.jsonc
   npx wrangler secret put AGNES_API_KEY --config wrangler.jsonc
   ```
5. 把 Workers 给出的 `*.workers.dev` 地址填回 `ai-worker/src/index.ts` 的 `ALLOWED_ORIGINS` 并重新部署。
