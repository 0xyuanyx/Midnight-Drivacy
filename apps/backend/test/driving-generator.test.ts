import { describe, expect, it } from "vitest";
import { TripSchema, type Rule } from "@drivacy/shared";
import { generateTrip } from "../src/driving/driving-generator.js";

const rule: Rule={id:"rule",version:1,insurerId:"insurer",endorsementId:"special",formula:"cumulative-event-deduction-v1",initialScore:100,speedingPenalty:2,accelerationPenalty:1,brakingPenalty:3,minimumDistanceM:500000,minimumScore:80,premiumMinimumScore:90,baseDiscountBps:1000,premiumDiscountBps:1200};
const fixed={next:()=>0.5};
describe("simulated driving generator",()=>{
 it("creates a schema-valid first trip around the Rule minimum distance",()=>{const trip=generateTrip(rule,0,fixed);expect(TripSchema.parse(trip)).toEqual(trip);expect(trip.records.map(x=>x.index)).toEqual(trip.records.map((_,i)=>i));expect(trip.records.reduce((s,x)=>s+x.distanceM,0)).toBe(275000);expect(trip.datasetSalt).toMatch(/^[0-9a-f]{64}$/);});
 it("keeps the final segment duration consistent with its final distance",()=>{const trip=generateTrip(rule,0,fixed);const last=trip.records.at(-1)!;expect(last.distanceM).toBeGreaterThan(0);expect(last.durationSeconds).toBe(Math.round(last.distanceM/(45/3.6)));});
 it("targets 100 to 110 percent cumulative distance for a follow-up trip",()=>{const trip=generateTrip(rule,275000,fixed);const total=trip.records.reduce((s,x)=>s+x.distanceM,0);expect(275000+total).toBeGreaterThanOrEqual(500000);expect(275000+total).toBeLessThanOrEqual(550000);});
 it("uses the general range after confirmed minimum distance or with minimum distance zero",()=>{for(const candidate of [generateTrip(rule,500000,fixed),generateTrip({...rule,minimumDistanceM:0},0,fixed)]){const total=candidate.records.reduce((s,x)=>s+x.distanceM,0);expect(total).toBeGreaterThanOrEqual(20000);expect(total).toBeLessThanOrEqual(60000);expect(TripSchema.parse(candidate)).toEqual(candidate);}});
});
