"""25 blind samples — written *after* the Round 3 engine changes, and scored once.

Rules for this file:

* It was written after the generalisation work in A5 was finished, so it cannot
  have guided it. Nothing here was used to tune a regex, a synonym list or a
  threshold.
* It is **never** run in CI and never loaded by the app. `python -m eval.run_eval
  --samples blind` runs it by hand, which is the only way it is ever scored.
* Every sample is new: different brands, departments, formats and wording from
  both `seed.samples` (53) and `seed.heldout_samples` (20). Where a phrasing
  resembles one of those, that is because English runs out of ways to say "best",
  not because the wording was copied.
* Clean samples are included on purpose. A set of violations only measures recall;
  half of the cost of a reviewer is the quiet copy it leaves alone.

Format matches `seed.samples.SAMPLES`:
    (id, title, content_type, department, text, labels[(reviewer, type, span_text)])

Labels are spans of text that a careful human reviewer would flag. They are
conservative: where reasonable people would disagree, the sample carries no label
and is excluded from recall rather than guessed at.
"""
from __future__ import annotations

BLIND: list[dict] = [
    # ------------------------------------------------------- clean / near-miss
    dict(
        id="B01", title="Delivery slip with a date", content_type="email", department="Operations",
        text=("Your order ships on Tuesday 4 November. The courier will text you a two-hour "
              "window on the morning of delivery, and you can move it once at no charge."),
        labels=[],
    ),
    dict(
        id="B02", title="Measured claim, sourced", content_type="blog", department="Product",
        text=("Across the 41 teams in the pilot, median planning time fell from 11 days to 7. "
              "That is a single cohort, not a controlled trial, and we say so in the appendix."),
        labels=[],
    ),
    dict(
        id="B03", title="Plain policy note", content_type="blog", department="Legal",
        text=("We keep submitted drafts for 90 days and then delete them. You can ask for an "
              "export at any time. Nothing in this policy changes your statutory rights."),
        labels=[],
    ),
    dict(
        id="B04", title="Careful comparison", content_type="ad", department="Marketing",
        text=("Most planning tools ask you to rebuild the model every quarter. Ours keeps the "
              "history and shows you what changed. We are not claiming it is the only way."),
        labels=[],
    ),
    dict(
        id="B05", title="Support reply, no claims", content_type="email", department="Support",
        text=("Thanks for the detail, Priya. The export failed because the file name had a "
              "colon in it. I have attached the corrected file and flagged the bug internally."),
        labels=[],
    ),
    dict(
        id="B06", title="Accessible social copy", content_type="social_post", department="Marketing",
        text=("Charts are hard to read on a phone. Every figure we publish now has a table "
              "version — link in bio. Image description: 'Accuracy by month, January to June.'"),
        labels=[],
    ),

    # --------------------------------------------- superlatives, stated obliquely
    dict(
        id="B07", title="Superiority by negation", content_type="blog", department="Marketing",
        text=("No other forecasting platform on the market comes close to what we ship today."),
        labels=[("legal", "superlative", "No other forecasting platform on the market comes close")],
    ),
    dict(
        id="B08", title="Rank claim, no source", content_type="ad", department="Sales",
        text=("Rated the greatest planning suite available, by the people who use it every day."),
        labels=[("legal", "superlative", "the greatest planning suite available")],
    ),
    dict(
        id="B09", title="Award shorthand", content_type="social_post", department="Marketing",
        text=("Second to none for spreadsheet imports. Ask anyone on the finance team."),
        labels=[("legal", "superlative", "Second to none")],
    ),
    dict(
        id="B10", title="Price superlative", content_type="ad", department="Sales",
        text=("Our entry tier is the cheapest way to get a real demand model into a small team."),
        labels=[("legal", "superlative", "the cheapest way to get a real demand model")],
    ),

    # ------------------------------------------------- guarantees and absolutes
    dict(
        id="B11", title="Promise with a number", content_type="ad", department="Sales",
        text=("We promise every deployment will go live within 14 days of signature."),
        labels=[("legal", "guarantee", "promise every deployment will go live within 14 days"),
                ("fact_checker", "unsupported_claim", "go live within 14 days")],
    ),
    dict(
        id="B12", title="Absolute reliability", content_type="blog", department="Product",
        text=("The scheduler never fails, even when a region goes down."),
        labels=[("legal", "guarantee", "never fails")],
    ),
    dict(
        id="B13", title="Uptime absolute", content_type="email", department="Operations",
        text=("You get zero downtime during the migration window; your team will not notice it."),
        labels=[("legal", "guarantee", "zero downtime")],
    ),
    dict(
        id="B14", title="Population claim", content_type="ad", department="Marketing",
        text=("Chosen by every procurement team that has run the pilot."),
        labels=[("legal", "absolute", "every procurement team")],
    ),

    # -------------------------------------------------- paraphrased banned terms
    dict(
        id="B15", title="Discount framing", content_type="social_post", department="Marketing",
        text=("Our annual plan costs less than a team lunch, which is the whole argument."),
        labels=[("brand_voice", "banned_word", "costs less than a team lunch")],
    ),
    dict(
        id="B16", title="Second-person hedge", content_type="blog", department="Product",
        text=("You will want to leverage the saved views once you have more than three models."),
        labels=[("terminology", "plain_english", "leverage")],
    ),
    dict(
        id="B17", title="Banned adjective in a heading", content_type="blog", department="Marketing",
        text=("A cheap way to start: the starter tier includes three users and one workspace."),
        labels=[("brand_voice", "banned_word", "cheap")],
    ),

    # ------------------------------------------------- formatting and obfuscation
    dict(
        id="B18", title="Hyphen split claim", content_type="social_post", department="Marketing",
        text=("Try it risk free for thirty days, no card needed."),
        labels=[("legal", "guarantee", "risk free")],
    ),
    dict(
        id="B19", title="Non-breaking space", content_type="ad", department="Marketing",
        text=("Our support team is second\u00a0to\u00a0none on response time."),
        labels=[("legal", "superlative", "second\u00a0to\u00a0none")],
    ),
    dict(
        id="B20", title="Case-shifted absolute", content_type="social_post", department="Marketing",
        text=("GUARANTEED RESULTS, every single time, for every customer."),
        labels=[("legal", "guarantee", "GUARANTEED RESULTS")],
    ),

    # ------------------------------------------------------- implicit / implied
    dict(
        id="B21", title="Implied accuracy claim", content_type="blog", department="Product",
        text=("Teams using the model stop arguing about the forecast, because it is usually right."),
        labels=[],
    ),
    dict(
        id="B22", title="Unlabelled figure", content_type="blog", department="Product",
        text=("Adoption doubled last year across the customer base."),
        labels=[("fact_checker", "unsupported_claim", "Adoption doubled last year")],
    ),
    dict(
        id="B23", title="Regulator name-drop", content_type="ad", department="Legal",
        text=("Built to FCA standards and approved by every regulator we have spoken to."),
        labels=[("legal", "absolute", "approved by every regulator")],
    ),

    # ------------------------------------------------------------- access issues
    dict(
        id="B24", title="Vague link in a list", content_type="email", department="Marketing",
        text="Three things changed this month. Read more here. The full notes are attached.",
        labels=[("accessibility", "link_text", "here")],
    ),
    dict(
        id="B25", title="Tiny type spec", content_type="blog", department="Design",
        text="Set the caption at 9px and the footnote at 8px so it fits under the chart.",
        labels=[("accessibility", "small_text", "9px"),
                ("accessibility", "small_text", "8px")],
    ),
]

BLIND_NOTE = (
    "25 samples written after the Round 3 engine changes and scored once, for the final report "
    "only. They are never used for tuning and never run in CI. Six are clean copy: a set of "
    "violations alone would measure recall and hide the cost of false alarms."
)
