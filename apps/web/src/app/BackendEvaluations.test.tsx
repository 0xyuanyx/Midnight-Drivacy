import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackendEvaluations } from "./BackendEvaluations";
import type { InsurerApi } from "../api/backend";

const pending = { id: "app-pending", insuranceContractId: "contract-1", specialContractId: "rider-1",
  specialContractName: "안전운전 특약", score: 88, distanceM: 1200, conditionsMet: true,
  expectedDiscountBps: 1000, appliedDiscountBps: null, submittedAt: "2026-09-26T00:00:00Z",
  decidedAt: null, verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW" };
const verified = { ...pending, id: "app-verified", verificationStatus: "VERIFIED" };

it("allows insurer decision only for Backend VERIFIED applications", async () => {
  const decideDiscountApplication = vi.fn().mockResolvedValue({ ...verified, reviewStatus: "APPLIED", appliedDiscountBps: 800 });
  const listDiscountApplications = vi.fn().mockResolvedValueOnce([pending, verified]).mockResolvedValue([pending, { ...verified, reviewStatus: "APPLIED", appliedDiscountBps: 800 }]);
  const api = { listDiscountApplications, decideDiscountApplication } as unknown as InsurerApi;
  render(<BackendEvaluations api={api} />);
  await screen.findByText("app-pending");
  expect(screen.getByRole("button", { name: "할인 적용 결정" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /app-verified/ }));
  expect(screen.getByRole("button", { name: "할인 적용 결정" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "할인 적용 결정" }));
  await waitFor(() => expect(decideDiscountApplication).toHaveBeenCalledWith("app-verified", "APPLIED"));
  expect(screen.queryByText(/위치|경로|datasetSalt/)).toBeNull();
});
