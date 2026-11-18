const MAX_PAGE_BYTES = 6 * 1024 * 1024;

async function publicPatchPage(resourceId) {
  if (!/^\d{1,20}$/.test(String(resourceId))) throw new Error('无效的 Moyu 资源编号');
  const response = await fetch('https://www.moyu.moe/resource/' + resourceId, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {Accept: 'text/html'}
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('官网资源页暂时无法读取');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_PAGE_BYTES) throw new Error('官网资源页过大，请在浏览器打开');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
module.exports = {publicPatchPage};
