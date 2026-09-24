import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";

import {
  CalculateTripRequestSchema, TripProcessingResultSchema,
  type CalculateTripRequest, type TripProcessingResult,
} from "../../shared/src/bc-contract.js";
import type { ApprovalRequest } from "../src/trip-job.js";

const capabilityClaims = z.object({
  operationId: z.string().min(1).max(256), approvalRequestId: z.string().uuid(),
  transactionDigest: z.string().regex(/^[0-9a-f]{64}$/i), network: z.string().min(1).max(128),
  chainContractAddress: z.string().min(1).max(512), expiresAt: z.number().int().positive(),
}).strict();
const approvalCallback = z.object({
  decision: z.enum(["approved", "cancelled"]),
  transactionDigest: z.string().regex(/^[0-9a-f]{64}$/i),
  phase: z.enum(["balanced", "submitted"]).optional(),
  // This is the wallet-produced, signed transaction. It is public transaction
  // data, not wallet key material; C derives the chain ID from it with the SDK.
  balancedTransactionHex: z.string().regex(/^(?:[0-9a-f]{2})+$/i).optional(),
  localSubmissionReference: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "cancelled" && (value.phase || value.balancedTransactionHex || value.localSubmissionReference)) {
    context.addIssue({ code: "custom", message: "CANCELLED_CALLBACK_MUST_NOT_INCLUDE_SUBMISSION_DATA" });
  }
  if (value.decision === "approved" && value.phase === "balanced" && !value.balancedTransactionHex) {
    context.addIssue({ code: "custom", message: "BALANCED_TRANSACTION_REQUIRED" });
  }
  if (value.decision === "approved" && value.phase === "submitted" && value.balancedTransactionHex) {
    context.addIssue({ code: "custom", message: "SUBMITTED_CALLBACK_MUST_NOT_REPLACE_TRANSACTION" });
  }
  if (value.decision === "approved" && !value.phase) context.addIssue({ code: "custom", message: "APPROVAL_PHASE_REQUIRED" });
});

export type BrowserApprovalCapability = z.infer<typeof capabilityClaims>;
export type BrowserApprovalCallback = z.infer<typeof approvalCallback>;

/**
 * The real C execution module owns its private journal, witness and chain
 * observation. This HTTP host deliberately does not accept any of them from
 * either B or the browser.
 */
export interface CWalletProcessingRuntime {
  saveSource(request: CalculateTripRequest): Promise<string>;
  loadSource(sourceKey: string): Promise<CalculateTripRequest>;
  deleteSource(sourceKey: string): Promise<void>;
  startTrip(request: CalculateTripRequest): Promise<TripProcessingResult>;
  retryTemporaryFailure(request: CalculateTripRequest): Promise<TripProcessingResult>;
  getTripStatus(operationId: string): Promise<TripProcessingResult>;
  canAbandonTrip(operationId: string): Promise<boolean>;
  getBrowserApproval(operationId: string): Promise<{
    request: ApprovalRequest;
    transactionHex: string;
    transactionDigest: string;
    phase: "balance" | "submit";
    balancedTransactionHex?: string;
    walletServices?: { indexer: string; indexerWS: string; proof: string; node: string };
  } | undefined>;
  receiveBrowserApproval(input: {
    request: ApprovalRequest;
    transactionDigest: string;
    callback: BrowserApprovalCallback;
  }): Promise<void>;
}

export class BrowserApprovalCapabilitySigner {
  public constructor(private readonly secret: string, private readonly now: () => number = Date.now) {
    if (Buffer.byteLength(secret) < 32) throw new Error("C_BROWSER_APPROVAL_TOKEN_SECRET must contain at least 32 bytes");
  }
  issue(claims: Omit<BrowserApprovalCapability, "expiresAt">, ttlMs = 5 * 60_000): string {
    const payload = { ...claims, expiresAt: this.now() + ttlMs };
    const encoded = Buffer.from(JSON.stringify(capabilityClaims.parse(payload))).toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }
  verify(token: string): BrowserApprovalCapability {
    const [encoded, supplied, ...extra] = token.split(".");
    if (!encoded || !supplied || extra.length) throw new Error("INVALID_APPROVAL_CAPABILITY");
    const expected = this.sign(encoded);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new Error("INVALID_APPROVAL_CAPABILITY");
    }
    const claims = capabilityClaims.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (claims.expiresAt <= this.now()) throw new Error("EXPIRED_APPROVAL_CAPABILITY");
    return claims;
  }
  private sign(value: string): string { return createHmac("sha256", this.secret).update(value).digest("base64url"); }
}

