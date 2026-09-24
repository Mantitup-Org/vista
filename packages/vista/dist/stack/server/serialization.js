"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeWithMode = serializeWithMode;
exports.deserializeWithMode = deserializeWithMode;
exports.createSerializer = createSerializer;
const SUPERJSON_TYPE_KEY = '__vistaSuperType';
const SUPERJSON_VALUE_KEY = 'value';
function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return Object.getPrototypeOf(value) === Object.prototype;
}
function isTagged(value) {
    if (!isPlainObject(value)) {
        return false;
    }
    return typeof value[SUPERJSON_TYPE_KEY] === 'string' && SUPERJSON_VALUE_KEY in value;
}
function encodeSuperJson(value) {
    if (value instanceof Date) {
        return {
            [SUPERJSON_TYPE_KEY]: 'Date',
            [SUPERJSON_VALUE_KEY]: value.toISOString(),
        };
    }
    if (typeof value === 'bigint') {
        return {
            [SUPERJSON_TYPE_KEY]: 'BigInt',
            [SUPERJSON_VALUE_KEY]: value.toString(),
        };
    }
    if (value instanceof Map) {
        return {
            [SUPERJSON_TYPE_KEY]: 'Map',
            [SUPERJSON_VALUE_KEY]: Array.from(value.entries()).map(([key, mapValue]) => [
                encodeSuperJson(key),
                encodeSuperJson(mapValue),
            ]),
        };
    }
    if (value instanceof Set) {
        return {
            [SUPERJSON_TYPE_KEY]: 'Set',
            [SUPERJSON_VALUE_KEY]: Array.from(value.values()).map((entry) => encodeSuperJson(entry)),
        };
    }
    if (Array.isArray(value)) {
        return value.map((entry) => encodeSuperJson(entry));
    }
    if (isPlainObject(value)) {
        const encoded = {};
        for (const [key, entry] of Object.entries(value)) {
            encoded[key] = encodeSuperJson(entry);
        }
        return encoded;
    }
    return value;
}
function decodeSuperJson(value) {
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
            return new Map(entries.map((entry) => {
                const pair = Array.isArray(entry) ? entry : [undefined, undefined];
                return [decodeSuperJson(pair[0]), decodeSuperJson(pair[1])];
            }));
        }
        if (type === 'Set') {
            const values = Array.isArray(taggedValue) ? taggedValue : [];
            return new Set(values.map((entry) => decodeSuperJson(entry)));
        }
    }
    if (isPlainObject(value)) {
        const decoded = {};
        for (const [key, entry] of Object.entries(value)) {
            decoded[key] = decodeSuperJson(entry);
        }
        return decoded;
    }
    return value;
}
function cloneJson(value) {
    if (value === undefined) {
        return undefined;
    }
    return JSON.parse(JSON.stringify(value));
}
function serializeWithMode(value, mode = 'json') {
    if (value === undefined) {
        return undefined;
    }
    if (mode === 'superjson') {
        return encodeSuperJson(value);
    }
    return cloneJson(value);
}
function deserializeWithMode(value, mode = 'json') {
    if (value === undefined) {
        return undefined;
    }
    if (mode === 'superjson') {
        return decodeSuperJson(value);
    }
    return value;
}
function createSerializer(mode = 'json') {
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
