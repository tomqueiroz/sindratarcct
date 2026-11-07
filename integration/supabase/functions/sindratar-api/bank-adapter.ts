export type Charge = {
  orderId: string; reference: string; amountCents: number; currency: "BRL";
  expiresAt: string; idempotencyKey: string;
};
export type VerifiedBankEvent = {
  verified: true; provider: string; eventId: string; payloadHash: string;
  orderId: string; transactionId: string; reference: string;
  amountCents: number; currency: "BRL"; paidAt: string;
};
export interface BankAdapter {
  readonly ready: boolean;
  createCharge(input: Charge): Promise<{ providerChargeId: string; instructions: unknown }>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<VerifiedBankEvent>;
  reconcile(providerChargeId: string): Promise<VerifiedBankEvent>;
}
// Deliberately no endpoint/signature guessed for an unspecified Itaú product.
export class ContractRequired implements BankAdapter {
  readonly ready = false;
  private unavailable(): never { throw Object.assign(new Error("BANK_PRODUCT_NOT_CONFIGURED"),
    { code: "BANK_PRODUCT_NOT_CONFIGURED", status: 503 }); }
  async createCharge(_input: Charge): Promise<never> { return this.unavailable(); }
  async verifyWebhook(_raw: Uint8Array, _headers: Headers): Promise<never> { return this.unavailable(); }
  async reconcile(_id: string): Promise<never> { return this.unavailable(); }
}
