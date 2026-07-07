import { createFileRoute } from "@tanstack/react-router";
import { serverBaseUrl, json } from "@/lib/oauth";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = serverBaseUrl(request);
        return json({
          resource: `${base}/mcp`,
          authorization_servers: [base],
          scopes_supported: ["lumi.read", "lumi.write"],
          bearer_methods_supported: ["header"],
        });
      },
    },
  },
});
