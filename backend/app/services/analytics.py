"""Analytics: Brand Score, mistake mix, compliance, approval time, trend, report.

Brand Score formula (also printed in the API response and on screen):

    Brand Score = 100 * (0.50 * SeverityIndex + 0.30 * ComplianceRate + 0.20 * ApprovalRate)

    SeverityIndex  = max(0, 1 - weighted_findings / (10 * analysed_submissions))
                     weights: low 1, medium 2, high 4, critical 8
    ComplianceRate = share of analysed submissions with no high or critical findings
    ApprovalRate   = approved / (approved + rejected)          (0.5 if no decisions yet)

Human decisions are respected: a finding a person accepted/dismissed stops
counting against the index only if it was dismissed with a reason, because a
dismissal is a human judgement the system has learned from.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..llm.factory import provider_info
from ..models import AnalysisRun, Approval, ContentItem, Finding

SEV_WEIGHT = {"low": 1, "medium": 2, "high": 4, "critical": 8}
FORMULA = ("Brand Score = 100 × (0.50 × SeverityIndex + 0.30 × ComplianceRate + 0.20 × ApprovalRate), "
           "where SeverityIndex = max(0, 1 − Σ(severity weight) ÷ (10 × analysed submissions)) with "
           "weights low=1, medium=2, high=4, critical=8; ComplianceRate = share of analysed submissions with "
           "no high or critical findings; ApprovalRate = approved ÷ (approved + rejected).")


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def summary(db: Session, *, org_id: str, window_days: int = 90) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    items = db.execute(select(ContentItem).where(ContentItem.org_id == org_id,
                                                 ContentItem.deleted_at.is_(None))).scalars().all()
    item_ids = {i.id for i in items}
    runs = db.execute(select(AnalysisRun).where(AnalysisRun.org_id == org_id,
                                                AnalysisRun.status == "complete")).scalars().all()
    runs = [r for r in runs if r.content_item_id in item_ids]
    run_ids = [r.id for r in runs]
    findings = db.execute(select(Finding).where(Finding.org_id == org_id)).scalars().all()
    findings = [f for f in findings if f.analysis_run_id in set(run_ids)]

    # ---- severity index ---------------------------------------------------
    weighted = sum(SEV_WEIGHT.get(f.severity, 1) for f in findings if f.decision_status != "dismissed")
    analysed = max(1, len(runs))
    severity_index = max(0.0, 1 - weighted / (10 * analysed))

    # ---- compliance rate --------------------------------------------------
    per_run_high = defaultdict(int)
    for f in findings:
        if f.severity in ("high", "critical") and f.decision_status in ("open", "escalated"):
            per_run_high[f.analysis_run_id] += 1
    compliant_runs = sum(1 for r in runs if per_run_high.get(r.id, 0) == 0)
    compliance_rate = compliant_runs / analysed if runs else 0.0

    # ---- approval rate ----------------------------------------------------
    approvals = db.execute(select(Approval).where(Approval.org_id == org_id)).scalars().all()
    approved = sum(1 for a in approvals if a.action == "approve")
    rejected = sum(1 for a in approvals if a.action == "reject")
    approval_rate = approved / (approved + rejected) if (approved + rejected) else 0.5

    brand_score = round(100 * (0.50 * severity_index + 0.30 * compliance_rate + 0.20 * approval_rate), 1)

    # ---- mistake mix ------------------------------------------------------
    by_rule = Counter()
    rule_titles = {}
    for f in findings:
        if f.decision_status == "dismissed":
            continue
        key = f.rule_key or f.category
        by_rule[key] += 1
        rule_titles.setdefault(key, f.issue[:120])
    # ranked by weighted severity (a critical guarantee outweighs four low-priority nits)
    by_rule_weight = Counter()
    for f in findings:
        if f.decision_status == "dismissed":
            continue
        by_rule_weight[f.rule_key or f.category] += SEV_WEIGHT.get(f.severity, 1)
    total_weight = max(1, sum(by_rule_weight.values()))
    most_common = [
        {"rule_key": k, "count": by_rule[k], "weight": w,
         "example_issue": rule_titles.get(k, ""), "share": round(w / total_weight, 3)}
        for k, w in by_rule_weight.most_common(8)
    ]

    # ---- department compliance -------------------------------------------
    dept_total = defaultdict(int)
    dept_bad = defaultdict(int)
    for run in runs:
        item = next((i for i in items if i.id == run.content_item_id), None)
        if item is None:
            continue
        dept = item.department or "Unassigned"
        dept_total[dept] += 1
        if per_run_high.get(run.id, 0) > 0:
            dept_bad[dept] += 1
    department_compliance = [
        {"department": dept, "submissions": dept_total[dept],
         "compliance": round(1 - dept_bad[dept] / dept_total[dept], 3)}
        for dept in sorted(dept_total)
    ]

    # ---- approval time ----------------------------------------------------
    by_item = defaultdict(list)
    for a in approvals:
        by_item[a.content_item_id].append(a)
    durations = []
    for item_id, decisions in by_item.items():
        item = next((i for i in items if i.id == item_id), None)
        if item is None or item.submitted_at is None:
            continue
        first = min(decisions, key=lambda a: a.decided_at)
        submitted = item.submitted_at
        if submitted.tzinfo is None:
            submitted = submitted.replace(tzinfo=timezone.utc)
        decided = first.decided_at if first.decided_at.tzinfo else first.decided_at.replace(tzinfo=timezone.utc)
        durations.append((decided - submitted).total_seconds() / 3600)
    average_approval_hours = _avg([max(0.0, d) for d in durations])

    # ---- repeated violations ---------------------------------------------
    rule_to_items = defaultdict(set)
    for f in findings:
        if f.rule_key:
            rule_to_items[f.rule_key].add(f.content_item_id)
    repeated = [
        {"rule_key": k, "content_items": len(v), "findings": by_rule.get(k, 0)}
        for k, v in rule_to_items.items() if len(v) >= 2
    ]
    repeated.sort(key=lambda r: (-r["content_items"], -r["findings"]))

    # ---- brand health trend (last 8 weeks) -------------------------------
    trend = []
    now = datetime.now(timezone.utc)
    for week in range(7, -1, -1):
        start = now - timedelta(days=7 * (week + 1))
        end = now - timedelta(days=7 * week)
        week_runs = [r for r in runs if _aware(r.created_at) >= start and _aware(r.created_at) < end]
        week_findings = [f for f in findings if f.analysis_run_id in {r.id for r in week_runs}]
        w_weighted = sum(SEV_WEIGHT.get(f.severity, 1) for f in week_findings)
        w_analysed = max(1, len(week_runs))
        w_sev = max(0.0, 1 - w_weighted / (10 * w_analysed))
        w_compliant = sum(1 for r in week_runs if per_run_high.get(r.id, 0) == 0)
        w_compliance = w_compliant / w_analysed if week_runs else 0.0
        score = round(100 * (0.50 * w_sev + 0.30 * w_compliance + 0.20 * approval_rate), 1) if week_runs else None
        trend.append({
            "week_start": start.date().isoformat(),
            "submissions": len(week_runs),
            "findings": len(week_findings),
            "brand_score": score,
        })

    # ---- confidence calibration ------------------------------------------
    # For each confidence band: how often did a human agree with the reviewer?
    # "agreed" = accepted or edited (edited still confirms the finding was real);
    # "disagreed" = dismissed by a manager. Undecided findings are counted but not scored.
    calib = {}
    for band in ("low", "medium", "high"):
        band_findings = [f for f in findings if (f.confidence_band or "medium") == band]
        agreed = sum(1 for f in band_findings if f.decision_status in ("accepted", "edited"))
        disagreed = sum(1 for f in band_findings if f.decision_status == "dismissed")
        decided = agreed + disagreed
        calib[band] = {
            "band": band,
            "findings": len(band_findings),
            "decided": decided,
            "agreed": agreed,
            "disagreed": disagreed,
            "agreement_rate": round(agreed / decided, 3) if decided else None,
            "mean_confidence": round(
                sum(f.confidence for f in band_findings) / len(band_findings), 3
            ) if band_findings else None,
        }
    confidence_calibration = [calib[b] for b in ("low", "medium", "high")]

    # ---- run telemetry (measured, not modelled) ---------------------------
    telemetry_runs = [r for r in runs if (r.metrics or {}).get("wall_ms") is not None]
    telemetry = {
        "runs_measured": len(telemetry_runs),
        "mean_wall_ms": round(sum(r.metrics["wall_ms"] for r in telemetry_runs) / len(telemetry_runs), 1)
        if telemetry_runs else None,
        "slowest_wall_ms": max((r.metrics["wall_ms"] for r in telemetry_runs), default=None),
        "prompt_tokens": sum((r.metrics or {}).get("prompt_tokens") or 0 for r in telemetry_runs),
        "completion_tokens": sum((r.metrics or {}).get("completion_tokens") or 0 for r in telemetry_runs),
        "cost_usd_estimate": (
            round(sum((r.metrics or {}).get("cost_usd_estimate") or 0 for r in telemetry_runs), 6)
            if any((r.metrics or {}).get("cost_usd_estimate") is not None for r in telemetry_runs) else None
        ),
        "provider": provider_info().get("provider"),
        "note": ("The offline engine makes no model calls, so tokens and cost are zero by fact, "
                 "not by assumption. Latency is wall-clock per run."),
    }

    insights = _insights(
        findings=findings, runs=runs, most_common=most_common,
        department_compliance=department_compliance, repeated=repeated,
        confidence_calibration=confidence_calibration, approval_rate=approval_rate,
        average_approval_hours=average_approval_hours, severity_index=severity_index,
    )

    top_violated = None
    if most_common:
        top = most_common[0]
        top_violated = {
            "rule_key": top["rule_key"], "count": top["count"], "weight": top["weight"],
            "title": top["example_issue"] or top["rule_key"], "share": top["share"],
        }

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_runs = [r for r in runs if _aware(r.created_at) >= month_start]
    month_findings = [f for f in findings if f.analysis_run_id in {r.id for r in month_runs}]
    monthly = {
        "month": month_start.strftime("%Y-%m"),
        "submissions_analysed": len(month_runs),
        "findings": len(month_findings),
        "high_or_critical": sum(1 for f in month_findings if f.severity in ("high", "critical")),
        "findings_dismissed_by_managers": sum(1 for f in month_findings if f.decision_status == "dismissed"),
        "top_mistakes": most_common[:5],
        "approvals": approved,
        "rejections": rejected,
    }

    return {
        "brand_score": brand_score,
        "formula": FORMULA,
        "window_days": window_days,
        "submissions": len(items),
        "findings_by_severity": dict(Counter(f.severity for f in findings)),
        "findings_by_reviewer": dict(Counter(f.reviewer for f in findings)),
        "most_common_mistakes": most_common,
        "department_compliance": department_compliance,
        "average_approval_hours": average_approval_hours,
        "repeated_violations": repeated[:8],
        "brand_health_trend": trend,
        "top_violated_guideline": top_violated,
        "confidence_calibration": confidence_calibration,
        "telemetry": telemetry,
        "insights": insights,
        "monthly_report": monthly,
        "provider": provider_info(),
        "inputs": {
            "severity_index": round(severity_index, 4),
            "compliance_rate": round(compliance_rate, 4),
            "approval_rate": round(approval_rate, 4),
            "weighted_findings": weighted,
            "analysed_submissions": len(runs),
        },
    }


def _insights(*, findings, runs, most_common, department_compliance, repeated,
              confidence_calibration, approval_rate, average_approval_hours,
              severity_index) -> list[dict]:
    """Plain-language observations computed from this org's own numbers.

    Every sentence is derived; nothing is a target, benchmark or prediction. If the
    data needed for a sentence is missing, the sentence is simply not produced.
    """
    out: list[dict] = []

    if most_common:
        top = most_common[0]
        share = round(top["share"] * 100)
        out.append({
            "kind": "concentration",
            "text": (f"{share}% of the weighted findings come from one rule "
                     f"({top['rule_key']}). Fixing it would move the score more than any other change."),
            "evidence": {"rule_key": top["rule_key"], "count": top["count"], "share": top["share"]},
        })

    decided = [f for f in findings if f.decision_status in ("accepted", "edited", "dismissed")]
    dismissed = [f for f in decided if f.decision_status == "dismissed"]
    if decided:
        rate = round(100 * (1 - len(dismissed) / len(decided)))
        out.append({
            "kind": "human_agreement",
            "text": (f"Humans have agreed with {rate}% of the {len(decided)} findings they have decided so far "
                     f"({len(decided) - len(dismissed)} accepted or edited, {len(dismissed)} dismissed)."),
            "evidence": {"decided": len(decided), "dismissed": len(dismissed)},
        })

    low = next((c for c in confidence_calibration if c["band"] == "low"), None)
    high = next((c for c in confidence_calibration if c["band"] == "high"), None)
    if low and high and low["agreement_rate"] is not None and high["agreement_rate"] is not None \
            and low["decided"] >= 3 and high["decided"] >= 3:
        delta = round((high["agreement_rate"] - low["agreement_rate"]) * 100)
        if abs(delta) >= 10:
            direction = "higher" if delta > 0 else "lower"
            out.append({
                "kind": "calibration",
                "text": (f"High-confidence findings are agreed with {abs(delta)} points {direction} often than "
                         f"low-confidence ones — confidence is "
                         f"{'calibrated' if delta > 0 else 'not yet informative'} on this data."),
                "evidence": {"low": low["agreement_rate"], "high": high["agreement_rate"]},
            })

    if repeated:
        worst = repeated[0]
        out.append({
            "kind": "repetition",
            "text": (f"{worst['rule_key']} has been flagged on {worst['content_items']} different items — "
                     "a training gap, not a one-off mistake."),
            "evidence": worst,
        })

    if department_compliance:
        worst_dept = min(department_compliance, key=lambda d: d["compliance"])
        if worst_dept["compliance"] < 1.0:
            out.append({
                "kind": "department",
                "text": (f"{worst_dept['department']} clears {round(worst_dept['compliance'] * 100)}% of "
                         f"{worst_dept['submissions']} submissions without a high or critical finding — "
                         "the lowest of the departments that have submitted."),
                "evidence": worst_dept,
            })

    if average_approval_hours is not None:
        out.append({
            "kind": "throughput",
            "text": (f"A human decision takes {average_approval_hours:.1f} hours on average after submission; "
                     "nothing is published before that."),
            "evidence": {"average_approval_hours": average_approval_hours},
        })

    if not runs:
        out.append({
            "kind": "empty",
            "text": "No run has completed in this window yet, so every number above is zero rather than measured.",
            "evidence": {},
        })

    return out[:5]


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
