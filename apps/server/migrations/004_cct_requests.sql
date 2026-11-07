CREATE TABLE IF NOT EXISTS cct_requests (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id),
  idempotencyKey TEXT NOT NULL,
  companyName TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  email TEXT NOT NULL,
  municipality TEXT NOT NULL,
  primaryCnae TEXT NOT NULL,
  secondaryCnaes TEXT NOT NULL,
  documentId TEXT NOT NULL,
  documentTitle TEXT NOT NULL,
  base TEXT NOT NULL,
  priceCents INTEGER NOT NULL CHECK(priceCents = 6911),
  status TEXT NOT NULL DEFAULT 'homologacao' CHECK(status = 'homologacao'),
  operatorNote TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cct_user ON cct_requests(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cct_idempotency ON cct_requests(userId, idempotencyKey);
