"""Evaluate labeled record pairs without writing student fields to the output.

Use private, authorized inputs for a real study; the checked-in sample is synthetic.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.grantor_algorithms import evaluate_scholar_duplicate  # noqa: E402


def evaluate(cases):
    counts = {"truePositive": 0, "falsePositive": 0, "trueNegative": 0, "falseNegative": 0}
    results = []
    for index, case in enumerate(cases, 1):
        if not isinstance(case, dict) or not isinstance(case.get("expectedDuplicate"), bool):
            raise ValueError(f"Invalid label at case {index}")
        if not isinstance(case.get("candidate"), dict) or not isinstance(case.get("existing"), dict):
            raise ValueError(f"Record pair required at case {index}")
        match = evaluate_scholar_duplicate(case["candidate"], case["existing"])
        expected, actual = case["expectedDuplicate"], match["isDuplicate"]
        category = ("truePositive" if expected else "falsePositive") if actual else ("falseNegative" if expected else "trueNegative")
        counts[category] += 1
        # Stable ordinal IDs keep names, IDs, email addresses and phone numbers
        # out of evidence artifacts, even when the input contains real records.
        results.append({"caseId": f"MATCH-{index:03d}", "expectedDuplicate": expected,
                        "actualDuplicate": actual, "weightedScore": match["score"],
                        "nameSimilarity": match["nameSimilarity"], "classification": category})
    total = len(results)
    tp, fp, tn, fn = [counts[key] for key in ("truePositive", "falsePositive", "trueNegative", "falseNegative")]
    return {"algorithm": "Weighted Record Linkage with Levenshtein Similarity", "sampleCount": total,
            "counts": counts, "accuracy": (tp + tn) / total if total else None,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None, "cases": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("backend/tests/fixtures/solis_matching_cases.json"))
    parser.add_argument("--output", type=Path, default=Path("test-results/solis-matching-evaluation.json"))
    args = parser.parse_args()
    dataset = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(dataset, dict) or not isinstance(dataset.get("cases"), list):
        parser.error("Input must contain a cases array and a datasetKind label.")
    kind = dataset.get("datasetKind")
    if kind not in {"synthetic", "authorized_private"}:
        parser.error("datasetKind must be synthetic or authorized_private.")
    report = {"datasetKind": kind, "scope": "Record-pair matching only; not PDF extraction accuracy or award authorization.", **evaluate(dataset["cases"])}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("datasetKind", "sampleCount", "counts", "accuracy", "precision", "recall")}))
    print(f"Evidence: {args.output}")


if __name__ == "__main__":
    main()
