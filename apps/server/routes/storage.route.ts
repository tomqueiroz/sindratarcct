import { Hono, type Context } from "hono";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { protectedRoute } from "../_core/route-helpers";
import { StorageError, storageDeleteForUser, storageErrorResponse, storageGetForUser, storagePut } from "../services/s3_storage";

export const storageRouter = new Hono();

function toErrorResponse(error: unknown) {
  if (error instanceof StorageError || error instanceof DatabaseError) {
    return storageErrorResponse(error);
  }

  throw error;
}

const uploadHandler = async (c: Context) => {
  const user = c.var.currentUser;

  let body: FormData;
  try {
    body = await c.req.formData();
  } catch {
    return c.json(apiFailure("INVALID_INPUT", "Expected multipart/form-data"), 400);
  }

  const file = body.get("file");
  if (!(file instanceof File)) {
    return c.json(apiFailure("INVALID_INPUT", "File is required"), 400);
  }

  const requestedPath = body.get("path");
  const relKey = typeof requestedPath === "string" && requestedPath.trim() ? requestedPath : file.name;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const storedFile = await storagePut(relKey, bytes, file.type, { userId: user.id });
    return c.json(apiSuccess({ file: storedFile }), 200);
  } catch (error) {
    const { body: errorBody, status } = toErrorResponse(error);
    return c.json(errorBody, status);
  }
};

storageRouter.post("", protectedRoute, uploadHandler);
storageRouter.post("/", protectedRoute, uploadHandler);

storageRouter.get("/:id", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageGetForUser(c.req.param("id"), user.id);
    return c.json(apiSuccess({ file }), 200);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});

storageRouter.get("/:id/download", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageGetForUser(c.req.param("id"), user.id);
    if (file.status !== "uploaded") {
      return c.json(apiFailure("STORAGE_FILE_NOT_UPLOADED", "Storage file is not uploaded"), 409);
    }

    return c.redirect(file.downloadUrl, 302);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});

storageRouter.delete("/:id", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageDeleteForUser(c.req.param("id"), user.id);
    return c.json(apiSuccess({ file }), 200);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});
