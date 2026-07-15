import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listLocations from "./tools/list-locations";
import listExpenses from "./tools/list-expenses";
import listIncomes from "./tools/list-incomes";
import listSales from "./tools/list-sales";

// The OAuth issuer MUST be the direct Supabase host, built from the project
// ref so it stays import-safe (no runtime env read at module top level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "central-tech-platform-mcp",
  title: "Central Tech Platform",
  version: "0.1.0",
  instructions:
    "Tools for Central Tech Platform (CTP). Use `whoami` to confirm the signed-in account, `list_locations` to see the user's branches, and `list_expenses` / `list_incomes` / `list_sales` to read their finance records for a given month (YYYY-MM). All tools act as the signed-in user under Row Level Security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listLocations, listExpenses, listIncomes, listSales],
});