export interface CWalletHttpOptions {
  internalAdapterToken: string;
  browserCapabilitySigner: BrowserApprovalCapabilitySigner;
  runtime: CWalletProcessingRuntime;
}

const json = (response: ServerResponse, status: number, value?: unknown) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(value === undefined ? undefined : JSON.stringify(value));
};
const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const pieces: Buffer[] = [];
  for await (const piece of request) pieces.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece));
  if (Buffer.concat(pieces).length > 1_000_000) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(Buffer.concat(pieces).toString("utf8"));
};
const bearer = (request: IncomingMessage) => request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
const operation = (pathname: string, suffix = "") => decodeURIComponent(pathname.slice("/trip-processing/".length, suffix ? -suffix.length : undefined));

/** Exact B adapter paths plus a separately authorized browser-only approval surface. */
export function createCWalletHttpServer(options: CWalletHttpOptions): Server {
  if (!options.internalAdapterToken.trim()) throw new Error("C_WALLET_ADAPTER_TOKEN must be configured");
  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = url.pathname;
      const internal = bearer(request) === options.internalAdapterToken;
      if (path.startsWith("/browser/")) {
        const approvalSuffix = "/approval";
        const operationId = decodeURIComponent(path.slice("/browser/trip-processing/".length,
          path.endsWith(approvalSuffix) ? -approvalSuffix.length : undefined));
        const claims = options.browserCapabilitySigner.verify(bearer(request) ?? "");
        if (claims.operationId !== operationId) throw new Error("APPROVAL_OPERATION_MISMATCH");
        const approval = await options.runtime.getBrowserApproval(operationId);
        if (!approval || approval.request.approvalRequestId !== claims.approvalRequestId
          || approval.transactionDigest !== claims.transactionDigest || approval.request.network !== claims.network
          || approval.request.chainContractAddress !== claims.chainContractAddress) throw new Error("APPROVAL_NOT_PENDING");
        if (method === "GET") return json(response, 200, { operationId,
          status: approval.phase === "balance" ? "awaiting-wallet-approval" : "chain-unknown",
          approvalRequestId: approval.request.approvalRequestId, tripId: approval.request.tripId, network: approval.request.network,
          chainContractAddress: approval.request.chainContractAddress, step: approval.request.step,
          previousStateCommitment: approval.request.previousStateCommitment,
          newStateCommitment: approval.request.newStateCommitment,
          phase: approval.phase, transactionHex: approval.transactionHex,
          balancedTransactionHex: approval.balancedTransactionHex, transactionDigest: approval.transactionDigest,
          walletServices: approval.walletServices });
        if (method === "POST" && path.endsWith("/approval")) {
          const callback = approvalCallback.parse(await readJson(request));
          if (callback.transactionDigest !== approval.transactionDigest) throw new Error("APPROVAL_DIGEST_MISMATCH");
          await options.runtime.receiveBrowserApproval({ request: approval.request, transactionDigest: approval.transactionDigest, callback });
          return json(response, 204);
        }
        return json(response, 404, { error: "NOT_FOUND" });
      }
      if (!internal) return json(response, 401, { error: "UNAUTHORIZED" });
      if (method === "POST" && path === "/trip-sources") {
        const sourceKey = await options.runtime.saveSource(CalculateTripRequestSchema.parse(await readJson(request)));
        return json(response, 200, { sourceKey });
      }
      if (path.startsWith("/trip-sources/")) {
        const sourceKey = decodeURIComponent(path.slice("/trip-sources/".length));
        if (method === "GET") return json(response, 200, await options.runtime.loadSource(sourceKey));
        if (method === "DELETE") { await options.runtime.deleteSource(sourceKey); return json(response, 204); }
      }
      if (method === "POST" && path === "/trip-processing/start") return json(response, 200,
        await options.runtime.startTrip(CalculateTripRequestSchema.parse(await readJson(request))));
      if (method === "POST" && path === "/trip-processing/retry") return json(response, 200,
        await options.runtime.retryTemporaryFailure(CalculateTripRequestSchema.parse(await readJson(request))));
      if (method === "GET" && path.endsWith("/can-abandon") && path.startsWith("/trip-processing/")) {
        return json(response, 200, { safe: await options.runtime.canAbandonTrip(operation(path, "/can-abandon")) });
      }
      if (method === "GET" && path.startsWith("/trip-processing/")) return json(response, 200,
        await options.runtime.getTripStatus(operation(path)));
      return json(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_REQUEST";
      const status = /^(INVALID_APPROVAL_CAPABILITY|EXPIRED_APPROVAL_CAPABILITY|APPROVAL_)/.test(message) ? 403 : 400;
      return json(response, status, { error: message });
    }
  });
}
