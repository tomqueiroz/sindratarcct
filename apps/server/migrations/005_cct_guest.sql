-- Visitor requests are separate from historical account-owned records.
CREATE TABLE IF NOT EXISTS cct_guest_requests (
  id TEXT PRIMARY KEY,
  idempotencyKey TEXT NOT NULL UNIQUE,
  requestHash TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  companyName TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  email TEXT NOT NULL,
  municipality TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'SP' CHECK(state='SP'),
  primaryCnae TEXT NOT NULL,
  secondaryCnaes TEXT NOT NULL,
  documentId TEXT NOT NULL,
  documentTitle TEXT NOT NULL,
  base TEXT NOT NULL,
  priceCents INTEGER NOT NULL CHECK(priceCents=6911),
  status TEXT NOT NULL DEFAULT 'homologacao' CHECK(status='homologacao'),
  operatorNote TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cct_guest_date ON cct_guest_requests(createdAt);
CREATE TABLE IF NOT EXISTS cct_guest_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expiresAt TEXT NOT NULL
);
