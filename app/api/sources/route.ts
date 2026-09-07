import { searchSources } from '../../../ai-worker/src/sources';
export async function GET(request: Request) { const q = new URL(request.url).searchParams.get('q')?.trim(); if (!q) return Response.json({ results: [] }); try { return Response.json({ results: await searchSources(q) }); } catch { return Response.json({ error: '来源服务暂时无法连接，请重试', results: [] }, { status: 502 }); } }
