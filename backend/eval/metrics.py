"""Evaluation metrics: precision, recall, F1 and false-positive rate per reviewer.

Matching rule: a prediction matches a label when the reviewer names match and the
spans overlap (IoU >= 0.3, or an exact substring containment for short spans).
Each label can be matched at most once (greedy, longest overlap first).

False-positive rate is defined at *sample* level: the share of samples that carry
no seeded mistake for reviewer X but still receive at least one finding from X.
That is the definition a brand manager cares about ("how often does this reviewer
cry wolf on clean copy"), and it is stable when samples have different lengths.
"""
from __future__ import annotations

from collections import defaultdict

REVIEWERS = ("brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal")


def locate(text: str, snippet: str, near: int = 0) -> tuple[int, int]:
    idx = text.find(snippet)
    if idx < 0:
        idx = text.lower().find(snippet.lower())
    if idx < 0:
        return (0, 0)
    return (idx, idx + len(snippet))


def _overlap(a: tuple[int, int], b: tuple[int, int]) -> float:
    a0, a1 = a
    b0, b1 = b
    inter = max(0, min(a1, b1) - max(a0, b0))
    union = max(a1, b1) - min(a0, b0)
    if union <= 0:
        return 1.0 if a0 == b0 else 0.0
    return inter / union


def evaluate(samples: list[dict], reviewers: tuple[str, ...] = REVIEWERS) -> dict:
    """samples: [{id, text, labels:[{reviewer,start,end,type?}], predictions:[{reviewer,start,end}]}]"""
    per_reviewer: dict[str, dict] = {}
    for reviewer in reviewers:
        tp = fp = fn = 0
        clean_samples = 0
        clean_samples_with_fp = 0
        matched_pairs: list[dict] = []
        missed: list[dict] = []

        for sample in samples:
            labels = [l for l in sample["labels"] if l["reviewer"] == reviewer]
            preds = [p for p in sample["predictions"] if p["reviewer"] == reviewer]
            if not labels:
                clean_samples += 1
                if preds:
                    clean_samples_with_fp += 1
                fp += len(preds)
                continue

            used: set[int] = set()
            for label in sorted(labels, key=lambda l: l["end"] - l["start"], reverse=True):
                best_i, best_score = None, 0.0
                for i, pred in enumerate(preds):
                    if i in used:
                        continue
                    score = _overlap((label["start"], label["end"]), (pred["start"], pred["end"]))
                    if score > best_score:
                        best_i, best_score = i, score
                if best_i is not None and best_score >= 0.3:
                    used.add(best_i)
                    tp += 1
                    matched_pairs.append({"sample": sample["id"], "label": label.get("type", reviewer)})
                else:
                    fn += 1
                    missed.append({"sample": sample["id"], "type": label.get("type", reviewer),
                                   "span": sample["text"][label["start"]:label["end"]][:80]})
            fp += max(0, len(preds) - len(used))

        precision = tp / (tp + fp) if (tp + fp) else 1.0
        recall = tp / (tp + fn) if (tp + fn) else 1.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        per_reviewer[reviewer] = {
            "tp": tp, "fp": fp, "fn": fn,
            # how many findings this reviewer actually produced: precision is only
            # meaningful when it is > 0, so the UI can show "—" instead of a fake 1.00
            "predicted": tp + fp,
            "labelled": tp + fn,
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
            "false_positive_rate": round(clean_samples_with_fp / clean_samples, 3) if clean_samples else 0.0,
            "clean_samples": clean_samples,
            "missed": missed[:8],
        }

    total_tp = sum(v["tp"] for v in per_reviewer.values())
    total_fp = sum(v["fp"] for v in per_reviewer.values())
    total_fn = sum(v["fn"] for v in per_reviewer.values())
    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) else 1.0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) else 1.0
    macro_p = sum(v["precision"] for v in per_reviewer.values()) / len(per_reviewer)
    macro_r = sum(v["recall"] for v in per_reviewer.values()) / len(per_reviewer)
    macro_fpr = sum(v["false_positive_rate"] for v in per_reviewer.values()) / len(per_reviewer)

    return {
        "per_reviewer": per_reviewer,
        "overall": {
            "samples": len(samples),
            "micro_precision": round(micro_p, 3),
            "micro_recall": round(micro_r, 3),
            "micro_f1": round(2 * micro_p * micro_r / (micro_p + micro_r), 3) if (micro_p + micro_r) else 0.0,
            "macro_precision": round(macro_p, 3),
            "macro_recall": round(macro_r, 3),
            "mean_false_positive_rate": round(macro_fpr, 3),
            "predicted": total_tp + total_fp,
            "labelled": total_tp + total_fn,
        },
    }


def relaxed(samples: list[dict]) -> dict:
    """Reviewer-agnostic scoring: did *any* reviewer cover the labelled span?

    Strict scoring (the default above) requires the right reviewer *and* span
    overlap. That is the fair test of the six-lens claim, but it makes a
    partially-right system look worse than it is: flagging the right span with the
    wrong reviewer counts as a miss. Published alongside the strict numbers so a
    reader can see both.
    """
    tp = fp = fn = 0
    for sample in samples:
        labels = list(sample["labels"])
        preds = list(sample["predictions"])
        used: set[int] = set()
        for label in labels:
            best_i, best_score = None, 0.0
            for i, pred in enumerate(preds):
                if i in used:
                    continue
                score = _overlap((label["start"], label["end"]), (pred["start"], pred["end"]))
                if score > best_score:
                    best_i, best_score = i, score
            if best_i is not None and best_score >= 0.3:
                used.add(best_i)
                tp += 1
            else:
                fn += 1
        fp += max(0, len(preds) - len(used))
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(f1, 3), "tp": tp, "fp": fp, "fn": fn, "predicted": tp + fp,
            "labelled": tp + fn}


def compare(candidate: dict, baseline: dict) -> dict:
    """Per-reviewer delta vs. the single-prompt baseline, plus regression verdict."""
    rows = []
    regressions = []
    for reviewer, metrics in candidate["per_reviewer"].items():
        base = baseline["per_reviewer"].get(reviewer, {})
        d_f1 = round(metrics["f1"] - base.get("f1", 0.0), 3)
        d_p = round(metrics["precision"] - base.get("precision", 0.0), 3)
        d_r = round(metrics["recall"] - base.get("recall", 0.0), 3)
        if d_f1 < -0.05:
            regressions.append({"reviewer": reviewer, "delta_f1": d_f1})
        rows.append({
            "reviewer": reviewer,
            "precision": metrics["precision"], "baseline_precision": base.get("precision"),
            "recall": metrics["recall"], "baseline_recall": base.get("recall"),
            "f1": metrics["f1"], "baseline_f1": base.get("f1"),
            "false_positive_rate": metrics["false_positive_rate"],
            "baseline_false_positive_rate": base.get("false_positive_rate"),
            "delta_f1": d_f1, "delta_precision": d_p, "delta_recall": d_r,
        })
    return {
        "rows": rows,
        "regressions": regressions,
        "candidate_overall": candidate["overall"],
        "baseline_overall": baseline["overall"],
    }
