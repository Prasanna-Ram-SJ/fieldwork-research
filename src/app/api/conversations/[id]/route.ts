import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch conversation and verify ownership
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();

  if (convError || !conversation || conversation.user_id !== user.id) {
    // 404/403: do not reveal existence to unauthorized users
    return NextResponse.json({ error: 'Conversation not found or inaccessible.' }, { status: 404 });
  }

  // 2. Fetch messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  // 3. Fetch runs for this conversation
  const { data: runs } = await supabase
    .from('research_runs')
    .select('*')
    .eq('conversation_id', id)
    .order('started_at', { ascending: true });

  const runIds = (runs || []).map((r: any) => r.id);

  // 4. Fetch sources for these runs
  let sources: any[] = [];
  if (runIds.length > 0) {
    const { data: sourceData } = await supabase
      .from('sources')
      .select('*')
      .in('research_run_id', runIds)
      .order('source_ref', { ascending: true });
    sources = sourceData || [];
  }

  // 5. Fetch citations
  let citations: any[] = [];
  if (runIds.length > 0) {
    const { data: citationData } = await supabase
      .from('citations')
      .select('*')
      .in('research_run_id', runIds);
    citations = citationData || [];
  }

  // 6. Fetch durable trace events
  let events: any[] = [];
  if (runIds.length > 0) {
    const { data: eventData } = await supabase
      .from('research_events')
      .select('*')
      .in('research_run_id', runIds)
      .order('sequence_no', { ascending: true });
    events = eventData || [];
  }

  return NextResponse.json({
    conversation,
    messages: messages || [],
    runs: runs || [],
    sources,
    citations,
    events,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure user owns conversation before deleting
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
