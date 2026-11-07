// Đồng bộ đám mây miễn phí qua GitHub Gist bí mật (secret gist).
// Cần Personal Access Token có quyền "Gists: Read and write".
const API = 'https://api.github.com/gists';
const FILE = 'timesheet.json';
const headers = (t) => ({
  Authorization: `Bearer ${t}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
});

export async function pull(cfg) {
  const r = await fetch(`${API}/${cfg.gistId}`, { headers: headers(cfg.token), cache: 'no-store' });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  const f = j.files?.[FILE];
  if (!f) return null;
  const content = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  return JSON.parse(content);
}

/** Tạo mới (nếu chưa có gistId) hoặc cập nhật gist. Trả về gistId. */
export async function push(cfg, data) {
  const body = { description: 'Timesheet PWA – backup', files: { [FILE]: { content: JSON.stringify(data) } } };
  if (!cfg.gistId) body.public = false;
  const r = await fetch(cfg.gistId ? `${API}/${cfg.gistId}` : API, {
    method: cfg.gistId ? 'PATCH' : 'POST',
    headers: headers(cfg.token),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return (await r.json()).id;
}
