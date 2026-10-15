/** IBAN et BIC tels que saisis : sans espaces, en majuscules. */
export const normaliserBancaire = (v: string): string => v.replace(/\s+/g, '').toUpperCase();

/** Format et clé de contrôle (ISO 13616, modulo 97) : une faute de frappe ne passe pas. */
export function ibanValide(iban: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,30}$/.test(iban)) return false;
  const chiffres = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97;
  return reste === 1;
}

export const bicValide = (bic: string): boolean => /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic);

/** « FR76 1695 8000 … » : par blocs de quatre, comme sur un RIB. */
export const formaterIban = (iban: string): string => iban.replace(/(.{4})/g, '$1 ').trim();
