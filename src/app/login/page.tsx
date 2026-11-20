"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useResearch } from "@/components/ResearchProvider";
import { authErrorCode, authErrorMessage } from "@/lib/auth-errors";
export default function Login() {
  const r = useResearch(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("error");
    if (code) setError(authErrorMessage(code));
  }, []);
  return (
    <main id="main-content" className="login-page">
      <section className="login-editorial">
        <h1>
          A place for
          <br />
          <em>your questions.</em>
        </h1>
        <p>
          Keep the answer, the sources,
          <br />
          and the conversation together.
        </p>
        <span className="login-imprint">Fieldwork · The research edition</span>
      </section>
      <section className="login-form">
        <h2>{r.authReady === false ? "Checking your account…" : r.user ? "You’re signed in." : "Sign in to Fieldwork."}</h2>
        <p>
          {r.user
            ? r.user.email
            : "New here? Your first Google sign-in creates your account. Returning? Use the same Google account."}
        </p>
        {r.user ? (
          <Link className="ink-button" href="/workspace">
            Open workspace <ArrowUpRight size={16} />
          </Link>
        ) : (
          <button
            className="ink-button"
            disabled={busy || r.authReady === false}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await r.signIn();
              } catch (cause) {
                setError(authErrorMessage(authErrorCode(cause)));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.9-1.75 2.99-4.33 2.99-7.36ZM12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Zm-5.59-8.08A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.38 3.14 1.07 4.51l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
                />
              </svg>
            )}{" "}
            Continue with Google
          </button>
        )}
        {(error || r.error) && (
          <p className="inline-error" role="alert">
            {error || r.error}
          </p>
        )}
        <p className="login-footnote">
          Your research is saved to your account.
          <br />
          You can return to it in Library.
        </p>
        <Link className="text-button" href="/demo">Try without signing in <ArrowUpRight size={14} /></Link>
        <Link className="text-button" href="/about">
          Learn about Fieldwork <ArrowUpRight size={14} />
        </Link>
      </section>
    </main>
  );
}
