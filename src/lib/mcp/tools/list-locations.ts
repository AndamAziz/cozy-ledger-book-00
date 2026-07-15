import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_locations",
  title: "List locations",
  description: "List the signed-in user's business locations (branches) with their id, name, and address.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("locations")
      .select("id,name,address,created_at")
      .order("created_at", { ascending: true });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { locations: data ?? [] },
    };
  },
});
