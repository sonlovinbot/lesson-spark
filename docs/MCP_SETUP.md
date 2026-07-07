# Lumi — Preview links & MCP (Claude/ChatGPT) setup

This covers everything added for shareable lesson previews and the MCP
connector that lets Claude/ChatGPT create and read lessons for a user.

## 1. Database

Run the whole `supabase/schema.sql` again in Supabase → SQL Editor. It is
idempotent (safe to re-run). It adds:

- `lessons.visibility` column (`private` | `public`) + a public-read policy
  so shared links work for anyone.
- `oauth_clients`, `oauth_codes`, `oauth_tokens` tables (RLS on, no policies —
  only the server's service-role key touches them).

## 2. Environment variables

Add these to `.env` (local) **and** the Vercel project settings (Production).

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | client | Supabase URL (already set) |
| `VITE_SUPABASE_ANON_KEY` | client | Supabase anon key (already set) |
| `VITE_PUBLIC_APP_URL` | client | Base URL for share links, e.g. `https://your.vercel.app` |
| `SUPABASE_URL` | server | Same Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **Secret** — Settings → API → `service_role` |
| `PUBLIC_APP_URL` | server | Base URL (OAuth issuer + preview links) |
| `COACHIO_API_KEY` | server | Coachio key used by MCP to generate lessons |

> The `SUPABASE_SERVICE_ROLE_KEY` is a powerful secret. It is only read in
> server routes, never shipped to the browser. Never commit it.

## 3. Preview / share links

- Generate a lesson → hit **🔗 Share** → toggle **Public** → copy the link.
- The link is `‹PUBLIC_APP_URL›/p/‹lessonId›`.
- The preview page is read-only: no AI/image generation, no API cost.
- Viewer progress: guests are saved in their browser's localStorage (with a
  nickname); logged-in viewers sync to their Supabase account automatically.
  If a viewer is already logged into Lumi in the same browser, the preview is
  logged in too (shared session).

## 4. MCP connector (OAuth 2.1)

Endpoints implemented (all served natively by the app — no rewrites needed):

- `/.well-known/oauth-authorization-server` — AS metadata
- `/.well-known/oauth-protected-resource` — resource metadata
- `/api/oauth/register` — Dynamic Client Registration
- `/authorize` — consent page (logs in via Supabase, mints a code)
- `/api/oauth/token` — code + refresh grants, PKCE (S256)
- `/mcp` — Streamable-HTTP JSON-RPC, Bearer-token auth

MCP tools: `create_lesson`, `list_lessons`, `get_lesson`, `get_preview_link`.

### Connecting from Claude / ChatGPT

1. Deploy to Vercel with the env vars above. Use the **production** domain
   (not a per-commit preview URL — those change and break OAuth redirects).
2. In Claude → Settings → Connectors → Add custom connector, enter:
   `https://your-domain/mcp`
3. Claude discovers OAuth, opens `/authorize`, you log in + approve, done.
4. Ask Claude e.g. "Create a Lumi lesson about airport check-in and give me
   the share link."

### Deploy notes (Vercel)

- The project builds with **nitro**, whose default preset is Cloudflare (set by
  the Lovable config). To build for Vercel, add an env var in the Vercel project:
  **`NITRO_PRESET=vercel`**. This is the only build-config change needed — it
  does not touch the repo, so Lovable's own Cloudflare builds keep working.
- Set the other env vars from section 2 in Vercel (Production scope), especially
  `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL`, `VITE_PUBLIC_APP_URL`,
  `COACHIO_API_KEY`.
- The `.well-known/*` metadata endpoints are real app routes, so no `vercel.json`
  or rewrites are required.
- Vercel framework preset: "Other"; build command `bun run build` (or `vite build`).
- Local dev can't be reached by Claude/ChatGPT (they're cloud). Test the MCP
  logic locally with curl / the MCP Inspector, or use a tunnel (ngrok).

### Quick local smoke test

```bash
# discovery
curl localhost:8080/api/oauth/authorization-server
curl localhost:8080/api/oauth/protected-resource
# unauthenticated MCP call → 401 + WWW-Authenticate
curl -i -X POST localhost:8080/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```
