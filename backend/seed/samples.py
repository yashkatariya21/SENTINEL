"""53 hand-labelled demo samples with seeded mistakes.

Each sample carries `labels`: what a careful human reviewer would flag, with the
exact span. 8 samples are deliberately clean - they measure the false-positive
rate, which is the number brand teams actually argue about.

Used for (a) demo content and (b) the regression test set re-run after every
rule promotion.
"""
from __future__ import annotations

# (id, title, content_type, department, text, labels[(reviewer, type, span_text)])
SAMPLES: list[dict] = [
    # ------------------------------------------------------------------ clean
    dict(id="C01", title="Renewal social post", content_type="social_post", department="Marketing",
         text="Forecast planning that fits how your team already works. Northwind Forecast Cloud brings demand, "
              "supply and finance into one weekly rhythm. 87% of customers renew within 12 months.",
         labels=[]),
    dict(id="C02", title="Drifting forecast blog", content_type="blog", department="Product",
         text="Three signals that your forecast is drifting. Demand plans fail quietly. A spread that widens week "
              "after week is the first sign. A second sign is a pipeline that no longer matches last quarter's wins. "
              "The third is a team that stops trusting the number. Northwind Forecast Cloud surfaces all three in one "
              "view, so the conversation moves from blame to the next decision.",
         labels=[]),
    dict(id="C03", title="Roundtable follow-up email", content_type="email", department="Marketing",
         text="Hello Priya, thank you for joining the planning roundtable last week. We have attached the notes and "
              "the two templates we discussed. If anything is unclear, reply to this email and a planner will reply.",
         labels=[]),
    dict(id="C04", title="Quarter planning ad", content_type="ad", department="Marketing",
         text="Plan the quarter with confidence. Northwind Forecast Cloud connects demand, supply and finance in one "
              "weekly rhythm. Book a walkthrough with our team.",
         labels=[]),
    dict(id="C05", title="Warehouse field note", content_type="social_post", department="Support",
         text="A field note from a warehouse in Leeds: the morning count takes twenty minutes instead of ninety. "
              "That is what better planning looks like. #supplychain #forecasting #planning",
         labels=[]),
    dict(id="C06", title="Onboarding timeline blog", content_type="blog", department="Product",
         text="Onboarding takes fourteen days on average. Week one is data connection. Week two is the first forecast "
              "review with your planner. Customers usually run both in parallel with their existing process.",
         labels=[]),
    dict(id="C07", title="Support hours email", content_type="email", department="Support",
         text="Support responds within four hours on business days. Our team is in Lisbon and Chennai, so there is "
              "usually someone awake. Reply to this email and we will route your question to the right planner.",
         labels=[]),
    dict(id="C08", title="Warehouse reality ad", content_type="ad", department="Sales",
         text="Your forecast should survive contact with the warehouse. Northwind Forecast Cloud shows demand, supply "
              "and finance together, every week. See the product tour.",
         labels=[]),

    # ---------------------------------------------------------- terminology
    dict(id="T01", title="Starter plan social", content_type="social_post", department="Marketing",
         text="Our cheap starter plan makes weekly planning possible for small teams.",
         labels=[("terminology", "banned_term", "cheap")]),
    dict(id="T02", title="Scenario planning blog", content_type="blog", department="Product",
         text="Utilize the planner view to compare two scenarios side by side.",
         labels=[("terminology", "banned_term", "Utilize")]),
    dict(id="T03", title="Weekly rhythm ad", content_type="ad", department="Sales",
         text="Leverage the weekly rhythm to cut planning meetings in half.",
         labels=[("terminology", "banned_term", "Leverage")]),
    dict(id="T04", title="Workshop prep email", content_type="email", department="Support",
         text="Prior to the workshop, connect your ERP export in the data room.",
         labels=[("terminology", "banned_term", "Prior to")]),
    dict(id="T05", title="Teamwork social post", content_type="social_post", department="Marketing",
         text="We bring synergy between planning and finance teams.",
         labels=[("terminology", "banned_term", "synergy")]),
    dict(id="T06", title="Weekly review blog", content_type="blog", department="Product",
         text="Teams utilize Northwind Forecast Cloud for the weekly review.",
         labels=[("terminology", "banned_term", "utilize")]),
    dict(id="T07", title="Product naming ad", content_type="ad", department="Marketing",
         text="ForecastCloud connects your demand and supply plans.",
         labels=[("terminology", "product_name", "ForecastCloud")]),

    # ----------------------------------------------------------- brand voice
    dict(id="V01", title="Engine launch social", content_type="social_post", department="Marketing",
         text="Our revolutionary planning engine turns messy spreadsheets into a weekly rhythm.",
         labels=[("brand_voice", "hype", "revolutionary")]),
    dict(id="V02", title="Craft blog", content_type="blog", department="Marketing",
         text="World-class planners deserve tools that match their craft, and that is what we build.",
         labels=[("brand_voice", "hype", "World-class")]),
    dict(id="V03", title="Mid-market ad", content_type="ad", department="Sales",
         text="A game-changing approach to demand planning for mid-market teams.",
         labels=[("brand_voice", "hype", "game-changing")]),
    dict(id="V04", title="Spreadsheet email", content_type="email", department="Product",
         text="A seamless way to move from spreadsheet to forecast in one week.",
         labels=[("brand_voice", "hype", "seamless")]),
    dict(id="V05", title="Connected view social", content_type="social_post", department="Marketing",
         text="Unleash your weekly planning with one connected view.",
         labels=[("brand_voice", "hype", "Unleash")]),
    dict(id="V06", title="Finance rhythm blog", content_type="blog", department="Executive",
         text="The result is an amazing planning rhythm that finance and operations share.",
         labels=[("brand_voice", "hype", "amazing")]),
    dict(id="V07", title="On-time ad", content_type="ad", department="Marketing",
         text="Cutting-edge forecasting for teams that ship on time.",
         labels=[("brand_voice", "hype", "Cutting-edge")]),
    dict(id="V08", title="Accuracy blog", content_type="blog", department="Marketing",
         text="Our industry-leading accuracy comes from a decade of warehouse data.",
         labels=[("brand_voice", "hype", "industry-leading"),
                 ("fact_checker", "unsupported_claim",
                  "Our industry-leading accuracy comes from a decade of warehouse data.")]),

    # ---------------------------------------------------------------- legal
    dict(id="L01", title="Money-back ad", content_type="ad", department="Sales",
         text="Guaranteed results in ninety days or your money back.",
         labels=[("legal", "guarantee", "Guaranteed results"),
                 ("fact_checker", "unsupported_claim", "Guaranteed results in ninety days or your money back.")]),
    dict(id="L02", title="Regulated environments social", content_type="social_post", department="Marketing",
         text="100% safe for regulated environments.",
         labels=[("legal", "absolute_safety", "100% safe"),
                 ("fact_checker", "unsupported_claim", "100% safe for regulated environments.")]),
    dict(id="L03", title="Europe leadership blog", content_type="blog", department="Executive",
         text="We are the best company for supply-chain forecasting in Europe.",
         labels=[("legal", "superiority", "best company"),
                 ("fact_checker", "unsupported_claim",
                  "We are the best company for supply-chain forecasting in Europe.")]),
    dict(id="L04", title="Cancellation email", content_type="email", department="Support",
         text="This offer is risk-free and you can cancel any time.",
         labels=[("legal", "risk", "risk-free"),
                 ("fact_checker", "unsupported_claim", "This offer is risk-free and you can cancel any time.")]),
    dict(id="L05", title="Fee schedule ad", content_type="ad", department="Sales",
         text="No hidden fees, and instant approval for most applications.",
         labels=[("legal", "fees", "No hidden fees"),
                 ("legal", "fees", "instant approval"),
                 ("fact_checker", "unsupported_claim", "No hidden fees, and instant approval for most applications.")]),
    dict(id="L06", title="Analyst endorsement blog", content_type="blog", department="Marketing",
         text="Approved by industry analysts and regulators alike.",
         labels=[("legal", "endorsement", "Approved by")]),
    dict(id="L07", title="Ranking ad", content_type="ad", department="Sales",
         text="Number one for forecasting accuracy across mid-market teams.",
         labels=[("legal", "superiority", "Number one"),
                 ("fact_checker", "unsupported_claim",
                  "Number one for forecasting accuracy across mid-market teams.")]),
    dict(id="L08", title="Stress claim email", content_type="email", department="Marketing",
         text="Clinically proven to reduce planning stress.",
         labels=[("legal", "health_claim", "Clinically proven")]),

    # -------------------------------------------------------------- facts
    dict(id="F01", title="Renewal stat blog", content_type="blog", department="Marketing",
         text="98% of customers renew within 12 months, which is why planning teams stay.",
         labels=[("fact_checker", "contradicted_fact",
                  "98% of customers renew within 12 months, which is why planning teams stay.")]),
    dict(id="F02", title="Customer count ad", content_type="ad", department="Sales",
         text="Join 3.2 million customers who plan their quarter with us.",
         labels=[("fact_checker", "unsupported_claim",
                  "Join 3.2 million customers who plan their quarter with us.")]),
    dict(id="F03", title="Pricing email", content_type="email", department="Sales",
         text="The starter plan is just £18 per month for the first year.",
         labels=[("fact_checker", "contradicted_fact",
                  "The starter plan is just £18 per month for the first year.")]),
    dict(id="F04", title="Automation blog", content_type="blog", department="Product",
         text="Teams save 9 hours a week with automated forecast reviews.",
         labels=[("fact_checker", "unsupported_claim",
                  "Teams save 9 hours a week with automated forecast reviews.")]),
    dict(id="F05", title="Support hours social", content_type="social_post", department="Support",
         text="Support responds within 4 hours on business days.",
         labels=[]),
    dict(id="F06", title="Uptime ad", content_type="ad", department="Product",
         text="Our uptime is 99.9% across every region.",
         labels=[("fact_checker", "contradicted_fact", "Our uptime is 99.9% across every region.")]),
    dict(id="F07", title="Reach email", content_type="email", department="Executive",
         text="We serve 12,000 customers across 30 countries.",
         labels=[]),
    dict(id="F08", title="Speed social", content_type="social_post", department="Product",
         text="Planners report 42% faster cycles after one week.",
         labels=[("fact_checker", "unsupported_claim", "Planners report 42% faster cycles after one week.")]),

    # ------------------------------------------------------- accessibility
    dict(id="A01", title="Compact footer email", content_type="email", department="Marketing",
         text="Set the footer in 12pt Inter so it stays compact.",
         labels=[("accessibility", "small_text", "12pt")]),
    dict(id="A02", title="Legal frame ad", content_type="ad", department="Marketing",
         text="Legal terms may appear at 10px on the final frame.",
         labels=[("accessibility", "small_text", "10px")]),
    dict(id="A03", title="Pricing link blog", content_type="blog", department="Sales",
         text="For the pricing sheet click here to open the PDF.",
         labels=[("accessibility", "link_text", "click here")]),
    dict(id="A04", title="Buyer guide social", content_type="social_post", department="Marketing",
         text="DOWNLOAD THE COMPLETE BUYER GUIDE TODAY",
         labels=[("accessibility", "all_caps", "DOWNLOAD THE COMPLETE BUYER GUIDE TODAY")]),
    dict(id="A05", title="Confirm button email", content_type="email", department="Product",
         text="Select the red button at the bottom to confirm.",
         labels=[("accessibility", "colour_only", "red button")]),
    dict(id="A06", title="Methodology note social", content_type="social_post", department="Product",
         text="Read here for the full methodology note.",
         labels=[("accessibility", "link_text", "Read here")]),
    dict(id="A07", title="Bare link ad", content_type="ad", department="Marketing",
         text="Learn more.",
         labels=[("accessibility", "link_text", "Learn more")]),
    dict(id="A08", title="Late shipment blog", content_type="blog", department="Support",
         text="The summary box uses green text to flag late shipments.",
         labels=[("accessibility", "colour_only", "green text")]),

    # ------------------------------------------------------------- visual
    dict(id="S01", title="Campaign highlight social", content_type="social_post", department="Marketing",
         text="Use #FF00FF for the campaign highlight bar.",
         labels=[("visual", "off_palette", "#FF00FF")]),
    dict(id="S02", title="Hero gradient ad", content_type="ad", department="Marketing",
         text="The background gradient runs from #0B3D91 to #00FF00 in the hero.",
         labels=[("visual", "off_palette", "#00FF00")]),
    dict(id="S03", title="Page furniture blog", content_type="blog", department="Product",
         text="Place the old logo in the top-left corner of every page.",
         labels=[("visual", "logo_version", "old logo")]),
    dict(id="S04", title="Footer template email", content_type="email", department="Support",
         text="The legacy logo still appears in the footer template.",
         labels=[("visual", "logo_version", "legacy logo")]),
    dict(id="S05", title="Accent colour social", content_type="social_post", department="Marketing",
         text="Hero uses #F2A900 as the accent colour behind the headline.",
         labels=[]),
    dict(id="S06", title="Partner brand ad", content_type="ad", department="Sales",
         text="Set the call-to-action bar to #123456 to match the partner brand.",
         labels=[("visual", "off_palette", "#123456")]),
]


def by_id(sample_id: str) -> dict:
    for s in SAMPLES:
        if s["id"] == sample_id:
            return s
    raise KeyError(sample_id)
