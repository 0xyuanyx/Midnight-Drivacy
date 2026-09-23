import { describe, expect, it } from "vitest";
import {
  LocalBrowserWalletApproval,
  UserWalletApproval,
  type UserWalletProvider,
} from "../src/wallet-provider.js";
import type { ApprovalRequest } from "../src/trip-job.js";

const request: ApprovalRequest = {
  approvalRequestId: "approval-1", operationId: "operation-1", tripId: "trip-1",
  network: "local", chainContractAddress: "contract-1", step: "beginTrip",
  previousStateCommitment: "previous", newStateCommitment: "next",
};

describe("wallet approval provider boundary", () => {
  it("passes the complete TripJob approval identity to the local browser approval UI", async () => {
    const local = new LocalBrowserWalletApproval(async input => {
      expect(input).toEqual(request);
      return "approved";
    });

    await expect(local.request(request)).resolves.toBe("approved");
  });

  it("keeps the runtime transaction digest attached to the local approval display", async () => {
    const local = new LocalBrowserWalletApproval(async input => {
      expect(input).toEqual({ ...request, transactionDigest: "digest-1" });
      return "approved";
    });

    await expect(local.requestTransaction({ ...request, transactionDigest: "digest-1" })).resolves.toBe("approved");
  });

  it("keeps the future user provider approval boundary separate from its transaction methods", async () => {
    const provider: Pick<UserWalletProvider, "requestApproval"> = {
      async requestApproval(input) {
        expect(input).toEqual(request);
        return "cancelled";
      },
    };

    await expect(new UserWalletApproval(provider).request(request)).resolves.toBe("cancelled");
  });
});
