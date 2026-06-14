import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/env.mjs';

let _client: Anthropic | null = null;

// Renvoie null si pas de clé (comme resend.ts) — l'appelant gère le message.
export function anthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  _client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export const LEGAL_MODEL = 'claude-opus-4-8';
