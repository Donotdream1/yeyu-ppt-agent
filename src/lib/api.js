export async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers:
      options.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json", ...options.headers },
  });
  const result = response.headers.get('content-type')?.includes('json')?await response.json():{error:'请求失败（HTTP '+response.status+'）'};
  if(response.status===401&&result.loginRequired)window.dispatchEvent(new Event('yeyu-auth-expired'));
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}
export const post = (url, body) =>
  api(url, { method: "POST", body: JSON.stringify(body) });
