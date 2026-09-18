import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AuthRepository } from "../src/auth/auth-repository.js";
import type { AuthDependencies } from "../src/auth/auth-service.js";
import type { SupabaseAuthVerifier, VerifiedAuthUser } from "../src/auth/supabase-auth.js";
import { createApp } from "../src/app.js";
import type { ConsentRepository, ConsentRow } from "../src/consent/consent-repository.js";
import { ConsentService } from "../src/consent/consent-service.js";
import type {
  InsuranceContractRow,
  InsuranceRepository,
  SelectionRow,
  SpecialContractRow,
} from "../src/insurance/insurance-repository.js";
import { InsuranceService } from "../src/insurance/insurance-service.js";

const driverId = "b7f9c342-7e04-4bd9-b0e3-8269661db2df";
const otherDriverId = "6ee17d8c-6a6f-4d50-af63-dc4ce071b48c";

class MemoryConsentRepository implements ConsentRepository {
  private readonly consents = new Map<string, ConsentRow>();

  public async findGrantedConsent(userId: string): Promise<ConsentRow | undefined> {
    return this.consents.get(userId);
  }

  public async grantConsent(userId: string): Promise<ConsentRow> {
    const current = this.consents.get(userId);
    const consent = current ?? { consented: true, consentedAt: new Date("2026-09-18T10:00:00.000Z") };
    this.consents.set(userId, consent);
    return consent;
  }
}

class MemoryInsuranceRepository implements InsuranceRepository {
  public readonly selections = new Map<string, SelectionRow>();

  private readonly contracts: InsuranceContractRow[] = [
    {
      id: "contract-driver",
      ownerUserId: driverId,
      insurerName: "Drivacy Demo Insurance",
      coverageStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      coverageEndsAt: new Date("2026-12-31T23:59:59.000Z"),
      status: "DEMO",
    },
    {
      id: "contract-other-driver",
      ownerUserId: otherDriverId,
      insurerName: "Drivacy Demo Insurance",
      coverageStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      coverageEndsAt: new Date("2026-12-31T23:59:59.000Z"),
      status: "DEMO",
    },
  ];

  private readonly specialContracts: SpecialContractRow[] = [
    {
      id: "special-eligible-one",
      insuranceContractId: "contract-driver",
      insurerName: "Drivacy Demo Insurance",
      name: "Safe Driving Special Contract",
      isEligible: true,
      status: "DEMO",
    },
    {
      id: "special-eligible-two",
      insuranceContractId: "contract-driver",
      insurerName: "Drivacy Demo Insurance",
      name: "Alternative Demo Special Contract",
      isEligible: true,
      status: "DEMO",
    },
    {
      id: "special-ineligible",
      insuranceContractId: "contract-driver",
      insurerName: "Drivacy Demo Insurance",
      name: "Ineligible Demo Special Contract",
      isEligible: false,
      status: "DEMO",
    },
    {
      id: "special-other-contract",
      insuranceContractId: "contract-other-driver",
      insurerName: "Drivacy Demo Insurance",
      name: "Other Driver Special Contract",
      isEligible: true,
      status: "DEMO",
    },
  ];

  public async listOwnedContracts(userId: string): Promise<InsuranceContractRow[]> {
    return this.contracts.filter((contract) => contract.ownerUserId === userId);
  }

  public async findOwnedContract(
    contractId: string,
    userId: string,
  ): Promise<InsuranceContractRow | undefined> {
    return this.contracts.find(
      (contract) => contract.id === contractId && contract.ownerUserId === userId,
    );
  }

  public async findSpecialContracts(contractIds: string[]): Promise<SpecialContractRow[]> {
    return this.specialContracts.filter((specialContract) =>
      contractIds.includes(specialContract.insuranceContractId),
    );
  }

  public async findSelectableSpecialContract(
    contractId: string,
    specialContractId: string,
  ): Promise<Pick<SpecialContractRow, "id" | "isEligible"> | undefined> {
    return this.specialContracts.find(
      (specialContract) =>
        specialContract.id === specialContractId &&
        specialContract.insuranceContractId === contractId,
    );
  }

  public async upsertSelection(contractId: string, specialContractId: string): Promise<SelectionRow> {
    const selection: SelectionRow = {
      insuranceContractId: contractId,
      specialContractId,
      selectedAt: new Date("2026-09-18T10:00:00.000Z"),
    };
    this.selections.set(contractId, selection);
    return selection;
  }

  public async findSelection(contractId: string): Promise<SelectionRow | undefined> {
    return this.selections.get(contractId);
  }
}

