import { Hono, type Context } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { protectedRoute } from "../_core/route-helpers";
import {
  PlatformAIError,
  requestPlatformAIChat,
  requestPlatformAIChatStream,
  requestPlatformAIImage
} from "../services/platform-ai";

const SceneKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .refine((sceneKey) => !sceneKey.endsWith("_") && !sceneKey.includes("__"));

const MessageContentSchema = z.union([
  z.string(),
  z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("image_url"),
          image_url: z.object({ url: z.string().url() })
        })
      ])
    )
    .min(1)
    .max(20)
]);

const ChatRequestSchema = z.object({
  scene_key: SceneKeySchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: MessageContentSchema
      })
    )
    .min(1)
    .max(50),
  stream: z.boolean().optional().default(false)
});

const ImageRequestSchema = z.object({
  scene_key: SceneKeySchema,
  prompt: z.string().trim().min(1).max(10_000),
  n: z.literal(1).optional().default(1),
  size: z.string().trim().regex(/^\d{2,5}x\d{2,5}$/).optional().default("1024x1024")
});

export const aiRouter = new Hono();

const chatHandler = async (c: Context) => {
  const parsed = ChatRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid AI chat input"), 400);
  }

  try {
    if (parsed.data.stream) {
      const upstream = await requestPlatformAIChatStream({
        sceneKey: parsed.data.scene_key,
        messages: parsed.data.messages
      });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8",
          "Cache-Control": upstream.headers.get("Cache-Control") ?? "no-cache",
          "X-Accel-Buffering": "no"
        }
      });
    }

    const result = await requestPlatformAIChat({
      sceneKey: parsed.data.scene_key,
      messages: parsed.data.messages
    });
    // TODO: Persist AI interaction and scene_key business metadata after the product layer defines the write policy.
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    throw error;
  }
};

const imageHandler = async (c: Context) => {
  const parsed = ImageRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid AI image input"), 400);
  }

  try {
    const result = await requestPlatformAIImage({
      sceneKey: parsed.data.scene_key,
      prompt: parsed.data.prompt,
      n: parsed.data.n,
      size: parsed.data.size
    });
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    throw error;
  }
};

aiRouter.post("", protectedRoute, chatHandler);
aiRouter.post("/", protectedRoute, chatHandler);
aiRouter.post("/images", protectedRoute, imageHandler);
aiRouter.post("/images/", protectedRoute, imageHandler);
