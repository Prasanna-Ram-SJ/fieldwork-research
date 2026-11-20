import { NormalizedEvidence, TavilySearchResultItem } from '@/types/research';

export function normalizeUrl(rawUrl: string): { originalUrl: string; canonicalUrl: string; domain: string } | null {
  try {
    const parsed = new URL(rawUrl);

    // Only allow http/https
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      return null;
    }

    // Strip common tracking parameters and anchors
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'fbclid', 'gclid', 'msclkid', 'yclid', '_ga'
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    // Lowercase hostname and remove trailing slash for canonicalization
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    const canonicalUrl = `${parsed.protocol}//${domain}${pathname}${parsed.search ? parsed.search : ''}`;

    return {
      originalUrl: rawUrl,
      canonicalUrl,
      domain,
    };
  } catch {
    return null;
  }
}

export function deduplicateAndRankEvidence(
  rawResults: { query: string; results: TavilySearchResultItem[] }[],
  maxSources: number = 8
): NormalizedEvidence[] {
  const mapByCanonical = new Map<string, {
    originalUrl: string;
    canonicalUrl: string;
    domain: string;
    title: string;
    snippets: string[];
    score: number | null;
    publishedDate: string | null;
    queries: Set<string>;
  }>();

  for (const { query, results } of rawResults) {
    for (const item of results) {
      if (!item.url || !item.content) continue;

      const norm = normalizeUrl(item.url);
      if (!norm) continue;

      const existing = mapByCanonical.get(norm.canonicalUrl);
      if (existing) {
        existing.queries.add(query);
        if (item.content && !existing.snippets.includes(item.content.trim())) {
          existing.snippets.push(item.content.trim());
        }
        if (typeof item.score === 'number' && (existing.score === null || item.score > existing.score)) {
          existing.score = item.score;
        }
        if (!existing.publishedDate && item.published_date) {
          existing.publishedDate = item.published_date;
        }
      } else {
        mapByCanonical.set(norm.canonicalUrl, {
          originalUrl: norm.originalUrl,
          canonicalUrl: norm.canonicalUrl,
          domain: norm.domain,
          title: item.title || norm.domain,
          snippets: [item.content.trim()],
          score: typeof item.score === 'number' ? item.score : null,
          publishedDate: item.published_date || null,
          queries: new Set([query]),
        });
      }
    }
  }

  // Convert to array and group by domain to encourage source diversity
  const domainCount = new Map<string, number>();
  const candidates = Array.from(mapByCanonical.values()).sort((a, b) => {
    // Sort primarily by highest score
    return (b.score || 0) - (a.score || 0);
  });

  const selected: NormalizedEvidence[] = [];
  let sourceIndex = 1;

  // Pass 1: Select at most 2 sources per domain for diversity
  for (const item of candidates) {
    if (selected.length >= maxSources) break;

    const count = domainCount.get(item.domain) || 0;
    if (count < 2) {
      domainCount.set(item.domain, count + 1);

      // Join combined snippets with reasonable bound (max 800 chars per source)
      const combinedSnippet = item.snippets.join(' [...] ').slice(0, 800);

      selected.push({
        source_ref: `S${sourceIndex++}`,
        title: item.title,
        original_url: item.originalUrl,
        canonical_url: item.canonicalUrl,
        domain: item.domain,
        published_at: item.publishedDate,
        snippet: combinedSnippet,
        score: item.score,
        query_text: Array.from(item.queries).join('; '),
        selected: true,
      });
    }
  }

  // Pass 2: If we still have room and remaining items, fill remaining slots
  if (selected.length < maxSources) {
    for (const item of candidates) {
      if (selected.length >= maxSources) break;
      const alreadySelected = selected.some((s) => s.canonical_url === item.canonicalUrl);
      if (!alreadySelected) {
        const combinedSnippet = item.snippets.join(' [...] ').slice(0, 800);
        selected.push({
          source_ref: `S${sourceIndex++}`,
          title: item.title,
          original_url: item.originalUrl,
          canonical_url: item.canonicalUrl,
          domain: item.domain,
          published_at: item.publishedDate,
          snippet: combinedSnippet,
          score: item.score,
          query_text: Array.from(item.queries).join('; '),
          selected: true,
        });
      }
    }
  }

  return selected;
}
