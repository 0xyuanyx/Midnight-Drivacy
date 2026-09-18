#!/usr/bin/env python3
"""Emit an independent integer oracle from the documented B/C formula.

Standard-library Python only. No TypeScript implementation or tests are read,
imported, or executed. All confirmations, roots, salts, hashes, and chain IDs
below are synthetic fixtures. They establish no actual proof or chain success.
Only this trip's records are supplied; sequential history is cumulative state.
"""

import copy
import json
import random
import sys


SEED = 20260918
UINT32 = (1 << 32) - 1
MAX_SAFE_INTEGER = (1 << 53) - 1
METRICS = (
    "distanceM", "durationSeconds", "speedingCount",
    "accelerationCount", "brakingCount",
)
EVENTS = (
    ("speeding", "speedingCount", "speedingPenalty"),
    ("acceleration", "accelerationCount", "accelerationPenalty"),
    ("braking", "brakingCount", "brakingPenalty"),
)


def metrics(distance=0, duration=0, speeding=0, acceleration=0, braking=0):
    return dict(zip(METRICS, (distance, duration, speeding, acceleration, braking)))


def rule_for(label, **changes):
    rule = {
        "id": "fixture-rule-" + label,
        "version": 1,
        "insurerId": "fixture-insurer",
        "endorsementId": "fixture-endorsement",
        "formula": "cumulative-event-deduction-v1",
        "initialScore": 100,
        "speedingPenalty": 2,
        "accelerationPenalty": 1,
        "brakingPenalty": 3,
        "minimumDistanceM": 500000,
        "minimumScore": 80,
        "premiumMinimumScore": 90,
        "baseDiscountBps": 1000,
        "premiumDiscountBps": 1200,
    }
    rule.update(changes)
    return {
        "approval": "approved",
        "rule": rule,
        "registration": "chain-confirmed",
        "ruleHash": "fixture-rule-hash-" + label,
        "adapterProfile": "python-oracle-fixture-v1",
        "network": "fixture",
        "chainContractAddress": "fixture-contract",
        "registrationTransactionId": "fixture-rule-registration-" + label,
    }


def scope_for(label):
    return {
        "applicantId": "fixture-applicant-" + label,
        "contractId": "fixture-policy-" + label,
        "insurerId": "fixture-insurer",
        "endorsementId": "fixture-endorsement",
        "evaluationPeriod": {
            "id": "fixture-period",
            "startDate": "2026-09-01",
            "endDate": "2026-09-30",
        },
    }


def result_for(totals, rule):
    # Recompute from cumulative events, never from a clamped previous score.
    deduction = sum(totals[event] * rule[coefficient]
                    for _, event, coefficient in EVENTS)
    score = max(0, rule["initialScore"] - deduction)
    conditions = (totals["distanceM"] >= rule["minimumDistanceM"]
                  and score >= rule["minimumScore"])
    discount = 0
    if conditions:
        discount = (rule["premiumDiscountBps"]
                    if score >= rule["premiumMinimumScore"]
                    else rule["baseDiscountBps"])
    return {"score": score, "conditionsMet": conditions,
            "expectedDiscountBps": discount}


def confirmed(next_state, registered, label, previous_commitment):
    state = copy.deepcopy(next_state)
    state.update({
        "datasetRoot": "fixture-dataset-root-" + label,
        "stateSalt": "%064x" % (state["version"] + 1),
        "stateCommitment": "fixture-state-commitment-" + label,
    })
    return {
        "kind": "confirmed",
        "state": state,
        "confirmation": {
            "execution": "fixture", "network": "fixture",
            "adapterProfile": registered["adapterProfile"],
            "chainContractAddress": registered["chainContractAddress"],
            "transactionId": "fixture-transaction-" + label,
            "blockId": "fixture-block-" + label,
            "operationId": "fixture-operation-" + label,
            "previousStateCommitment": previous_commitment,
            "newStateCommitment": state["stateCommitment"],
            "ruleHash": registered["ruleHash"],
            "datasetRoot": state["datasetRoot"],
            "observedAt": "2026-09-18T00:00:00Z",
        },
    }


def starting_state(registered, label, totals=None, version=0, trip_count=0):
    totals = metrics() if totals is None else copy.deepcopy(totals)
    rule = registered["rule"]
    state = {
        "scope": scope_for(label),
        "rule": {"id": rule["id"], "version": rule["version"],
                 "ruleHash": registered["ruleHash"]},
        "version": version, "tripCount": trip_count, "totals": totals,
    }
    state.update(result_for(totals, rule))
    return confirmed(state, registered, label + "-initial", "fixture-pre-genesis")


def add_case(cases, name, registered, previous, segments):
    records = [dict(segment, index=index)
               for index, segment in enumerate(segments)]
    trip_totals = {key: sum(record[key] for record in records) for key in METRICS}
    old = previous["state"]
    totals = {key: old["totals"][key] + trip_totals[key] for key in METRICS}
    rule = registered["rule"]
    penalties = {name: trip_totals[event] * rule[coefficient]
                 for name, event, coefficient in EVENTS}
    assert 1 <= len(records) <= 1024
    assert all(0 <= value <= UINT32 for value in totals.values())
    assert all(0 <= value <= MAX_SAFE_INTEGER for value in penalties.values())
    assert old["version"] < UINT32 and old["tripCount"] < UINT32
    next_state = {
        "scope": copy.deepcopy(old["scope"]),
        "rule": copy.deepcopy(old["rule"]),
        "version": old["version"] + 1, "tripCount": old["tripCount"] + 1,
        "totals": totals,
    }
    next_state.update(result_for(totals, rule))
    explanation = {
        "previousScore": old["score"], "newScore": next_state["score"],
        "scoreDelta": next_state["score"] - old["score"],
        "tripTotals": trip_totals, "ruleVersion": rule["version"],
        "penalties": penalties,
    }
    request = {
        "contractVersion": "bc-v1", "execution": "fixture",
        "operationId": "fixture-operation-" + name,
        "idempotencyKey": "fixture-idempotency-" + name,
        "scope": copy.deepcopy(old["scope"]),
        "approvedRule": copy.deepcopy(registered),
        "previous": copy.deepcopy(previous),
        "trip": {
            "id": "fixture-trip-" + name, "source": "simulated",
            "collectionEnabled": True, "records": records,
            "datasetSalt": "%064x" % (len(cases) + 1),
        },
    }
    cases.append({"name": name, "input": request,
                  "expected": {"next": next_state, "explanation": explanation}})
    return confirmed(next_state, registered, name, old["stateCommitment"])


