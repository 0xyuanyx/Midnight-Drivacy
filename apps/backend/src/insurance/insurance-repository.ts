import type { Pool } from "pg";

export interface InsuranceContractRow {
  id: string;
  ownerUserId: string;
  insurerName: string;
  coverageStartsAt: Date | string;
  coverageEndsAt: Date | string;
  status: string;
}

export interface SpecialContractRow {
  id: string;
  insuranceContractId: string;
  insurerName: string;
  name: string;
  isEligible: boolean;
  status: string;
}

export interface SelectionRow {
  insuranceContractId: string;
  specialContractId: string;
  selectedAt: Date | string;
}

export interface InsuranceRepository {
  listOwnedContracts(userId: string): Promise<InsuranceContractRow[]>;
  findOwnedContract(contractId: string, userId: string): Promise<InsuranceContractRow | undefined>;
  findSpecialContracts(contractIds: string[]): Promise<SpecialContractRow[]>;
  findSelectableSpecialContract(contractId: string, specialContractId: string): Promise<Pick<SpecialContractRow, "id" | "isEligible"> | undefined>;
  upsertSelection(contractId: string, specialContractId: string): Promise<SelectionRow>;
  findSelection(contractId: string): Promise<SelectionRow | undefined>;
}

export class PgInsuranceRepository implements InsuranceRepository {
  public constructor(private readonly pool: Pool) {}

  public async listOwnedContracts(userId: string): Promise<InsuranceContractRow[]> {
    const result = await this.pool.query<InsuranceContractRow>(
      `SELECT c.id,
              c.owner_user_id AS "ownerUserId",
              i.name AS "insurerName",
              c.coverage_starts_at AS "coverageStartsAt",
              c.coverage_ends_at AS "coverageEndsAt",
              c.status
       FROM public.insurance_contracts c
       INNER JOIN public.insurers i ON i.id = c.insurer_id
       WHERE c.owner_user_id = $1
       ORDER BY c.created_at ASC`,
      [userId],
    );

    return result.rows;
  }

  public async findOwnedContract(
    contractId: string,
    userId: string,
  ): Promise<InsuranceContractRow | undefined> {
    // 조회 단계부터 소유자를 조건에 포함해 타인 계약의 존재 자체를 감춘다.
    const result = await this.pool.query<InsuranceContractRow>(
      `SELECT c.id,
              c.owner_user_id AS "ownerUserId",
              i.name AS "insurerName",
              c.coverage_starts_at AS "coverageStartsAt",
              c.coverage_ends_at AS "coverageEndsAt",
              c.status
       FROM public.insurance_contracts c
       INNER JOIN public.insurers i ON i.id = c.insurer_id
       WHERE c.id = $1 AND c.owner_user_id = $2`,
      [contractId, userId],
    );

    return result.rows[0];
  }

  public async findSpecialContracts(contractIds: string[]): Promise<SpecialContractRow[]> {
    if (contractIds.length === 0) {
      return [];
    }

    // insurerName은 중복 저장하지 않고 정규화된 insurers JOIN에서 조립한다.
    const result = await this.pool.query<SpecialContractRow>(
      `SELECT s.id,
              s.insurance_contract_id AS "insuranceContractId",
              i.name AS "insurerName",
              s.name,
              s.is_eligible AS "isEligible",
              s.status
       FROM public.special_contracts s
       INNER JOIN public.insurance_contracts c ON c.id = s.insurance_contract_id
       INNER JOIN public.insurers i ON i.id = c.insurer_id
       WHERE s.insurance_contract_id = ANY($1::uuid[])
       ORDER BY s.created_at ASC`,
      [contractIds],
    );

    return result.rows;
  }

  public async findSelectableSpecialContract(
    contractId: string,
    specialContractId: string,
  ): Promise<Pick<SpecialContractRow, "id" | "isEligible"> | undefined> {
    const result = await this.pool.query<Pick<SpecialContractRow, "id" | "isEligible">>(
      `SELECT id, is_eligible AS "isEligible"
       FROM public.special_contracts
       WHERE id = $1 AND insurance_contract_id = $2`,
      [specialContractId, contractId],
    );

    return result.rows[0];
  }

  public async upsertSelection(contractId: string, specialContractId: string): Promise<SelectionRow> {
    // 특약 자체 상태와 사용자의 현재 선택은 별개이므로 selection 테이블만 원자적으로 갱신한다.
    const result = await this.pool.query<SelectionRow>(
      `INSERT INTO public.special_contract_selections (
         insurance_contract_id,
         special_contract_id,
         selected_at
       ) VALUES ($1, $2, now())
       ON CONFLICT (insurance_contract_id) DO UPDATE
       SET special_contract_id = EXCLUDED.special_contract_id,
           selected_at = EXCLUDED.selected_at
       RETURNING insurance_contract_id AS "insuranceContractId",
                 special_contract_id AS "specialContractId",
                 selected_at AS "selectedAt"`,
      [contractId, specialContractId],
    );

    return result.rows[0];
  }

  public async findSelection(contractId: string): Promise<SelectionRow | undefined> {
    const result = await this.pool.query<SelectionRow>(
      `SELECT insurance_contract_id AS "insuranceContractId",
              special_contract_id AS "specialContractId",
              selected_at AS "selectedAt"
       FROM public.special_contract_selections
       WHERE insurance_contract_id = $1`,
      [contractId],
    );

    return result.rows[0];
  }
}
