import { deserializeWithMode, serializeWithMode } from '../server/serialization';
import type { StackSerializationMode } from '../server/types';
import { VistaClientError } from './error';
import type {
  AppRouterLike,
  ClientRoutes,
  CreateVistaClientOptions,
  GetRoutePath,
  OptionalInputArg,
  PostRoutePath,
  RouteInput,
  RouteOutput,
  RoutePath,
  VistaClient,
  VistaFetch,
} from './types';

function resolveFetchImpl(fetchImpl?: VistaFetch): VistaFetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== 'function') {
    throw new Error(
      'Global fetch is not available. Provide a fetch implementation via createVistaClient({ fetch }).'
    );
  }

  return fetch;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    return '';
  }
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function toQueryParams(input: unknown, serialization: StackSerializationMode): URLSearchParams {
  const params = new URLSearchParams();
  if (input === undefined || input === null) {
    return params;
  }

  const serializedInput = serializeWithMode(input, serialization);

  if (
    typeof serializedInput !== 'object' ||
    serializedInput === null ||
    Array.isArray(serializedInput)
  ) {
    params.set('input', String(serializedInput));
    return params;
  }

  for (const [key, value] of Object.entries(serializedInput as Record<string, unknown>)) {
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      params.set(key, 'null');
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, typeof entry === 'object' ? JSON.stringify(entry) : String(entry));
      }
      continue;
    }

    if (typeof value === 'object') {
      params.set(key, JSON.stringify(value));
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

async function resolveHeaders(
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
): Promise<Headers> {
  if (!headers) {
    return new Headers();
  }

  const value = typeof headers === 'function' ? await headers() : headers;
  return new Headers(value);
}

async function parseErrorResponse(response: Response): Promise<{ message: string; details?: unknown }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      const message =
        (json && typeof json.error === 'string' && json.error) ||
        (json && typeof json.message === 'string' && json.message) ||
        response.statusText ||
        `Request failed with status ${response.status}`;
      return { message, details: json };
    } catch {
      // Fall through to text parsing.
    }
  }

  try {
    const text = await response.text();
    if (text) {
      return { message: text };
    }
  } catch {
    // ignore
  }

  return {
    message: response.statusText || `Request failed with status ${response.status}`,
  };
}

async function parseSuccessResponse(
  response: Response,
  serialization: StackSerializationMode
): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response.text();
  }

  const json = await response.json();
  return deserializeWithMode(json, serialization);
}

function buildRequestUrl(baseUrl: string, path: string, query?: URLSearchParams): string {
  const normalizedPath = normalizePath(path);
  const rawUrl = baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
  const queryString = query?.toString();
  if (!queryString) {
    return rawUrl;
  }
  return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}${queryString}`;
}

async function requestRoute<TOutput>(options: {
  fetchImpl: VistaFetch;
  method: 'GET' | 'POST';
  baseUrl: string;
  path: string;
  input: unknown;
  serialization: StackSerializationMode;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}): Promise<TOutput> {
  const requestHeaders = await resolveHeaders(options.headers);
  const normalizedPath = normalizePath(options.path);

  let url = buildRequestUrl(options.baseUrl, normalizedPath);
  const requestInit: RequestInit = {
    method: options.method,
    headers: requestHeaders,
  };

  if (options.method === 'GET') {
    const query = toQueryParams(options.input, options.serialization);
    url = buildRequestUrl(options.baseUrl, normalizedPath, query);
  } else {
    if (!requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }
    // Skip body serialization for inputless calls. serializeWithMode(undefined)
    // runs JSON.parse(JSON.stringify(undefined)) -> JSON.parse("undefined"),
    // which throws before the request is even sent. Explicit null still
    // serializes to "null" and normal payloads are unaffected.
    if (options.input !== undefined) {
      requestInit.body = JSON.stringify(serializeWithMode(options.input, options.serialization));
    }
  }

  const response = await options.fetchImpl(url, requestInit);

  if (!response.ok) {
    const parsedError = await parseErrorResponse(response);
    throw new VistaClientError({
      status: response.status,
      message: parsedError.message,
      path: normalizedPath,
      method: options.method,
      url,
      response,
      details: parsedError.details,
    });
  }

  return (await parseSuccessResponse(response, options.serialization)) as TOutput;
}

function assertPath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new Error('Route path must be a non-empty string.');
  }
}

export function createVistaClient<TAppRouter extends AppRouterLike, TRoutes = ClientRoutes<TAppRouter>>(
  options: CreateVistaClientOptions = {}
): VistaClient<TRoutes> {
  const fetchImpl = resolveFetchImpl(options.fetch);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const serialization = options.serialization ?? 'json';

  function $url<TPath extends RoutePath<TRoutes> & string>(
    path: TPath,
    ...args: OptionalInputArg<RouteInput<TRoutes, TPath>>
  ): string {
    const routePath = String(path);
    assertPath(routePath);
    const query = toQueryParams(args[0], serialization);
    return buildRequestUrl(baseUrl, routePath, query);
  }

  async function $get<TPath extends GetRoutePath<TRoutes> & string>(
    path: TPath,
    ...args: OptionalInputArg<RouteInput<TRoutes, TPath>>
  ): Promise<RouteOutput<TRoutes, TPath>> {
    const routePath = String(path);
    assertPath(routePath);
    return requestRoute<RouteOutput<TRoutes, TPath>>({
      fetchImpl,
      method: 'GET',
      baseUrl,
      path: routePath,
      input: args[0],
      serialization,
      headers: options.headers,
    });
  }

  async function $post<TPath extends PostRoutePath<TRoutes> & string>(
    path: TPath,
    ...args: OptionalInputArg<RouteInput<TRoutes, TPath>>
  ): Promise<RouteOutput<TRoutes, TPath>> {
    const routePath = String(path);
    assertPath(routePath);
    return requestRoute<RouteOutput<TRoutes, TPath>>({
      fetchImpl,
      method: 'POST',
      baseUrl,
      path: routePath,
      input: args[0],
      serialization,
      headers: options.headers,
    });
  }

  return {
    $url,
    $get,
    $post,
  };
}