def generate():
    rng = random.Random(SEED)
    cases = []
    demo = rule_for("demo")

    # Explicit inclusive distance, minimum-score, and premium-score boundaries.
    for distance in (499999, 500000, 500001):
        for score in (79, 80, 81, 89, 90, 91, 100):
            name = "boundary-distance-%d-score-%d" % (distance, score)
            add_case(cases, name, demo, starting_state(demo, name),
                     [metrics(distance, 100, acceleration=100 - score)])

    previous = starting_state(demo, "documented-demo")
    previous = add_case(cases, "documented-demo-trip-1", demo, previous,
                        [metrics(300000, 10800, 2, 1, 1)])
    add_case(cases, "documented-demo-trip-2", demo, previous,
             [metrics(250000, 9000, 1, 0, 1)])

    previous = starting_state(demo, "clamp-continuation")
    for index, trip in enumerate((metrics(500000, 100, 60, 0, 0),
                                  metrics(50, 10, 7, 9, 11),
                                  metrics(0, 0, 0, 0, 0))):
        previous = add_case(cases, "clamp-continuation-%d" % index,
                            demo, previous, [trip])

    # Each chain feeds our own prior result with synthetic fixture confirmation.
    # No old trip records are retained in the next CalculateTripRequest fixture.
    coefficient_sets = ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1),
                        (2, 1, 3), (7, 4, 9), (100, 101, 102),
                        (UINT32, 1, 0))
    for chain in range(24):
        minimum = rng.randint(0, 100)
        premium = rng.randint(minimum, 100)
        base = rng.randint(0, 10000)
        coefficients = coefficient_sets[chain % len(coefficient_sets)]
        label = "chain-%02d" % chain
        registered = rule_for(
            label, version=chain + 1,
            speedingPenalty=coefficients[0], accelerationPenalty=coefficients[1],
            brakingPenalty=coefficients[2],
            minimumDistanceM=rng.choice((0, 1, 500000, 2500000)),
            minimumScore=minimum, premiumMinimumScore=premium,
            baseDiscountBps=base, premiumDiscountBps=rng.randint(base, 10000),
        )
        previous = starting_state(registered, label)
        for step in range(12):
            segments = [metrics(rng.randint(0, 200000), rng.randint(0, 10000),
                                rng.randint(0, 3), rng.randint(0, 3),
                                rng.randint(0, 3))
                        for _ in range(rng.randint(1, 6))]
            if step == 5:
                segments = [metrics()]
            previous = add_case(cases, "%s-step-%02d" % (label, step),
                                registered, previous, segments)

    # Multi-record partitioning includes the maximum supported record count.
    for size in (1, 2, 17, 1024):
        name = "record-count-%d" % size
        add_case(cases, name, demo, starting_state(demo, name),
                 [metrics(500000 // size, 3, 0, index % 2, index % 3)
                  for index in range(size)])

    # Valid uint32 extremes and large integer products remain valid fixtures.
    for key in METRICS:
        name = "uint32-maximum-" + key
        values = metrics()
        values[key] = UINT32
        registered = rule_for(name, speedingPenalty=1, accelerationPenalty=1,
                              brakingPenalty=1)
        previous = add_case(cases, name, registered,
                            starting_state(registered, name), [values])
        add_case(cases, name + "-zero-continuation", registered, previous, [metrics()])

    near_safe = rule_for("near-safe-product", speedingPenalty=1 << 21)
    add_case(cases, "weighted-penalty-near-safe-integer", near_safe,
             starting_state(near_safe, "near-safe-product"),
             [metrics(speeding=UINT32)])

    huge_cumulative = rule_for("huge-cumulative", speedingPenalty=UINT32)
    previous = starting_state(huge_cumulative, "huge-cumulative",
                              metrics(499999, 1, 2000000000), 1, 1)
    add_case(cases, "cumulative-product-above-safe-integer", huge_cumulative,
             previous, [metrics(1, 1, 1000000)])

    previous = starting_state(demo, "version-maximum", metrics(), UINT32 - 1, UINT32 - 1)
    add_case(cases, "version-and-trip-count-maximum", demo, previous, [metrics()])

    edge_rule = rule_for("zero-thresholds", minimumDistanceM=0, minimumScore=0,
                         premiumMinimumScore=0, baseDiscountBps=0,
                         premiumDiscountBps=10000)
    previous = starting_state(edge_rule, "zero-thresholds")
    add_case(cases, "zero-score-inclusive-full-discount", edge_rule, previous,
             [metrics(speeding=100)])
    assert len(cases) >= 200
    return {"oracle": "python-integer-reference", "seed": SEED, "cases": cases}


if __name__ == "__main__":
    json.dump(generate(), sys.stdout, separators=(",", ":"), ensure_ascii=True)
    sys.stdout.write("\n")
