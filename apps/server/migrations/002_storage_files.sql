-- 002_storage_files.sql — records files uploaded through the server-side OSS proxy.
CREATE TABLE IF NOT EXISTS storage_files (
  id            TEXT    PRIMARY KEY,
  userId        TEXT,
  gatewayFileId TEXT,
  fileName      TEXT    NOT NULL,
  fileSuffix    TEXT    NOT NULL,
  contentType   TEXT    NOT NULL DEFAULT 'application/octet-stream',
  fileSize      INTEGER NOT NULL,
  objectKey     TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  downloadUrl   TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed', 'deleted')),
  errorMessage  TEXT,
  createdAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_files_userId ON storage_files (userId);
CREATE INDEX IF NOT EXISTS idx_storage_files_objectKey ON storage_files (objectKey);
CREATE INDEX IF NOT EXISTS idx_storage_files_status ON storage_files (status);
