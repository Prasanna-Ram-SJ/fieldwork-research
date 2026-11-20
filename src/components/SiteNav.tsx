"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { useResearch } from "./ResearchProvider";

export function SiteNav() {
  const path = usePathname(),
    r = useResearch();
  const [open, setOpen] = useState(false);
  const links = [
    ["/", "Home"],
    ["/about", "About"],
    ...(!r.user ? [["/demo", "Try without signing in"]] : []),
    ...(r.user
      ? [
          ["/library", "Library"],
          ["/projects", "Projects"],
          ["/workspace", "Workspace"],
        ]
      : []),
  ];
  return (
    <header className="nav-position">
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/" prefetch={true} className="brand" onClick={() => setOpen(false)}>
          <img src="/fieldwork-mark.svg" width="32" height="27" alt="" className="brand-mark" />
          <span>Fieldwork</span>
        </Link>
        <button
          className="nav-toggle icon-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className={"nav-links " + (open ? "is-open" : "")}>
          {links.map(([url, label]) => (
            <Link
              key={url}
              href={url}
              prefetch={true}
              aria-current={
                path === url ||
                (url === "/workspace" && path.startsWith("/chat/"))
                  ? "page"
                  : undefined
              }
              aria-disabled={url === "/workspace" && r.busy ? true : undefined}
              onClick={(event) => {
                setOpen(false);
                if (
                  url === "/workspace" &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  r.reset();
                }
              }}
            >
              {label}
            </Link>
          ))}
          {r.authReady === false ? (
            <span className="nav-auth-status" role="status">Checking account…</span>
          ) : r.user ? (
            <button
              className="nav-account"
              disabled={r.busy}
              onClick={() => {
                setOpen(false);
                void r.signOut();
              }}
              title={"Sign out " + (r.user.email || "")}
            >
              <span>Sign out</span>
              <LogOut size={14} />
            </button>
          ) : (
            <Link
              className="nav-signup"
              href="/login"
              onClick={() => setOpen(false)}
            >
              Sign in / Sign up
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
