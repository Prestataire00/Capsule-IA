/** Compare une saisie de confirmation au nom de famille réel (trim + insensible à la casse). */
export function namesMatch(input: string, actual: string): boolean {
  const norm = (s: string) => s.trim().toLocaleLowerCase();
  const a = norm(input);
  return a.length > 0 && a === norm(actual);
}
