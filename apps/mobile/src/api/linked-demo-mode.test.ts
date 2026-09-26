import { canUseLinkedDemoBridge } from "./linked-demo";

it("keeps authenticated fixture insurance sessions off the linked demo bridge", () => {
  expect(canUseLinkedDemoBridge(true, true)).toBe(false);
  expect(canUseLinkedDemoBridge(false, true)).toBe(true);
  expect(canUseLinkedDemoBridge(false, false)).toBe(false);
});
