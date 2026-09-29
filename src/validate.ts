export type FieldValidator = (value: string) => string | null;

export function required(name: string): FieldValidator {
  return (v) => v.trim().length === 0 ? `${name} wajib diisi.` : null;
}

export function minLength(min: number, name: string): FieldValidator {
  return (v) => v.trim().length < min ? `${name} minimal ${min} karakter.` : null;
}

export function maxLength(max: number, name: string): FieldValidator {
  return (v) => v.trim().length > max ? `${name} maksimal ${max} karakter.` : null;
}

export function pattern(re: RegExp, message: string): FieldValidator {
  return (v) => !re.test(v) ? message : null;
}

export function check(fn: (v: string) => boolean, message: string): FieldValidator {
  return (v) => fn(v) ? null : message;
}

export function integer(name: string): FieldValidator {
  return (v) => v.trim().length > 0 && !Number.isInteger(Number(v)) ? `${name} harus berupa angka.` : null;
}

export function run(value: string, validators: FieldValidator[]): string | null {
  for (const v of validators) {
    const err = v(value);
    if (err) return err;
  }
  return null;
}

export function parseIntSafe(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Preset validators
export const username = () => [
  required("Username"),
  minLength(3, "Username"),
  maxLength(30, "Username"),
  pattern(/^[a-zA-Z0-9._]+$/, "Username hanya boleh huruf, angka, titik, atau underscore."),
];

export const password = () => [
  required("Password"),
  minLength(5, "Password"),
  maxLength(100, "Password"),
];

export const nama = (label = "Nama") => [
  required(label),
  minLength(2, label),
  maxLength(100, label),
  pattern(/^[^<>]+$/, `${label} mengandung karakter tidak valid.`),
];

export function time(name: string): FieldValidator {
  return pattern(/^([01]\d|2[0-3]):([0-5]\d)$/, `${name} harus format HH:MM.`);
}

export function timeRange(startName: string, endName: string) {
  return (start: string, end: string): string | null => {
    return start < end ? null : `${endName} harus lebih lambat dari ${startName}.`;
  };
}

export function hariValid(name = "Hari"): FieldValidator {
  return (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? null : `${name} harus 0-6 (Minggu-Sabtu).`;
  };
}
