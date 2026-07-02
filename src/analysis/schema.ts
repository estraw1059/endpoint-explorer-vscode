/** JSON Schema for the analysis result — used for structured outputs (API) and prompt guidance (CLI). */
export const ENDPOINTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['endpoints'],
  properties: {
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'method',
          'path',
          'description',
          'sourceFile',
          'authRequired',
          'pathParams',
          'queryParams',
          'headers',
          'requestBody',
        ],
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
          },
          path: { type: 'string', description: 'Route path, e.g. /api/users/{id}' },
          description: { type: 'string', description: 'One sentence: what this endpoint does' },
          sourceFile: { type: 'string', description: 'Repo-relative file where the route is defined' },
          authRequired: { type: 'boolean' },
          pathParams: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'example', 'description'],
              properties: {
                name: { type: 'string' },
                example: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          queryParams: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'example', 'description', 'required'],
              properties: {
                name: { type: 'string' },
                example: { type: 'string' },
                description: { type: 'string' },
                required: { type: 'boolean' },
              },
            },
          },
          headers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'value', 'description'],
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          requestBody: {
            type: ['string', 'null'],
            description: 'Example request body as a JSON string, or null if the endpoint takes no body',
          },
        },
      },
    },
  },
} as const;

export const ANALYSIS_INSTRUCTIONS = `Find every HTTP API endpoint this repository DEFINES (server-side routes it serves — not outbound calls it makes to other services).

For each endpoint report:
- method and path (use {param} syntax for path parameters, and include any router prefix so the path is the full mount path)
- a one-sentence description
- the repo-relative source file where the route is defined
- whether auth middleware/guards protect it (authRequired)
- path parameters with realistic example values
- query parameters it reads, with example values and whether they are required
- headers a caller should send (e.g. Content-Type: application/json for JSON bodies). Do NOT include Authorization-type headers here — auth is configured separately.
- a realistic example request body as a JSON string (pretty-printed), or null for endpoints with no body

Be exhaustive — include every route you can find, including ones registered dynamically or via decorators.`;
