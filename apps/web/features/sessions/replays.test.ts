import { describe, expect, it } from 'vitest';
import { lienDeReplay, sourceDuReplay } from './replays';

describe('replays de séance', () => {
  it('reconnaît la source d’après le lien', () => {
    expect(sourceDuReplay(lienDeReplay('https://tldv.io/app/meetings/abc')!)).toBe('tldv');
    expect(sourceDuReplay(lienDeReplay('https://app.golexi.ai/share/xyz')!)).toBe('lexi');
    expect(sourceDuReplay(lienDeReplay('https://drive.google.com/file/d/1/view')!)).toBe('meet');
    expect(sourceDuReplay(lienDeReplay('https://us02web.zoom.us/rec/share/q')!)).toBe('zoom');
    expect(sourceDuReplay(lienDeReplay('https://vimeo.com/123')!)).toBe('manual');
  });
  it('refuse ce qui n’est pas une adresse web', () => {
    expect(lienDeReplay('javascript:alert(1)')).toBeNull();
    expect(lienDeReplay('pas un lien')).toBeNull();
    expect(lienDeReplay('  https://tldv.io/x  ')?.href).toBe('https://tldv.io/x');
  });
});
