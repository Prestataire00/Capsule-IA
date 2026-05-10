declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export const makeId =
  <B extends string>() =>
  (raw: string): Brand<string, B> =>
    raw as Brand<string, B>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: string): boolean => UUID_RE.test(s);
