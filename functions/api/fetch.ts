// Cloudflare Pages Function: GET /api/fetch?url=<tab page>
// Fetches a tab page server-side (browsers can't, due to CORS) and returns plain tab text.

const ALLOWED_HOSTS = ['ultimate-guitar.com', 'tabs.ultimate-guitar.com'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Ultimate Guitar embeds the page data as JSON in <div class="js-store" data-content="...">. */
export function extractUltimateGuitar(html: string): { text: string; title: string } | null {
  const m = /class="js-store"\s+data-content="([^"]*)"/.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(decodeEntities(m[1]))?.store?.page?.data;
    const content: unknown = data?.tab_view?.wiki_tab?.content;
    if (typeof content !== 'string') return null;
    const song = data?.tab?.song_name, artist = data?.tab?.artist_name;
    const title = typeof song === 'string' ? (typeof artist === 'string' ? `${song} – ${artist}` : song) : '';
    return { text: content.replace(/\[\/?(tab|ch)\]/g, ''), title };
  } catch {
    return null;
  }
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const target = new URL(request.url).searchParams.get('url');
  let url: URL;
  try {
    url = new URL(target ?? '');
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
    return json({ error: `only ${ALLOWED_HOSTS[0]} links are supported` }, 400);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      accept: 'text/html',
    },
  });
  if (res.status === 404) return json({ error: 'page not found' }, 404);
  if (!res.ok) return json({ error: `site returned ${res.status} (probably bot protection)` }, 502);

  const tab = extractUltimateGuitar(await res.text());
  return tab ? json(tab) : json({ error: 'could not find a tab on that page' }, 502);
};
