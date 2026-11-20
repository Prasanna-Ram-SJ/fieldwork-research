import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
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

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, last_message_at')
    .eq('user_id', user.id)
    .not('title', 'like', 'FIELDWORK-PROJECT:%')
    .order('last_message_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: conversations || [] });
}

export async function POST(req: NextRequest) {
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

  let title = 'New Research';
  try {
    const body = await req.json();
    if (body.title && typeof body.title === 'string') {
      title = body.title.trim().slice(0, 60);
    }
  } catch {
    // Default title
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
