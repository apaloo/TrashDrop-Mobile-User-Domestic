// Reads production logs through the Supabase Management API (the same
// ClickHouse SQL as the Logs Explorer and the MCP query_logs tool). The
// range may be 24 hours at most. Needs a personal access token
// (SUPABASE_ACCESS_TOKEN) and the project ref.
//
// Returns { rows } or { error }; never throws for an HTTP or API error, so
// a watch can report "could not be read" and carry on.
export async function queryLogs(token, ref, sql, hours = 24) {
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(hours, 24) * 3600e3);
  const qs = new URLSearchParams({ sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() });
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?${qs}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json();
    if (body.error) return { error: typeof body.error === 'string' ? body.error : JSON.stringify(body.error).slice(0, 200) };
    return { rows: body.result ?? [] };
  } catch (e) {
    return { error: e.message };
  }
}
