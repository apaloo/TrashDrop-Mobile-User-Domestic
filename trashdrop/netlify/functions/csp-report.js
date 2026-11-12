// Netlify Function: csp-report
//
// Browsers send a report here when a page breaks its Content Security Policy
// (TD57). The household app and admin site send their policies as
// Content-Security-Policy-Report-Only first: nothing is blocked, the reports
// show which hosts the policy is still missing before it is enforced.
//
//   POST /.netlify/functions/csp-report
//   (application/csp-report from report-uri, or application/reports+json)
//
// Each accepted report is written to the function log as one JSON line:
// site, directive, blocked host and source file host. Hosts only: full URLs
// can carry personal data (search terms, ids). Reports about other sites,
// bodies over 16 KB and anything that isn't a report are dropped. Nothing is
// stored; read the log in Netlify (Logs → Functions → csp-report).

const MAX_BYTES = 16 * 1024;
const OUR_SITES = new Set([
  'https://app.trashdrops.com',
  'https://trashdrops.com',
  'https://www.trashdrops.com',
  'https://collector.trashdrops.com',
]);

const host = (value) => {
  if (!value) return null;
  if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/i.test(value)) return value.toLowerCase();
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'wss:' ? `${u.protocol}//${u.host}` : u.protocol.replace(':', '');
  } catch {
    return null;
  }
};

const origin = (value) => {
  try { return new URL(value).origin; } catch { return null; }
};

// One report (either format) -> the fields we log, or null to drop it
function summarise(report) {
  if (!report || typeof report !== 'object') return null;
  const body = report['csp-report'] || (report.type === 'csp-violation' ? report.body : null);
  if (!body || typeof body !== 'object') return null;
  const site = origin(body['document-uri'] || body.documentURL || report.url);
  if (!site || !OUR_SITES.has(site)) return null;
  const directive = String(body['effective-directive'] || body.effectiveDirective || body['violated-directive'] || body.violatedDirective || '').split(' ')[0].slice(0, 40);
  if (!directive) return null;
  return {
    site,
    directive,
    blocked: host(body['blocked-uri'] || body.blockedURL) || 'unknown',
    source: host(body['source-file'] || body.sourceFile),
    disposition: body.disposition || 'report',
  };
}

exports.summarise = summarise;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  if (raw.length > MAX_BYTES) return { statusCode: 413, body: '' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { statusCode: 400, body: '' }; }
  const reports = Array.isArray(parsed) ? parsed.slice(0, 20) : [parsed];
  for (const r of reports) {
    const s = summarise(r);
    if (s) console.log(JSON.stringify({ csp: s }));
  }
  // Browsers ignore the answer; 204 keeps it small
  return { statusCode: 204, body: '' };
};
