import { ConsentSchema, type Consent } from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type { ConsentRepository, ConsentRow } from "./consent-repository.js";

const toConsent = (row: ConsentRow): Consent => {
  const consentedAt = row.consentedAt instanceof Date ? row.consentedAt.toISOString() : row.consentedAt;
  const consent = ConsentSchema.safeParse({ consented: row.consented, consentedAt });

  if (!consent.success) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Stored consent data is invalid", 500);
  }

  return consent.data;
};

export class ConsentService {
  public constructor(private readonly repository: ConsentRepository) {}

  public async getConsent(userId: string): Promise<Consent> {
    const consent = await this.repository.findGrantedConsent(userId);
    if (!consent) {
      throw new AppError("CONSENT_NOT_FOUND", "No consent has been recorded for this user", 404);
    }

    return toConsent(consent);
  }

  public async grantConsent(userId: string): Promise<Consent> {
    return toConsent(await this.repository.grantConsent(userId));
  }
}
