import { AnalysisResult, EndpointInfo } from '../types';

/** Parse model output into an AnalysisResult, tolerating markdown fences and surrounding prose. */
export function parseAnalysisJson(raw: string): AnalysisResult {
  const candidates: string[] = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    candidates.unshift(fenced[1].trim());
  }
  // Last resort: first { … last }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.endpoints)) {
        return { endpoints: parsed.endpoints.map(normalizeEndpoint) };
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not parse endpoint JSON from Claude output.');
}

function normalizeEndpoint(e: Partial<EndpointInfo>): EndpointInfo {
  return {
    method: (e.method || 'GET').toUpperCase(),
    path: e.path || '/',
    description: e.description || '',
    sourceFile: e.sourceFile || '',
    authRequired: Boolean(e.authRequired),
    pathParams: Array.isArray(e.pathParams) ? e.pathParams : [],
    queryParams: Array.isArray(e.queryParams) ? e.queryParams : [],
    headers: Array.isArray(e.headers) ? e.headers : [],
    requestBody: typeof e.requestBody === 'string' ? e.requestBody : null,
  };
}
