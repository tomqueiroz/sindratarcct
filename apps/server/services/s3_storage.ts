import { apiFailure } from "@repo/shared/http";
import {
  DatabaseError,
  findStorageFileById,
  findStorageFileByIdForUser,
  findStorageFileByPath,
  insertStorageFile,
  type StorageFileRecord,
  updateStorageFile
} from "../_core/db";
import { env } from "../_core/env";

export type StorageFileStatus = "pending" | "uploaded" | "failed" | "deleted";

export type StoredFile = {
  id: string;
  key: string;
  path: string;
  url: string;
  downloadUrl: string;
  userId: string | null;
  fileName: string;
  fileSuffix: string;
  contentType: string;
  fileSize: number;
  status: StorageFileStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type SignedStorageFile = {
  objectKey: string;
  sourceUrl: string;
  expiredUrl: string;
  expiresSeconds: number;
};

type GatewayUploadItem = {
  id: string;
  file_name: string;
  file_suffix: string;
  file_size: number;
  object_key: string;
  oss_url: string;
  download_url: string;
  method: string;
  form_data: Record<string, string>;
};

type GatewayEnvelope = {
  code: number;
  message: string;
  data?: {
    items?: GatewayUploadItem[];
  } | null;
  trace_id?: string;
};

type GatewayDeleteEnvelope = {
  code: number;
  message: string;
  data?: unknown;
  trace_id?: string;
};

type GatewayFileSignEnvelope = {
  code: number;
  message: string;
  data?: {
    object_key?: string;
    source_url?: string;
    expired_url?: string;
    expires_seconds?: number;
  } | null;
  trace_id?: string;
};

export class StorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type StorageErrorStatus = 400 | 404 | 502 | 503;

function getGatewayConfig() {
  if (!env.SKYWORK_GATEWAY_BASE_URL || !env.SKYWORK_API_TOKEN) {
    throw new StorageError(
      "STORAGE_CONFIG_MISSING",
      "Storage config missing: set SKYWORK_GATEWAY_BASE_URL and SKYWORK_API_TOKEN",
      503
    );
  }

  return {
    gatewayUrl: env.SKYWORK_GATEWAY_BASE_URL.replace(/\/+$/, ""),
    ak: env.SKYWORK_API_TOKEN
  };
}

function normalizeContentType(contentType?: string) {
  const value = contentType?.trim();
  return value && value.includes("/") ? value : "application/octet-stream";
}

function normalizeFileName(relKey: string) {
  const trimmed = relKey.trim().replace(/^\/+/, "");
  const fileName = trimmed.split(/[\\/]/).filter(Boolean).pop();
  return fileName && fileName !== "." && fileName !== ".." ? fileName : undefined;
}

function fileSuffixFromName(relKey: string) {
  const fileName = normalizeFileName(relKey);
  const lastDot = fileName?.lastIndexOf(".") ?? -1;
  const suffix = lastDot >= 0 ? fileName?.slice(lastDot + 1) : undefined;
  const normalized = suffix?.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return normalized || "bin";
}

function dataSize(data: Buffer | Uint8Array | string) {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).byteLength;
  }
  return data.byteLength;
}

function toBlob(data: Buffer | Uint8Array | string, contentType: string) {
  if (typeof data === "string") {
    return new Blob([data], { type: contentType });
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Blob([bytes], { type: contentType });
}

function toStoredFile(row: StorageFileRecord): StoredFile {
  return {
    id: row.id,
    key: row.objectKey,
    path: row.path,
    url: row.downloadUrl,
    downloadUrl: row.downloadUrl,
    userId: row.userId,
    fileName: row.fileName,
    fileSuffix: row.fileSuffix,
    contentType: row.contentType,
    fileSize: row.fileSize,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function requestUploadItem(relKey: string, fileSize: number, contentType: string) {
  const { gatewayUrl, ak } = getGatewayConfig();
  const signUrl = new URL("/gateway/api/wb/s3_file_get", `${gatewayUrl}/`);

  const resp = await fetch(signUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ak,
      files: [
        {
          file_suffix: fileSuffixFromName(relKey),
          file_size: fileSize,
          file_name: normalizeFileName(relKey),
          content_type: contentType
        }
      ]
    })
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new StorageError("STORAGE_SIGN_FAILED", `Storage sign request failed (${resp.status}): ${msg}`, 502);
  }

  const envelope = (await resp.json()) as GatewayEnvelope;
  if (envelope.code !== 0) {
    throw new StorageError("STORAGE_SIGN_FAILED", `Storage sign failed: ${envelope.message}`, 502);
  }

  const item = envelope.data?.items?.[0];
  if (!item?.oss_url || !item.download_url || !item.object_key || !item.form_data) {
    throw new StorageError("STORAGE_SIGN_INVALID", "Storage sign response is missing upload fields", 502);
  }

  return item;
}

async function requestDelete(paths: string[]) {
  const { gatewayUrl, ak } = getGatewayConfig();
  const deleteUrl = new URL("/gateway/api/wb/s3_file_delete", `${gatewayUrl}/`);

  const resp = await fetch(deleteUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ak,
      paths
    })
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new StorageError("STORAGE_DELETE_FAILED", `Storage delete request failed (${resp.status}): ${msg}`, 502);
  }

  const envelope = (await resp.json()) as GatewayDeleteEnvelope;
  if (envelope.code !== 0) {
    throw new StorageError("STORAGE_DELETE_FAILED", `Storage delete failed: ${envelope.message}`, 502);
  }
}

