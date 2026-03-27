import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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

// ─── Agent-only internal functions ───────────────────────────────────────────

// Returns image uploads not yet processed (no description / imageProcessed != true)
export const listUnprocessedImages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("uploads").collect();
    const images = all.filter(
      (u) => u.mimeType.startsWith("image/") && !u.imageProcessed
    );
    return Promise.all(
      images.map(async (u) => ({
        _id: u._id,
        filename: u.filename,
        mimeType: u.mimeType,
        size: u.size,
        url: await ctx.storage.getUrl(u.storageId),
      }))
    );
  },
});

// Returns a short-lived upload URL for the agent to store compressed images
export const generateUploadUrlInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Replace original with agent-compressed version; store description
export const processImage = internalMutation({
  args: {
    id: v.id("uploads"),
    newStorageId: v.id("_storage"),
    description: v.string(),
    size: v.number(),
  },
  handler: async (ctx, { id, newStorageId, description, size }) => {
    const upload = await ctx.db.get(id);
    if (!upload) throw new Error("Upload not found");
    if (upload.imageProcessed) return; // idempotent
    const oldStorageId = upload.storageId;
    await ctx.db.patch(id, { storageId: newStorageId, size, description, imageProcessed: true });
    await ctx.storage.delete(oldStorageId);
  },
});

// Reset imageProcessed flag so agent re-processes (admin/debug use)
export const resetAllImageProcessed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("uploads").collect();
    const images = all.filter((u) => u.mimeType.startsWith("image/") && u.imageProcessed);
    for (const u of images) {
      await ctx.db.patch(u._id, { imageProcessed: undefined, description: undefined });
    }
    return { reset: images.length };
  },
});

// ─── Public user-facing functions ─────────────────────────────────────────────

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
