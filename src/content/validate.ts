// Zero-dependency validators for content data. Each reader tracks the source file and a dotted
// field path so a bad edit fails with a message naming exactly where it is wrong.

export interface ContentSource {
  readonly file: string;
  readonly data: unknown;
}

export interface FieldPath {
  readonly file: string;
  readonly field: string;
}

export class ContentValidationError extends Error {
  readonly file: string;
  readonly field: string;

  constructor(at: FieldPath, problem: string) {
    super(`Court Vision: invalid content in ${at.file} at ${at.field}: ${problem}`);
    this.name = 'ContentValidationError';
    this.file = at.file;
    this.field = at.field;
  }
}

export function rootPath(file: string, root: string): FieldPath {
  return { file, field: root };
}

export function childPath(at: FieldPath, key: string | number): FieldPath {
  const field = typeof key === 'number' ? `${at.field}[${key}]` : `${at.field}.${key}`;
  return { file: at.file, field };
}

export function fail(at: FieldPath, problem: string): never {
  throw new ContentValidationError(at, problem);
}

export function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  return typeof value;
}

export function readObject(value: unknown, at: FieldPath): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(at, `expected object, got ${describeValue(value)}`);
  }
  return value as Record<string, unknown>;
}

export function getField(
  obj: Record<string, unknown>,
  key: string,
  at: FieldPath,
): { value: unknown; at: FieldPath } {
  const fieldAt = childPath(at, key);
  if (!Object.hasOwn(obj, key) || obj[key] === undefined) {
    return fail(fieldAt, 'missing required field');
  }
  return { value: obj[key], at: fieldAt };
}

export function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  at: FieldPath,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) fail(childPath(at, key), 'unknown field');
  }
}

export function readString(value: unknown, at: FieldPath): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(at, `expected non-empty string, got ${describeValue(value)}`);
  }
  return value;
}

export function readNumber(
  value: unknown,
  at: FieldPath,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const { min, max, integer } = opts;
  const kind = integer === true ? 'integer' : 'number';
  const range = min !== undefined || max !== undefined ? ` ${min ?? '-inf'}..${max ?? 'inf'}` : '';
  const expected = `expected ${kind}${range}, got ${describeValue(value)}`;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(at, expected);
  if (integer === true && !Number.isInteger(value)) return fail(at, expected);
  if (min !== undefined && value < min) return fail(at, expected);
  if (max !== undefined && value > max) return fail(at, expected);
  return value;
}

export function readBoolean(value: unknown, at: FieldPath): boolean {
  if (typeof value !== 'boolean') {
    return fail(at, `expected boolean, got ${describeValue(value)}`);
  }
  return value;
}

export function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  at: FieldPath,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(at, `expected one of ${allowed.join(', ')}, got ${describeValue(value)}`);
  }
  return value as T;
}

export function readArray(value: unknown, at: FieldPath): unknown[] {
  if (!Array.isArray(value)) {
    return fail(at, `expected array, got ${describeValue(value)}`);
  }
  return value as unknown[];
}

// camelCase content ids (archetypes, plays, phases, coverages, decisions, options).
export const ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;

export function readId(value: unknown, at: FieldPath): string {
  const id = readString(value, at);
  if (!ID_PATTERN.test(id)) {
    return fail(at, `expected id matching ${String(ID_PATTERN)}, got ${describeValue(id)}`);
  }
  return id;
}

export function readHexColor(value: unknown, at: FieldPath): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    return fail(at, `expected #rrggbb color, got ${describeValue(value)}`);
  }
  return value.toLowerCase();
}
