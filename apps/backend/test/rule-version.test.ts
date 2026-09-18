import { describe, expect, it } from "vitest";
import { toRuleVersionNumber } from "../src/rule/rule-service.js";

describe("Rule bigint version mapper", () => {
 it.each([["1",1],["4294967295",4294967295]])("converts %s",(input,expected)=>expect(toRuleVersionNumber(input)).toBe(expected));
 it.each(["0","4294967296","abc"])("rejects invalid stored value %s",input=>expect(()=>toRuleVersionNumber(input)).toThrow("Stored rule version is invalid"));
});