const appFor = (role: "DRIVER" | "INSURER" = "DRIVER") => {
  const user: VerifiedAuthUser = { id: driverId, email: "driver@drivacy.test" };
  const authRepository: AuthRepository = {
    findUserId: async () => user.id,
    findRoleByUserId: async () => role,
  };
  const authVerifier: SupabaseAuthVerifier = { verifyAccessToken: async () => user };
  const authDependencies: AuthDependencies = { authRepository, supabaseAuthVerifier: authVerifier };
  const consentRepository = new MemoryConsentRepository();
  const insuranceRepository = new MemoryInsuranceRepository();
  const app = createApp({
    ...authDependencies,
    consentService: new ConsentService(consentRepository),
    insuranceService: new InsuranceService(insuranceRepository),
  });

  return { app, insuranceRepository };
};

const driverRequest = (app: ReturnType<typeof appFor>["app"]) => ({
  get: (path: string) => request(app).get(path).set("Authorization", "Bearer test-token"),
  post: (path: string) => request(app).post(path).set("Authorization", "Bearer test-token"),
  put: (path: string) => request(app).put(path).set("Authorization", "Bearer test-token"),
});

describe("consent routes", () => {
  it("rejects missing authentication and an INSURER role", async () => {
    const noAuth = await request(appFor().app).get("/consent");
    const insurer = await driverRequest(appFor("INSURER").app).get("/consent");

    expect(noAuth.status).toBe(401);
    expect(insurer.status).toBe(403);
  });

  it("returns 404 before consent and grants consent idempotently", async () => {
    const { app } = appFor();
    const missing = await driverRequest(app).get("/consent");
    const first = await driverRequest(app).post("/consent");
    const repeated = await driverRequest(app).post("/consent");

    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("CONSENT_NOT_FOUND");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ consented: true, consentedAt: "2026-09-18T10:00:00.000Z" });
    expect(repeated.body).toEqual(first.body);
  });

  it("does not accept a caller-supplied user or timestamp", async () => {
    const response = await driverRequest(appFor().app).post("/consent").send({
      userId: otherDriverId,
      consentedAt: "2026-09-18T10:00:00.000Z",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
  });
});

describe("insurance-contract routes", () => {
  it("returns only the DRIVER's contracts with joined insurer and special contracts", async () => {
    const response = await driverRequest(appFor().app).get("/insurance-contracts");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: "contract-driver",
      insurerName: "Drivacy Demo Insurance",
    });
    expect(response.body[0].specialContracts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "special-eligible-one", isEligible: true })]),
    );
  });

  it("does not expose another driver's or nonexistent contract", async () => {
    const { app } = appFor();
    const other = await driverRequest(app).get("/insurance-contracts/contract-other-driver");
    const missing = await driverRequest(app).get("/insurance-contracts/no-such-contract");

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body.code).toBe("INSURANCE_CONTRACT_NOT_FOUND");
  });

  it("returns special contracts only after the owning contract is authorized", async () => {
    const { app } = appFor();
    const owned = await driverRequest(app).get("/insurance-contracts/contract-driver/special-contracts");
    const other = await driverRequest(app).get("/insurance-contracts/contract-other-driver/special-contracts");

    expect(owned.status).toBe(200);
    expect(owned.body).toHaveLength(3);
    expect(other.status).toBe(404);
  });
});

describe("special-contract selection routes", () => {
  it("creates then atomically replaces the one current selection", async () => {
    const { app, insuranceRepository } = appFor();
    const first = await driverRequest(app)
      .put("/insurance-contracts/contract-driver/special-contract-selection")
      .send({ specialContractId: "special-eligible-one" });
    const second = await driverRequest(app)
      .put("/insurance-contracts/contract-driver/special-contract-selection")
      .send({ specialContractId: "special-eligible-two" });
    const current = await driverRequest(app).get(
      "/insurance-contracts/contract-driver/special-contract-selection",
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(insuranceRepository.selections.size).toBe(1);
    expect(current.body).toEqual({
      insuranceContractId: "contract-driver",
      specialContractId: "special-eligible-two",
      selectedAt: "2026-09-18T10:00:00.000Z",
    });
  });

  it("rejects missing, foreign, and ineligible special contracts", async () => {
    const { app } = appFor();
    const missingSelection = await driverRequest(app).get(
      "/insurance-contracts/contract-driver/special-contract-selection",
    );
    const foreign = await driverRequest(app)
      .put("/insurance-contracts/contract-driver/special-contract-selection")
      .send({ specialContractId: "special-other-contract" });
    const ineligible = await driverRequest(app)
      .put("/insurance-contracts/contract-driver/special-contract-selection")
      .send({ specialContractId: "special-ineligible" });

    expect(missingSelection.status).toBe(404);
    expect(missingSelection.body.code).toBe("SPECIAL_CONTRACT_SELECTION_NOT_FOUND");
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("SPECIAL_CONTRACT_NOT_FOUND");
    expect(ineligible.status).toBe(409);
    expect(ineligible.body.code).toBe("SPECIAL_CONTRACT_NOT_ELIGIBLE");
  });
});
