export async function readAPIResponse(response, path) {
 const stage = path.includes('/analyze') ? '生辰解读' : /\/jobs\/.+\/image/.test(path) ? '画面生成' : '服务';
 let data;
 try { data = await response.json(); }
 catch {
  const timeout = [408, 504, 524].includes(response.status);
  const error = new Error(timeout ? stage + '请求超时，请稍后继续；无需修改后端地址。' : stage + '暂时未返回有效结果（HTTP ' + response.status + '），请稍后重试。');
  error.status = response.status;
  error.code = timeout ? 'gateway_timeout' : 'invalid_api_response';
  throw error;
 }
 if (!response.ok) {
  const error = new Error(data?.error || stage + '请求未完成，请稍后重试。');
  error.status = response.status;
  error.code = data?.code;
  throw error;
 }
 if (!data || typeof data !== 'object' || Array.isArray(data)) {
  const error = new Error(stage + '返回的数据格式异常，请稍后重试。');
  error.code = 'invalid_api_response';
  throw error;
 }
 return data;
}
