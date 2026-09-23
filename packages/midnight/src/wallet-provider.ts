import type { ApprovalRequest, WalletApproval } from "./trip-job.js";

export type WalletApprovalDecision = "approved" | "cancelled";

/** C-local acknowledgement; it is never a Shared chain transaction ID. */
export interface WalletSubmissionResult {
  localSubmissionReference: string;
}

/**
 * 증명된 거래와 가입자 월렛 사이의 브라우저 측 경계다.
 * 어떤 구현도 private key, seed, secretKey를 반환하거나 서버로 전달해서는 안 된다.
 */
export interface UserWalletProvider {
  connect(): Promise<void>;
  initialize(): Promise<void>;
  requestApproval(input: ApprovalRequest): Promise<WalletApprovalDecision>;
  approveTransaction(input: ApprovalRequest & {
    transactionHex: string;
    transactionDigest: string;
  }): Promise<WalletApprovalDecision>;
  balance(transactionHex: string, approvalRequestId: string): Promise<string>;
  submit(transactionHex: string): Promise<WalletSubmissionResult>;
  cancel(approvalRequestId: string): Promise<void>;
  disconnect(): Promise<void>;
}

/** 실제 가입자 Provider의 승인 UI를 TripJob의 승인 대기 경계에 연결한다. */
export class UserWalletApproval implements WalletApproval {
  constructor(private readonly provider: Pick<UserWalletProvider, "requestApproval">) {}

  request(input: ApprovalRequest): Promise<WalletApprovalDecision> {
    return this.provider.requestApproval(input);
  }
}

/** 개발/검증용 local browser wallet의 승인 UI를 같은 TripJob 경계에 연결한다. */
export class LocalBrowserWalletApproval implements WalletApproval {
  constructor(private readonly requestApproval: (input: ApprovalRequest & {
    transactionDigest?: string;
  }) => Promise<WalletApprovalDecision>) {}

  request(input: ApprovalRequest): Promise<WalletApprovalDecision> {
    return this.requestApproval(input);
  }

  requestTransaction(input: ApprovalRequest & { transactionDigest: string }): Promise<WalletApprovalDecision> {
    return this.requestApproval(input);
  }
}
