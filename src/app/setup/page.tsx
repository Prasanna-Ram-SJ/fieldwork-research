"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useResearch } from "@/components/ResearchProvider";
export default function Setup() {
  const r = useResearch();
  return (
    <main id="main-content" className="setup-page">
      <h1>Your research connections.</h1>
      <p>
        Fieldwork connects sign-in and saved research through Supabase, web
        search through Tavily, and model inference through Nebius Token Factory.
      </p>
      <ul className="connection-list">
        {[
          ["supabase", "Sign-in & saved research"],
          ["tavily", "Tavily web search"],
          ["nebius", "Nebius Token Factory"],
          ["model", "Research model"],
        ].map(([key, label]) => (
          <li key={key}>
            {label}
            <span>
              {r.status[key as "supabase"]
                ? "Configured locally"
                : "Not configured"}
            </span>
          </li>
        ))}
      </ul>
      <p className="panel-note">
        Configuration status reflects saved settings. It does not test a key or
        contact a research provider.
      </p>
      <Link href="/workspace" className="text-button">
        Return to workspace <ArrowUpRight size={15} />
      </Link>
    </main>
  );
}
