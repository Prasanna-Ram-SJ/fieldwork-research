import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runResearchOrchestration } from '@/lib/research/orchestrator';
import { researchStream } from '@/lib/research/stream';
import { clarificationFor } from '@/lib/research/clarify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function POST(req: NextRequest) {
  if (process.env.PROVIDER_REQUESTS_ENABLED !== 'true') {
    return NextResponse.json({error:'Live research is paused by the project owner. No provider request was made.', research_paused:true}, {status:403});
  }
  try {
    const supabase = await createClient();

    if (!supabase) {
      return NextResponse.json(
        {
          error: 'Supabase configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY.',
          setup_required: true,
        },
        { status: 503 }
      );
    }

    // 1. Authenticate user from session cookies
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to conduct research.' },
        { status: 401 }
      );
    }

    // 2. Parse and validate body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { conversation_id, question } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: 'A research question is required.' },
        { status: 400 }
      );
    }

    if (question.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Question exceeds maximum character length of 1000.' },
        { status: 400 }
      );
    }

    const clarification = clarificationFor(question);
    if (clarification && body.scope_confirmed !== true) return NextResponse.json({ error: clarification, needs_clarification: true }, { status: 422 });

    if (!conversation_id || typeof conversation_id !== 'string') {
      return NextResponse.json(
        { error: 'A valid conversation_id is required.' },
        { status: 400 }
      );
    }

    // 3. Confirm conversation ownership
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversation_id)
      .single();

    if (convError || !conv) {
      // Do not disclose whether conversation exists if not owned
      return NextResponse.json(
        { error: 'Conversation not found or inaccessible.' },
        { status: 404 }
      );
    }

    if (conv.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Conversation not found or inaccessible.' },
        { status: 403 }
      );
    }

    return researchStream(emitEvent => runResearchOrchestration({
      supabase, userId:user.id, conversationId:conversation_id,
      question:question.trim(), emitEvent,
    }));
  } catch (error: any) {
    console.error('API research handler error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
