import { SupabaseClient } from '@supabase/supabase-js';
import { getNebiusConfig } from '@/lib/providers/nebius';
import { TavilyError } from '@/lib/providers/tavily';
import { inferenceErrorMessage } from '@/lib/providers/provider-errors';
import { conductResearch } from './pipeline';
import { synthesizeReport } from './report-synthesizer';
import type { ResearchReport } from '@/types/database';
import { reserveBudget, reconcileBudget } from '@/lib/budget/limits';
import { SSEEventType, SSETraceEvent } from '@/types/research';

export interface OrchestrationParams {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  question: string;
  emitEvent: (event: SSETraceEvent) => Promise<void> | void;
}

export async function runResearchOrchestration({
  supabase,
  userId,
  conversationId,
  question,
  emitEvent,
}: OrchestrationParams) {
  let sequenceNo = 1;
  const startTime = Date.now();
  let researchRunId: string = '';
  let actualTavilyCredits = 0;
  let nebiusTokens = { input: 0, output: 0 };

  const emitAndPersist = async (type: SSEEventType, payload: Record<string, any>) => {
    const event: SSETraceEvent = {
      research_run_id: researchRunId,
      sequence: sequenceNo++,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };

    // Emit over SSE stream
    await emitEvent(event);

    // Persist durable operational event
    if (researchRunId) {
      try {
        const { error: eventError } = await supabase.from('research_events').insert({
          user_id: userId,
          research_run_id: researchRunId,
          sequence_no: event.sequence,
          event_type: type,
          payload,
        });
        if (eventError) throw new Error('Research activity could not be saved.');
      } catch (err) {
        throw new Error('Research activity could not be saved. Please reopen the research before retrying.');
      }
    }
  };

  try {
    // 1. Verify credentials upfront
    const nebiusConfig = getNebiusConfig();
    const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);

    if (!nebiusConfig || !hasTavilyKey) {
      const missing = [];
      if (!nebiusConfig) missing.push('Nebius Token Factory API Key');
      if (!hasTavilyKey) missing.push('Tavily Search API Key');

      await emitAndPersist('provider_error', {
        error_code: 'credentials_missing',
        message: `Research agent setup required: ${missing.join(' and ')} not configured on server. Please add them to your environment.`,
        setup_required: true,
      });
      return;
    }

    // 2. Create the research run record in Supabase
    const { data: runData, error: runError } = await supabase
      .from('research_runs')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        status: 'planning',
        model_id: nebiusConfig.model,
      })
      .select('id')
      .single();

    if (runError || !runData) {
      throw new Error(`Failed to initialize research run: ${runError?.message || 'Unknown database error'}`);
    }

    researchRunId = runData.id;

    // 3. Save User Message
    const { data: userMsgData } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        research_run_id: researchRunId,
        role: 'user',
        content: { text: question.trim() },
      })
      .select('id')
      .single();

    if (userMsgData) {
      await supabase
        .from('research_runs')
        .update({ user_message_id: userMsgData.id })
        .eq('id', researchRunId);
    }

    // 4. Update Conversation Title & Timestamp if first question
    const { data: conv } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', conversationId)
      .single();

    if (conv && (conv.title === 'New Research' || !conv.title)) {
      const derivedTitle = question.trim().slice(0, 60);
      await supabase
        .from('conversations')
        .update({
          title: derivedTitle,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    } else {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }

    await emitAndPersist('run_started', {
      research_run_id: researchRunId,
      model_id: nebiusConfig.model,
      question: question.trim(),
    });

    // 5. Reserve Quota atomically
    const budgetRes = await reserveBudget(supabase, userId, researchRunId, 3);
    if (!budgetRes.allowed) {
      await supabase
        .from('research_runs')
        .update({
          status: 'quota_exhausted',
          error_code: budgetRes.reason || 'quota_exhausted',
          completed_at: new Date().toISOString(),
          elapsed_ms: Date.now() - startTime,
        })
        .eq('id', researchRunId);

      await emitAndPersist('quota_exhausted', {
        reason: budgetRes.reason,
        message: budgetRes.message,
        daily_used: budgetRes.daily_used,
        daily_limit: budgetRes.daily_limit,
        monthly_used: budgetRes.monthly_used,
        monthly_limit: budgetRes.monthly_limit,
      });
      return;
    }

    // 6. Fetch recent conversation context for follow-up turns
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .neq('research_run_id', researchRunId)
      .order('created_at', { ascending: false })
      .limit(4);

    let recentContext = '';
    if (recentMessages && recentMessages.length > 0) {
      recentContext = recentMessages
        .reverse()
        .map((m: any) => {
          const text = m.role === 'user' ? m.content?.text : m.content?.summary || m.content?.blocks?.[0]?.text;
          return `${m.role.toUpperCase()}: ${m.role === 'assistant' && Array.isArray(m.content?.blocks) ? m.content.blocks.map((b: any) => b.text).join(' ').slice(0,4500) : text || ''}`;
        })
        .join('\n').slice(-6500);
    }

    const previousReports = (recentMessages || []).filter((m: any) => m.role === 'assistant' && m.content?.report?.version === 1).map((m: any) => m.content.report as ResearchReport);
    const gathered = await conductResearch(question, recentContext, previousReports, async (type, payload) => {
      if (type === 'queries_planned') await supabase.from('research_runs').update({ query_plan: payload, status: 'searching' }).eq('id', researchRunId);
      if (type === 'sources_reading_started') await supabase.from('research_runs').update({ status: 'evaluating' }).eq('id', researchRunId);
      await emitAndPersist(type, payload);
    });
    const { plan, evidence } = gathered;
    actualTavilyCredits = gathered.actualTavilyCredits;
    nebiusTokens = { input: gathered.inputTokens, output: gathered.outputTokens };

    // 11. Check for Insufficient Evidence State
    if (evidence.length === 0) {
      await supabase
        .from('research_runs')
        .update({
          status: 'insufficient_evidence',
          tavily_credits_actual: actualTavilyCredits,
          completed_at: new Date().toISOString(),
          elapsed_ms: Date.now() - startTime,
        })
        .eq('id', researchRunId);

      await reconcileBudget(supabase, userId, researchRunId, actualTavilyCredits, undefined, true);

      // Create an honest assistant message noting insufficient evidence
      const insufficientSummary = `There is not enough verifiable web evidence available to answer "${question}" reliably. The search attempted queries (${plan.queries.join(', ')}), but no relevant sources were found.`;

      const { data: asstMsg } = await supabase
        .from('messages')
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          research_run_id: researchRunId,
          role: 'assistant',
          content: {
            blocks: [
              {
                text: insufficientSummary,
                claim_type: 'inference',
                source_refs: [],
                caveat: 'No supporting sources found across public web search.',
              },
            ],
            uncertainty_note: 'No corroborating evidence retrieved.',
            evidence_status: 'insufficient',
          },
        })
        .select('id')
        .single();

      if (asstMsg) {
        await supabase
          .from('research_runs')
          .update({ assistant_message_id: asstMsg.id })
          .eq('id', researchRunId);
      }

      await emitAndPersist('insufficient_evidence', {
        message: insufficientSummary,
        attempted_queries: plan.queries,
      });
      return;
    }

    // 12. Save selected sources into the database
    const sourceInserts = evidence.map((e) => ({
      user_id: userId,
      research_run_id: researchRunId,
      source_ref: e.source_ref,
      original_url: e.original_url,
      canonical_url: e.canonical_url,
      title: e.title,
      domain: e.domain,
      published_at: e.published_at && !Number.isNaN(Date.parse(e.published_at)) ? new Date(e.published_at).toISOString() : null,
      snippet: e.snippet,
      tavily_score: e.score,
      query_text: e.query_text,
      selected: e.selected,
    }));

    const { data: savedSources, error: sourceErr } = await supabase
      .from('sources')
      .insert(sourceInserts)
      .select('id, source_ref, title, domain, original_url, published_at');

    if (sourceErr) {
      throw new Error('The evidence could not be saved. Research stopped before synthesis.');
    }

    const sourceMap = new Map<string, string>(); // source_ref -> source_id
    (savedSources || []).forEach((s: any) => sourceMap.set(s.source_ref, s.id));

    await emitAndPersist('evidence_selected', {
      selected_sources_count: evidence.length,
      sources: evidence.map((e) => ({
        source_ref: e.source_ref,
        title: e.title,
        domain: e.domain,
        original_url: e.original_url,
        published_at: e.published_at,
        snippet_preview: e.snippet,
        reading: e.reading,
      })),
    });

    // 13. Step 5: Answer Synthesis with Nebius Token Factory
    await supabase
      .from('research_runs')
      .update({ status: 'synthesizing' })
      .eq('id', researchRunId);

    await emitAndPersist('synthesis_started', {
      model_id: nebiusConfig.model,
      evidence_count: evidence.length,
    });

    const synthesisResult = await synthesizeReport(question, evidence, { plan, coverage: gathered.coverage, queries: gathered.queries, stopReason: gathered.stopReason }, recentContext, async () => {
      await emitAndPersist('verification_started', {message:'Checking report statements, source comparisons and exact quotations against their passages.'});
    });
    nebiusTokens = {
      input: nebiusTokens.input + synthesisResult.inputTokens,
      output: nebiusTokens.output + synthesisResult.outputTokens,
    };

    const finalAnswer = synthesisResult.output;

    // 14. Save Assistant Message into messages table
    const { data: asstMessage, error: asstErr } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        research_run_id: researchRunId,
        role: 'assistant',
        content: finalAnswer,
      })
      .select('id')
      .single();

    if (asstErr || !asstMessage) {
      throw new Error(`Failed to save assistant message: ${asstErr?.message}`);
    }

    // 15. Save Citations into citations table
    const citationInserts: any[] = [];
    finalAnswer.blocks.forEach((block, claimIndex) => {
      block.source_refs.forEach((ref) => {
        const sourceDbId = sourceMap.get(ref);
        if (sourceDbId) {
          citationInserts.push({
            user_id: userId,
            research_run_id: researchRunId,
            message_id: asstMessage.id,
            source_id: sourceDbId,
            claim_index: claimIndex,
          });
        }
      });
    });

    if (citationInserts.length > 0) {
      await supabase.from('citations').insert(citationInserts);
    }

    // 16. Reconcile budget usage
    await reconcileBudget(
      supabase,
      userId,
      researchRunId,
      actualTavilyCredits,
      nebiusTokens,
      true
    );

    // 17. Finalize research run record
    const elapsedMs = Date.now() - startTime;
    await supabase
      .from('research_runs')
      .update({
        assistant_message_id: asstMessage.id,
        status: 'completed',
        tavily_credits_actual: actualTavilyCredits,
        nebius_input_tokens: nebiusTokens.input,
        nebius_output_tokens: nebiusTokens.output,
        completed_at: new Date().toISOString(),
        elapsed_ms: elapsedMs,
      })
      .eq('id', researchRunId);

    // 18. Emit final completion event
    await emitAndPersist('answer_completed', {
      assistant_message_id: asstMessage.id,
      answer: finalAnswer,
      elapsed_ms: elapsedMs,
      tavily_credits: actualTavilyCredits,
      tokens: nebiusTokens,
    });
  } catch (err: any) {
    console.error('Research orchestration error:', err);

    const timeoutMessage = err instanceof TavilyError ? undefined : inferenceErrorMessage(err);
    const errorMessage = timeoutMessage || err?.message || 'An unexpected research error occurred.';
    let errorCode = timeoutMessage ? 'provider_timeout' : 'internal_error';

    if (err instanceof TavilyError) {
      errorCode = err.errorCode;
    } else if (err?.status === 401 || err?.statusCode === 401) {
      errorCode = 'provider_auth_error';
    } else if (err?.status === 429) {
      errorCode = 'provider_rate_limit';
    }

    if (researchRunId) {
      await supabase
        .from('research_runs')
        .update({
          status: 'failed',
          error_code: errorCode,
          completed_at: new Date().toISOString(),
          elapsed_ms: Date.now() - startTime,
        })
        .eq('id', researchRunId);

      await reconcileBudget(
        supabase,
        userId,
        researchRunId,
        actualTavilyCredits,
        nebiusTokens,
        false
      );
    }

    await emitAndPersist('provider_error', {
      error_code: errorCode,
      message: errorMessage,
      retryable: errorCode === 'provider_rate_limit' || errorCode === 'tavily_rate_limit',
    });
  }
}
