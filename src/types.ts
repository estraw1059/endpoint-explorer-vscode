export interface ParamInfo {
  name: string;
  example: string;
  description: string;
}

export interface QueryParamInfo extends ParamInfo {
  required: boolean;
}

export interface HeaderInfo {
  name: string;
  value: string;
  description: string;
}

export interface EndpointInfo {
  method: string;
  path: string;
  description: string;
  sourceFile: string;
  authRequired: boolean;
  pathParams: ParamInfo[];
  queryParams: QueryParamInfo[];
  headers: HeaderInfo[];
  /** Example request body as a JSON string, or null when the endpoint takes no body. */
  requestBody: string | null;
}

export interface AnalysisResult {
  endpoints: EndpointInfo[];
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apiKey';

export interface AuthConfig {
  type: AuthType;
  baseUrl: string;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyHeader: string;
  apiKeyValue: string;
}

export const DEFAULT_AUTH: AuthConfig = {
  type: 'none',
  baseUrl: 'http://localhost:3000',
  bearerToken: '',
  basicUser: '',
  basicPass: '',
  apiKeyHeader: 'X-API-Key',
  apiKeyValue: '',
};

/** The request state as edited in the panel — what gets saved as a template. */
export interface RequestState {
  method: string;
  url: string;
  pathParams: ParamInfo[];
  queryParams: { name: string; value: string; enabled: boolean }[];
  headers: { name: string; value: string; enabled: boolean }[];
  body: string;
  description: string;
}

export interface SavedTemplate {
  name: string;
  savedAt: string;
  request: RequestState;
}
