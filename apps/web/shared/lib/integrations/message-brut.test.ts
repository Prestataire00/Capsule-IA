import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/env.mjs', () => ({ env: {} }));

import { messageBrut } from './google-calendar-client';

describe('e-mail envoyé par la boîte générique des cours', () => {
  it('compose un message HTML dont les accents passent', () => {
    const m = messageBrut({
      from: '"Capsule IA" <cours@capsuleia.fr>',
      to: ['rh@client.fr'],
      cc: ['laurie@capsuleia.fr'],
      replyTo: 'cours@capsuleia.fr',
      subject: 'Lien de la visio — séance du 12/10',
      html: '<p>Bonjour, voici le lien de la séance.</p>',
    });
    expect(m).toContain('From: Capsule IA <cours@capsuleia.fr>');
    expect(m).toContain('To: rh@client.fr');
    expect(m).toContain('Cc: laurie@capsuleia.fr');
    expect(m).toContain('Reply-To: cours@capsuleia.fr');
    expect(m).toContain(`Subject: =?UTF-8?B?${Buffer.from('Lien de la visio — séance du 12/10').toString('base64')}?=`);
    const corps = m.split('\r\n\r\n')[1] ?? '';
    expect(Buffer.from(corps.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('<p>Bonjour, voici le lien de la séance.</p>');
  });
});