export async function storageSignDownloadUrl(
  downloadUrl: string,
  expiresSeconds = 3600
): Promise<SignedStorageFile> {
  const normalizedDownloadUrl = downloadUrl.trim();
  if (!normalizedDownloadUrl) {
    throw new StorageError("STORAGE_DOWNLOAD_URL_REQUIRED", "Storage download URL is required", 400);
  }
  if (!Number.isInteger(expiresSeconds) || expiresSeconds <= 0) {
    throw new StorageError("STORAGE_EXPIRES_SECONDS_INVALID", "Storage expires seconds must be a positive integer", 400);
  }

  const { gatewayUrl, ak } = getGatewayConfig();
  const signUrl = new URL("/gateway/api/wb/s3_file_sign", `${gatewayUrl}/`);
  const resp = await fetch(signUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ak,
      download_url: normalizedDownloadUrl,
      expires_seconds: expiresSeconds
    })
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new StorageError(
      "STORAGE_DOWNLOAD_SIGN_FAILED",
      `Storage download sign request failed (${resp.status}): ${msg}`,
      502
    );
  }

  const envelope = (await resp.json()) as GatewayFileSignEnvelope;
  if (envelope.code !== 0) {
    throw new StorageError("STORAGE_DOWNLOAD_SIGN_FAILED", `Storage download sign failed: ${envelope.message}`, 502);
  }

  const data = envelope.data;
  const responseExpiresSeconds = data?.expires_seconds;
  if (
    !data?.object_key ||
    !data.source_url ||
    !data.expired_url ||
    typeof responseExpiresSeconds !== "number" ||
    !Number.isInteger(responseExpiresSeconds)
  ) {
    throw new StorageError(
      "STORAGE_DOWNLOAD_SIGN_INVALID",
      "Storage download sign response is missing required fields",
      502
    );
  }

  return {
    objectKey: data.object_key,
    sourceUrl: data.source_url,
    expiredUrl: data.expired_url,
    expiresSeconds: responseExpiresSeconds
  };
}

async function createPendingRecord(userId: string | null, item: GatewayUploadItem, contentType: string) {
  return insertStorageFile({
    userId,
    gatewayFileId: item.id,
    fileName: item.file_name,
    fileSuffix: item.file_suffix,
    contentType,
    fileSize: item.file_size,
    objectKey: item.object_key,
    path: item.object_key,
    downloadUrl: item.download_url,
    status: "pending"
  });
}

async function markRecordUploaded(id: string) {
  return updateStorageFile(id, {
    status: "uploaded",
    errorMessage: null,
    updatedAt: new Date().toISOString()
  });
}

async function markRecordFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Storage upload failed";
  return updateStorageFile(id, {
    status: "failed",
    errorMessage: message,
    updatedAt: new Date().toISOString()
  });
}

async function markRecordDeleted(id: string) {
  return updateStorageFile(id, {
    status: "deleted",
    errorMessage: null,
    updatedAt: new Date().toISOString()
  });
}

async function uploadToOss(item: GatewayUploadItem, data: Buffer | Uint8Array | string, contentType: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(item.form_data)) {
    form.append(key, value);
  }
  form.append("file", toBlob(data, contentType), item.file_name);

  const uploadResp = await fetch(item.oss_url, {
    method: item.method || "POST",
    body: form
  });

  if (!uploadResp.ok) {
    const msg = await uploadResp.text().catch(() => uploadResp.statusText);
    throw new StorageError("STORAGE_UPLOAD_FAILED", `Storage upload to OSS failed (${uploadResp.status}): ${msg}`, 502);
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  options: { userId?: string | null } = {}
): Promise<StoredFile> {
  const normalizedContentType = normalizeContentType(contentType);
  const size = dataSize(data);
  if (size <= 0) {
    throw new StorageError("STORAGE_FILE_EMPTY", "File content is empty", 400);
  }

  const item = await requestUploadItem(relKey, size, normalizedContentType);
  const pending = await createPendingRecord(options.userId ?? null, item, normalizedContentType);

  try {
    await uploadToOss(item, data, normalizedContentType);
    return toStoredFile(await markRecordUploaded(pending.id));
  } catch (error) {
    await markRecordFailed(pending.id, error).catch(() => undefined);
    throw error;
  }
}

export async function storageGet(id: string): Promise<StoredFile> {
  const row = await findStorageFileById(id);
  if (!row) {
    throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  }

  return toStoredFile(row);
}

export async function storageGetForUser(id: string, userId: string): Promise<StoredFile> {
  const row = await findStorageFileByIdForUser(id, userId);
  if (!row) {
    throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  }

  return toStoredFile(row);
}

export async function storageDeleteForUser(id: string, userId: string): Promise<StoredFile> {
  const file = await storageGetForUser(id, userId);
  if (file.status === "deleted") {
    return file;
  }

  await requestDelete([file.path]);
  return toStoredFile(await markRecordDeleted(id));
}

export async function storageGetByPath(path: string): Promise<StoredFile> {
  const normalizedPath = path.trim().replace(/^\/+/, "");
  const row = await findStorageFileByPath(normalizedPath);
  if (!row) {
    throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  }

  return toStoredFile(row);
}

export async function storageGetDownloadUrl(id: string): Promise<string> {
  return (await storageGet(id)).downloadUrl;
}

export function storageErrorResponse(error: StorageError | DatabaseError) {
  const status: StorageErrorStatus =
    error.status === 404 ? 404 : error.status === 400 ? 400 : error.status === 503 ? 503 : 502;

  return {
    body: apiFailure(error.code, error.message),
    status
  };
}
