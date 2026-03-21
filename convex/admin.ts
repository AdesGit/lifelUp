import { internalMutation } from "./_generated/server";

export const deleteAllUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const accounts = await ctx.db.query("authAccounts").collect();
    const sessions = await ctx.db.query("authSessions").collect();
    const verificationCodes = await ctx.db.query("authVerificationCodes").collect();
    const rateLimits = await ctx.db.query("authRateLimits").collect();

    for (const r of rateLimits) await ctx.db.delete(r._id);
    for (const v of verificationCodes) await ctx.db.delete(v._id);
    for (const s of sessions) await ctx.db.delete(s._id);
    for (const a of accounts) await ctx.db.delete(a._id);
    for (const u of users) await ctx.db.delete(u._id);

    return { deleted: { users: users.length, accounts: accounts.length, sessions: sessions.length } };
  },
});
