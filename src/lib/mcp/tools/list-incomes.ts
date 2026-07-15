import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_incomes",
  title: "List incomes",
  description: "List the signed-in user's incomes for a given month (YYYY-MM), optionally filtered by location. Returns up to 500 rows sorted by day.",
  inputSchema: {
    month_key: z.string().regex(/^\d{4}-\d{2}$/).describe("Month in YYYY-MM format, e.g. '2026-07'."),
    location_id: z.string().uuid().optional().describe("Optional location UUID to filter by."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month_key, location_id }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("incomes")
      .select("*")
      .eq("month_key", month_key)
      .order("day", { ascending: true })
      .limit(500);
    if (location_id) q = q.eq("location_id", location_id);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { month_key, incomes: data ?? [] },
    };
  },
});
