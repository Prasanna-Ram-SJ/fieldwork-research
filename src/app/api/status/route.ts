import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){return NextResponse.json({supabase:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),nebius:Boolean(process.env.NEBIUS_API_KEY),tavily:Boolean(process.env.TAVILY_API_KEY),model:Boolean(process.env.NEBIUS_MODEL),research_enabled:process.env.PROVIDER_REQUESTS_ENABLED==='true'},{headers:{'Cache-Control':'no-store'}})}
