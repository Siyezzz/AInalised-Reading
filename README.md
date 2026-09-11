# AInalised Reading

一个会根据读者反馈持续调整讲法、阅读题和阅读路径的名著阅读实验。

## 在线体验

**公开网站：[知己读书](https://zhiji-reading.li-siye-0123.workers.dev/)**

这是共享平台，任何人打开链接即可浏览。书架、阅读画像和已生成的章节存在 Cloudflare D1 里，归到读者自己的身份下：

- 没登录时用浏览器匿名 cookie（`reader_id`，一年有效），换浏览器或清 cookie 就相当于新读者；
- 在 `/signin` 用邮箱注册登录后，身份跟着账号走，换设备也能接着读。登录时会把该浏览器匿名身份的书籍和章节并到账号下。

站点**不提供共用的 AI 额度**：改写章节用的是读者自己在「阅读画像」里填的 API key，key 只存在浏览器 `localStorage`，随生成请求加密发给自己的 AI Worker，不入站点的数据库。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

> 注意：`npm run build` 会在构建前清空 `dist/`。如果连续构建两次，某些沙箱环境会拦截批量删除，先把产物挪走再构建即可（`mv dist "$TEMP/zhiji-dist-old"`）。

## 部署到 Cloudflare Workers（免费域名）

> 以下步骤只需要维护者执行，普通读者直接访问上面的公开网站即可。

1. 确保 `wrangler.cloudflare.jsonc` 中的 D1 数据库绑定已创建，绑定名为 `DB`。PDF 文件导入暂时暂停，当前主流程不需要 R2。
2. 应用数据库迁移（含账号表 `users` 和会话表 `sessions`）：
   ```bash
   npx wrangler d1 migrations apply zhiji-reading-db --config wrangler.cloudflare.jsonc --remote
   ```
3. 部署主站（不再需要任何 AI secret）：
   ```bash
   npm run build
   npx wrangler deploy --config wrangler.cloudflare.jsonc
   ```
4. 部署 AI Worker：
   ```bash
   cd ai-worker
   npx wrangler deploy --config wrangler.jsonc
   ```
5. 把 Workers 给出的 `*.workers.dev` 地址填回 `ai-worker/src/index.ts` 的 `ALLOWED_ORIGINS` 并重新部署。

历史上给 AI Worker 配过 `AGNES_API_KEY`、`GROQ_API_KEY`，现在已经用不到了，可以删掉：

```bash
cd ai-worker
npx wrangler secret delete AGNES_API_KEY --config wrangler.jsonc
npx wrangler secret delete GROQ_API_KEY --config wrangler.jsonc
```

## 几个实现上的坑

- **Cloudflare Workers 的 PBKDF2 迭代次数上限是 100000**，超过会直接抛 `NotSupportedError`。密码哈希已按上限设置。
- AI Worker 只调用读者自己的 OpenAI-compatible 线路。没有 key、或调用返回 401/429 时会返回 402/429 的明确错误，**不会**再用内置占位章节冒充生成结果。
- AI Worker 前面有 Cloudflare 的机器人拦截，脚本调用它时要带浏览器 User-Agent，否则会收到 `error code: 1010`。
