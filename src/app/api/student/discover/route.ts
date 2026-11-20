import type { NextRequest } from 'next/server';
import { studentResponse, studentFailure } from '@/lib/student/http';
import { ProjectError } from '@/lib/student/store';
import { normalizeDoi, validatePaper } from '@/lib/student/validation';
const cache = new Map<string, { until: number; papers: unknown[] }>();
const plain = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim() : '';
export async function GET(request: NextRequest) {
  try {
    // Public metadata discovery supports browser-only guest assignments. This
    // fixed Crossref endpoint never uses either paid provider or account data.
    const params = request.nextUrl.searchParams, query = (params.get('q') || '').trim().slice(0, 250), doi = normalizeDoi(query);
    if (query.length < 3) throw new ProjectError('Enter a DOI or a research topic with at least three characters.');
    const url = new URL(doi ? 'https://api.crossref.org/works/' + encodeURIComponent(doi) : 'https://api.crossref.org/works');
    if (!doi) {
      url.searchParams.set('query.bibliographic', query);
      url.searchParams.set('rows', '10');
      const filters = ['type:journal-article'];
      const from = params.get('from'), to = params.get('to');
      if (from && /^\d{4}$/.test(from)) filters.push('from-pub-date:' + from + '-01-01');
      if (to && /^\d{4}$/.test(to)) filters.push('until-pub-date:' + to + '-12-31');
      url.searchParams.set('filter', filters.join(','));
    }
    const hit = cache.get(url.href);
    if (hit && hit.until > Date.now()) return studentResponse({ papers: hit.papers, cached: true });
    const response = await fetch(url, { headers: { 'User-Agent': 'FieldworkResearch/1.0 (student bibliography lookup)' }, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!response.ok) throw new ProjectError(response.status === 404 ? 'That DOI was not found in Crossref. You can still upload the paper or add its details manually.' : 'The scholarly index is temporarily unavailable. Please try again.', 502);
    const data = await response.json(), works = doi ? [data.message] : data.message?.items || [];
    const papers = works.filter((work: any) => work?.title?.length).slice(0, 10).map((work: any) => {
      const abstract = plain(work.abstract), year = (work.published?.['date-parts'] || work.issued?.['date-parts'])?.[0]?.[0] || null;
      return validatePaper({ id: crypto.randomUUID(), title: plain(work.title[0]), authors: (work.author || []).map((a: any) => ({ given: a.given, family: a.family, literal: a.name })), year,
        doi: work.DOI, url: work.URL, journal: plain(work['container-title']?.[0]), volume: work.volume, issue: work.issue, pages: work.page,
        metadataSource: 'Crossref', textScope: abstract ? 'abstract_only' : 'metadata_only', textPages: abstract ? [{ number: 1, text: abstract }] : [], tags: [] });
    });
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url.href, { until: Date.now() + 600000, papers });
    return studentResponse({ papers, cached: false });
  } catch (e) { return studentFailure(e); }
}
