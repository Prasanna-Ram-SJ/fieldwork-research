import { planResearchQueries } from './planner';
import { searchTavily } from '@/lib/providers/tavily';
import { deduplicateAndRankEvidence, normalizeUrl } from './dedup';
import { readEvidence } from './source-reader';
import { assessCoverage } from './coverage';
import type { NormalizedEvidence, SSEEventType, TavilySearchResultItem } from '@/types/research';
import type { ResearchReport, SourceReading } from '@/types/database';
type Emit = (type: SSEEventType, payload: Record<string, any>) => Promise<void> | void;
export function reusableSources(focus: string, reports: ResearchReport[], timeSensitive: boolean): NormalizedEvidence[] {
  if (timeSensitive) return [];
  const words = [...new Set(focus.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])].filter(w => !['what','with','from','that','this','about','does','they','their','would','which'].includes(w));
  const candidates = reports.slice(0,2).flatMap(r => Array.isArray(r.sources) ? r.sources : []).filter(s => {
    if (!s || typeof s.title !== 'string' || typeof s.url !== 'string' || !Array.isArray(s.passages) || s.passages.some(p => !p || typeof p.text !== 'string')) return false;
    const age = Date.now() - Date.parse(s.read_at);
    const text = (s.title + ' ' + s.passages.map(p => p.text).join(' ')).toLowerCase();
    return age >= 0 && age < 30 * 60000 && words.filter(w => text.includes(w)).length >= 2;
  });
  const seen = new Set<string>();
  return candidates.flatMap(s => {
    const norm = normalizeUrl(s.url);
    if (!norm || seen.has(norm.canonicalUrl)) return [];
    seen.add(norm.canonicalUrl);
    return [{ source_ref: '', title: s.title, original_url: norm.originalUrl, canonical_url: norm.canonicalUrl, domain: norm.domain, published_at: s.published_at,
      snippet: s.passages.map(p => p.text).join(' ').slice(0,800), score: 0.8, query_text: focus, selected: true, reading: { ...s, reused: true } }];
  }).slice(0,2);
}
export function uniqueReadings(evidence: NormalizedEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter(e => {
    const key = e.reading?.doi?.toLowerCase() || e.reading?.content_hash || e.canonical_url;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export async function conductResearch(question: string, recentContext: string, reports: ResearchReport[], emit: Emit) {
  let inputTokens = 0, outputTokens = 0, credits = 0, usageComplete = true;
  const meter = (input: number, output: number, complete = true) => { inputTokens += input; outputTokens += output; if (!complete) usageComplete = false; };
  await emit('planning_started', { question });
  const plan = await planResearchQueries(question, recentContext, meter);
  await emit('queries_planned', { ...plan });
  const focus = [plan.focus || question, ...(plan.aspects || []).map(a => a.question)].join(' ');
  const previous = reusableSources(focus, reports, plan.is_time_sensitive);
  const searches: { query: string; results: TavilySearchResultItem[] }[] = [];
  const queries: string[] = [];
  const readingMap = new Map<string, SourceReading>(previous.filter(p => p.reading).map(p => [p.canonical_url, p.reading!]));
  const originalText = new Map<string, string>();
  function select(): NormalizedEvidence[] {
    const all = [...searches, ...previous.map(p => ({ query: p.query_text, results: [{ title: p.title, url: p.original_url, content: p.snippet, score: p.score || .8 }] }))];
    const candidates = deduplicateAndRankEvidence(all, 30);
    const previousUrls = new Set(previous.map(p => p.canonical_url));
    const retained = [...candidates.filter(e => previousUrls.has(e.canonical_url)).slice(0,2), ...candidates.filter(e => !previousUrls.has(e.canonical_url))].slice(0,8);
    return retained.map((e,i) => ({ ...e, source_ref: 'S' + (i + 1), reading: readingMap.get(e.canonical_url), original_text: originalText.get(e.canonical_url) }));
  }
  async function search(query: string) {
    queries.push(query); // Attempts count, including failed calls; never retried.
    const res = await searchTavily({ query, search_depth: 'basic', max_results: 8, topic: 'general', include_raw_content: true });
    for (const result of res.results) { const url = normalizeUrl(result.url); if (url && typeof result.raw_content === 'string') originalText.set(url.canonicalUrl, result.raw_content.slice(0,100000)); }
    credits += res.creditsUsed; searches.push({ query, results: res.results });
  }
  await emit('search_started', { queries: plan.queries, search_depth: 'basic', topic: 'general' });
  const results = await Promise.allSettled(plan.queries.slice(0,2).map(search));
  if (!searches.length && !previous.length) throw results.find(r => r.status === 'rejected')?.reason || Error('No search evidence was retrieved.');
  await emit('search_completed', { searches_count: searches.length, raw_results_count: searches.reduce((sum,r) => sum + r.results.length, 0) });
  let evidence: NormalizedEvidence[] = select();
  await emit('sources_reading_started', { message: 'Reading selected original sources within the size and time limits. Up to four originals per run.' });
  const onRead = async (s: NormalizedEvidence) => { readingMap.set(s.canonical_url, s.reading!); await emit('source_read', { title: s.title, source_ref: s.source_ref, access: s.reading!.access, reason: s.reading!.note, cached: !!s.reading!.reused }); };
  evidence = uniqueReadings(await readEvidence(evidence, focus, 3, onRead));
  const reused = evidence.filter(e => e.reading?.reused).length;
  if (reused) await emit('sources_reused', { message: `${reused} relevant recent source readings were retained; timestamps and reading limits remain visible.`, count: reused });
  let assessment = await assessCoverage(plan, evidence, meter);
  await emit('coverage_checked', { coverage: assessment.coverage, aspects: plan.aspects, message: assessment.available ? 'Checked which research questions the available passages address.' : 'Coverage check unavailable; this limit will be stated in the report.' });
  if (assessment.query && queries.length < 3) {
    await emit('refinement_started', { refinement_query: assessment.query, reason: assessment.coverage.filter(c => c.status !== 'addressed').map(c => c.reason).join(' ').slice(0,600) });
    try { await search(assessment.query); }
    catch { await emit('search_completed', { message: 'The final targeted search failed. Existing evidence remains available; no retry was made.', searches_count: searches.length }); }
    evidence = uniqueReadings(await readEvidence(select(), focus, 1, onRead));
    assessment = await assessCoverage(plan, evidence, meter);
    await emit('coverage_checked', { coverage: assessment.coverage, aspects: plan.aspects, message: 'Final coverage check after the targeted search.' });
  }
  const remaining = assessment.coverage.filter(c => c.status !== 'addressed').length;
  const stopReason = !assessment.available ? 'Coverage assessment unavailable; conclusions are limited to the retrieved passages.' : remaining ? `Stopped within the three-search limit with ${remaining} partially answered or unanswered research questions. These gaps are not proof of absence.` : 'The selected passages address the planned questions within the bounded search. This is not an exhaustive review or a guarantee of truth.';
  const planningNotice = plan.planning_fallback ? 'AI query planning was unavailable; the original question was searched directly without a model retry. ' : '';
  return { plan, evidence, coverage: assessment.coverage, queries, stopReason: planningNotice + stopReason, actualTavilyCredits: credits, inputTokens, outputTokens, usageComplete };
}
