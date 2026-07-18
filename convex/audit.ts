import { v } from "convex/values";
import { query, MutationCtx } from "./_generated/server";

/** Append-only decision trail (MOO-312). Write via logAudit from any admin mutation. */

export async function logAudit(
  ctx: MutationCtx,
  entry: { action: string; refTable: string; refId: string; detail?: string },
) {
  const identity = await ctx.auth.getUserIdentity();
  await ctx.db.insert("audit_log", {
    actor: identity?.subject ?? "system",
    ...entry,
    at: Date.now(),
  });
}

export const forRecord = query({
  args: { refTable: v.string(), refId: v.string() },
  handler: async (ctx, { refTable, refId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const role = (identity as { metadata?: { role?: string } } | null)?.metadata
      ?.role;
    if (role !== "admin") throw new Error("audit log requires the admin role");
    const rows = await ctx.db
      .query("audit_log")
      .withIndex("by_ref", (q) => q.eq("refTable", refTable).eq("refId", refId))
      .collect();
    return rows.sort((a, b) => a.at - b.at);
  },
});
