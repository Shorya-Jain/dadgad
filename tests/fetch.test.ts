import { describe, expect, it } from 'vitest';
import { extractUltimateGuitar } from '../functions/api/fetch';

describe('extractUltimateGuitar', () => {
  it('pulls tab content out of the js-store blob and strips [ch]/[tab] markup', () => {
    const store = { store: { page: { data: { tab_view: { wiki_tab: { content: '[ch]G[/ch]  [ch]C[/ch]\nla & la\n[tab]e|--0--|[/tab]' } } } } } };
    const attr = JSON.stringify(store).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const html = `<html><div class="js-store" data-content="${attr}"></div></html>`;
    expect(extractUltimateGuitar(html)).toBe('G  C\nla & la\ne|--0--|');
  });

  it('returns null when the page has no tab', () => {
    expect(extractUltimateGuitar('<html>blocked</html>')).toBeNull();
  });
});
