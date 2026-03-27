import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Step 1 of upload flow: returns a short-lived POST URL for direct file upload
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: after POSTing the file to the upload URL, save metadata
export const confirmUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    todoId: v.optional(v.id("todos")),
  },
  handler: async (ctx, { storageId, filename, mimeType, size, todoId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("uploads", {
      userId,
      uploadedAt: Date.now(),
      todoId,
      filename,
      mimeType,
      size,
      storageId,
    });
  },
});

// Returns all uploads for the current user, newest first, with download URLs
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return Promise.all(
      uploads.map(async (u) => ({
        ...u,
        url: await ctx.storage.getUrl(u.storageId),
      }))
    );
  },
});

// Returns uploads for a specific todo (owned by the current user only)
export const listByTodo = query({
  args: { todoId: v.id("todos") },
  handler: async (ctx, { todoId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_todo", (q) => q.eq("todoId", todoId))
      .collect();
    const mine = uploads.filter((u) => u.userId === userId);
    return Promise.all(
      mine.map(async (u) => ({
        ...u,
        url: await ctx.storage.getUrl(u.storageId),
      }))
    );
  },
});

// Delete upload: removes from Convex storage AND the uploads table
export const remove = mutation({
  args: { id: v.id("uploads") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const upload = await ctx.db.get(id);
    if (!upload || upload.userId !== userId) throw new Error("Not found");
    await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(id);
  },
});
