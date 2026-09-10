# AInalised Reading

一个会根据读者反馈持续调整讲法、阅读题和阅读路径的名著阅读实验。

## 在线体验

**公开网站：[知己读书](https://zhiji-reading.li-siye-0123.workers.dev/)**

这是一个共享平台，任何人打开链接即可浏览；个人书架、云端阅读画像等功能只需要登录自己的账号（通过邮箱/匿名 reader_id 即可），不需要每个人去注册 Cloudflare 或部署自己的站点。

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

> 以下步骤只需要维护者执行一次，普通读者直接访问上面的公开网站即可。

1. 确保 `wrangler.cloudflare.jsonc` 中的 D1 数据库绑定已创建（本项目已移除 R2，完全使用 Cloudflare 免费套餐）。
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
   npx wrangler secret put AGNES_API_KEY --config wrangler.jsonc
   npx wrangler deploy --config wrangler.jsonc
   ```
5. 把 Workers 给出的 `*.workers.dev` 地址填回 `ai-worker/src/index.ts` 的 `ALLOWED_ORIGINS` 并重新部署。
