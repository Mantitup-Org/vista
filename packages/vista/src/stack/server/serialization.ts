import type { StackSerializationMode } from './types';

const SUPERJSON_TYPE_KEY = '__vistaSuperType';
const SUPERJSON_VALUE_KEY = 'value';

interface SuperJsonTaggedValue {
  [SUPERJSON_TYPE_KEY]: 'Date' | 'BigInt' | 'Map' | 'Set';
  [SUPERJSON_VALUE_KEY]: unknown;
}

export interface StackSerializer {
  mode: StackSerializationMode;
  serialize(value: unknown): unknown;
  deserialize(value: unknown): unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

function isTagged(value: unknown): value is SuperJsonTaggedValue {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value[SUPERJSON_TYPE_KEY] === 'string' && SUPERJSON_VALUE_KEY in value;
}

function encodeSuperJson(value: unknown): unknown {
  if (value instanceof Date) {
    return {
      [SUPERJSON_TYPE_KEY]: 'Date',
      [SUPERJSON_VALUE_KEY]: value.toISOString(),
    } satisfies SuperJsonTaggedValue;
  }

  if (typeof value === 'bigint') {
    return {
      [SUPERJSON_TYPE_KEY]: 'BigInt',
      [SUPERJSON_VALUE_KEY]: value.toString(),
    } satisfies SuperJsonTaggedValue;
  }

  if (value instanceof Map) {
    return {
      [SUPERJSON_TYPE_KEY]: 'Map',
      [SUPERJSON_VALUE_KEY]: Array.from(value.entries()).map(([key, mapValue]) => [
        encodeSuperJson(key),
        encodeSuperJson(mapValue),
      ]),
    } satisfies SuperJsonTaggedValue;
  }

  if (value instanceof Set) {
    return {
      [SUPERJSON_TYPE_KEY]: 'Set',
      [SUPERJSON_VALUE_KEY]: Array.from(value.values()).map((entry) => encodeSuperJson(entry)),
    } satisfies SuperJsonTaggedValue;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => encodeSuperJson(entry));
  }

  if (isPlainObject(value)) {
    const encoded: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      encoded[key] = encodeSuperJson(entry);
    }
    return encoded;
  }

  return value;
}

function decodeSuperJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => decodeSuperJson(entry));
  }

  if (isTagged(value)) {
    const type = value[SUPERJSON_TYPE_KEY];
    const taggedValue = value[SUPERJSON_VALUE_KEY];

    if (type === 'Date') {
      return new Date(String(taggedValue));
    }

    if (type === 'BigInt') {
      return BigInt(String(taggedValue));
    }

    if (type === 'Map') {
      const entries = Array.isArray(taggedValue) ? taggedValue : [];
      return new Map(
        entries.map((entry) => {
          const pair = Array.isArray(entry) ? entry : [undefined, undefined];
          return [decodeSuperJson(pair[0]), decodeSuperJson(pair[1])];
        })
      );
    }

    if (type === 'Set') {
      const values = Array.isArray(taggedValue) ? taggedValue : [];
      return new Set(values.map((entry) => decodeSuperJson(entry)));
    }
  }

  if (isPlainObject(value)) {
    const decoded: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      decoded[key] = decodeSuperJson(entry);
    }
    return decoded;
  }

  return value;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

export function serializeWithMode(value: unknown, mode: StackSerializationMode = 'json'): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (mode === 'superjson') {
    return encodeSuperJson(value);
  }

  return cloneJson(value);
}

export function deserializeWithMode<T = unknown>(
  value: unknown,
  mode: StackSerializationMode = 'json'
): T {
  if (value === undefined) {
    return undefined as T;
  }

  if (mode === 'superjson') {
    return decodeSuperJson(value) as T;
  }

  return value as T;
}

export function createSerializer(mode: StackSerializationMode = 'json'): StackSerializer {
  return {
    mode,
    serialize(value) {
      return serializeWithMode(value, mode);
    },
    deserialize(value) {
      return deserializeWithMode(value, mode);
    },
  };
}
