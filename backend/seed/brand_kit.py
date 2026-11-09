"""Demo Brand Kit for the fictional company Northwind Analytics (B2B SaaS).

Everything here is hand-written for the demo: a guideline document that gets
chunked + embedded, the structured rules an Admin would confirm, term lists,
approved facts, and brand assets (colours, fonts, logo).
"""
from __future__ import annotations

ORG = {
    "name": "Northwind Analytics",
    "slug": "northwind",
    "departments": ["Marketing", "Product", "Sales", "Support", "Executive"],
}

USERS = [
    # email, name, role, department, password
    ("ada@northwind.example", "Ada Okafor", "admin", "Executive", "Sentinel!2026"),
    ("maya@northwind.example", "Maya Lindqvist", "brand_manager", "Marketing", "Sentinel!2026"),
    ("raj@northwind.example", "Raj Menon", "approver", "Executive", "Sentinel!2026"),
    ("tom@northwind.example", "Tom Ferreira", "manager", "Marketing", "Sentinel!2026"),
    ("ines@northwind.example", "Inês Duarte", "manager", "Sales", "Sentinel!2026"),
    ("leo@northwind.example", "Leo Park", "creator", "Marketing", "Sentinel!2026"),
    ("nina@northwind.example", "Nina Haddad", "creator", "Product", "Sentinel!2026"),
    ("sam@northwind.example", "Sam Boateng", "external_creator", "Marketing", "Sentinel!2026"),
]

GUIDELINE_TEXT = """Northwind Analytics — Brand Guidelines, version 4.2
Owner: Brand Team. Applies to all content published by Northwind Analytics and its agencies.

1. Brand Voice
Northwind speaks plainly, warmly and with quiet confidence. We explain what the product does and what it changes for the customer, and we let evidence carry the argument.
Never use hype or superlatives. Words such as revolutionary, game-changing, world-class, best-in-class, cutting-edge, seamless, unleash, supercharge, effortless, amazing, unparalleled and industry-leading are prohibited.
Write sentences under 25 words. Use one exclamation mark at most in an entire piece, and none in email. Address the reader as "you" and the company as "we".
We are never boastful about competitors. Compare on documented capability only, and never name a competitor disparagingly.

2. Terminology
Our product is Northwind Forecast Cloud. Always use the full three-word name on first mention, and never "ForecastCloud", "Northwind Cloud" or "the Forecast tool".
Use the approved vocabulary. Say affordable, not cheap. Say use, not utilize or leverage. Say teamwork, not synergy. Say before, not prior to. Say customers, not users, in external content.
Plain English only: avoid commence, facilitate, terminate, endeavour and in order to.

3. Colour Palette
Primary navy: #0B3D91. Accent amber: #F2A900. Ink: #1A1A1A. Paper: #FFFFFF.
No other hex values may appear in brand content. Amber is an accent only: never set body text in amber and never place amber text on white.
Tints are permitted only as the published 20 percent and 40 percent tints of navy.

4. Typography
Headlines and body: Inter. Long-form editorial: Source Serif 4. No other typefaces are permitted without written approval from the Brand Team.
Body copy must be at least 14pt (16px) on screen. Never set paragraph text below this size.

5. Logo Usage
Use logo version 3.2. The wordmark must keep clear space equal to the height of the letter N on all sides.
Never stretch, recolour or crop the logo. Never place the logo on a busy photograph without the navy scrim.
Older logo versions (1.0, 2.0) are retired and must not appear in new content.

6. Imagery and Aspect Ratios
Photography is documentary and natural: real warehouses, real planners, natural light. Avoid stock-photo handshakes and staged pointing.
Delivered images must be at least 800px wide and at least 1600px wide for retina placements.
Approved aspect ratios: social posts 1:1 (1.00) or 4:5 (0.80); blog hero 16:9 (1.78); display ads 1:1 (1.00) or 1.91:1; email header 3:4 (0.75).
Every informative image needs alt text. Decorative images use an empty alt attribute deliberately.

7. Accessibility
All text must meet WCAG 2.1 AA contrast: 4.5:1 for body text and 3:1 for large text of 24px and above.
Never rely on colour alone to carry meaning. Pair any colour cue with a label or a position cue.
Avoid blocks of all capitals longer than three words. Do not use "click here" or "read here" as link text.
Keep one idea per sentence and one topic per paragraph.

8. Claims and Legal
Never guarantee an outcome. "Guaranteed results", "guaranteed returns" and "100% safe" are prohibited.
Superiority claims such as "best company", "number one" and "industry-leading" require a dated, verifiable third-party source held on file. Without one, do not publish.
Claims about regulatory status, insurance or certification must match the published register exactly.
"No hidden fees", "instant approval" and "free" require the fee schedule or conditions to be stated in the same piece.
Every number in external content must appear on the approved facts list in section 9. If a number is not on that list, either remove it or submit it to the Brand Team for approval.

9. Approved Facts
Customer base: 12,000 customers across 30 countries.
Renewal rate: 87% of customers renew within 12 months.
Onboarding: average onboarding takes 14 days.
Support: support responds within 4 hours on business days.
Pricing: the starter plan starts at £24 per month.
Uptime: platform uptime is 99.95% over the last 12 months.
Certification: Northwind Analytics is ISO 27001 certified.
Forecast accuracy: the median forecast error reduction is 31% in customer pilots.

10. Legal Notes
This document is a brand standard, not legal advice. Regulated claims must be checked by Legal before publication.
Named customer stories require written consent on file.
"""

RULES = [
    {
        "key": "VOI-001", "category": "brand_voice", "check_type": "both", "requires_approver": False,
        "title": "Plain, confident voice — no hype",
        "body": "Never use hype or superlatives; explain what the product does and let evidence carry the argument.",
        "source_section": "1. Brand Voice", "source_page": 1,
    },
    {
        "key": "VOI-002", "category": "brand_voice", "check_type": "both", "requires_approver": False,
        "title": "Sentence length and punctuation",
        "body": "Write sentences under 25 words and use at most one exclamation mark in an entire piece.",
        "source_section": "1. Brand Voice", "source_page": 1,
    },
    {
        "key": "TERM-001", "category": "terminology", "check_type": "deterministic", "requires_approver": False,
        "title": "Approved vocabulary",
        "body": "Use the approved vocabulary: affordable not cheap, use not utilize or leverage, teamwork not synergy, before not prior to, customers not users.",
        "source_section": "2. Terminology", "source_page": 2,
    },
    {
        "key": "TERM-002", "category": "terminology", "check_type": "deterministic", "requires_approver": False,
        "title": "Product naming",
        "body": "The product is Northwind Forecast Cloud. Never write ForecastCloud, Northwind Cloud or the Forecast tool.",
        "source_section": "2. Terminology", "source_page": 2,
    },
    {
        "key": "VIS-001", "category": "visual", "check_type": "deterministic", "requires_approver": False,
        "title": "Logo version 3.2 only",
        "body": "Use logo version 3.2. Older logo versions 1.0 and 2.0 are retired and must not appear in new content.",
        "source_section": "5. Logo Usage", "source_page": 3,
    },
    {
        "key": "VIS-002", "category": "visual", "check_type": "deterministic", "requires_approver": False,
        "title": "Approved colour palette",
        "body": "Only #0B3D91, #F2A900, #1A1A1A and #FFFFFF may appear in brand content. Amber is an accent only.",
        "source_section": "3. Colour Palette", "source_page": 2,
    },
    {
        "key": "VIS-003", "category": "visual", "check_type": "deterministic", "requires_approver": False,
        "title": "Image resolution and aspect ratio",
        "body": "Images must be at least 800px wide (1600px for retina). Social 1:1 or 4:5, blog hero 16:9, ads 1:1 or 1.91:1.",
        "source_section": "6. Imagery and Aspect Ratios", "source_page": 3,
    },
    {
        "key": "A11Y-001", "category": "accessibility", "check_type": "deterministic", "requires_approver": True,
        "title": "WCAG AA contrast",
        "body": "All text must meet WCAG 2.1 AA contrast: 4.5:1 for body text and 3:1 for large text of 24px and above.",
        "source_section": "7. Accessibility", "source_page": 4,
    },
    {
        "key": "A11Y-002", "category": "accessibility", "check_type": "deterministic", "requires_approver": True,
        "title": "Alt text and descriptive links",
        "body": "Every informative image needs alt text, and link text must describe its destination — never 'click here' or 'read here'.",
        "source_section": "7. Accessibility", "source_page": 4,
    },
    {
        "key": "A11Y-003", "category": "accessibility", "check_type": "deterministic", "requires_approver": True,
        "title": "Minimum text size and no all-caps blocks",
        "body": "Body copy must be at least 14pt (16px), and blocks of all capitals longer than three words are not permitted.",
        "source_section": "7. Accessibility", "source_page": 4,
    },
    {
        "key": "LEG-001", "category": "legal", "check_type": "both", "requires_approver": True,
        "title": "No outcome guarantees",
        "body": "Never guarantee an outcome. 'Guaranteed results', 'guaranteed returns', 'risk-free' and '100% safe' are prohibited without written legal sign-off.",
        "source_section": "8. Claims and Legal", "source_page": 5,
    },
    {
        "key": "LEG-002", "category": "legal", "check_type": "both", "requires_approver": True,
        "title": "Superiority claims need evidence",
        "body": "Superiority claims such as 'best company', 'number one' and 'industry-leading' require a dated, verifiable third-party source held on file.",
        "source_section": "8. Claims and Legal", "source_page": 5,
    },
    {
        "key": "LEG-003", "category": "legal", "check_type": "both", "requires_approver": True,
        "title": "Conditions for 'free' and fee claims",
        "body": "'No hidden fees', 'instant approval' and 'free' require the fee schedule or conditions to be stated in the same piece.",
        "source_section": "8. Claims and Legal", "source_page": 5,
    },
    {
        "key": "FACT-001", "category": "fact", "check_type": "both", "requires_approver": False,
        "title": "Only approved numbers",
        "body": "Every number in external content must appear on the approved facts list. If it is not on the list, remove it or submit it to the Brand Team.",
        "source_section": "9. Approved Facts", "source_page": 6,
    },
]

TERMS = [
    ("banned", "cheap", "affordable", "medium", "Approved vocabulary: affordable."),
    ("banned", "utilize", "use", "low", "Plain English."),
    ("banned", "utilise", "use", "low", "Plain English."),
    ("banned", "leverage", "use", "low", "Plain English."),
    ("banned", "synergy", "teamwork", "low", "Plain English."),
    ("banned", "prior to", "before", "low", "Plain English."),
    ("banned", "ForecastCloud", "Northwind Forecast Cloud", "medium", "Product naming."),
    ("banned", "Northwind Cloud", "Northwind Forecast Cloud", "medium", "Product naming."),
    ("approved", "Northwind Forecast Cloud", None, "low", "Full product name."),
    ("approved", "customers", None, "low", "Use customers, not users, externally."),
]

FACTS = [
    ("12,000 customers across 30 countries", "12,000", "customer base", 6),
    ("87% of customers renew within 12 months", "87%", "renewal rate", 6),
    ("Average onboarding takes 14 days", "14", "onboarding", 6),
    ("Support responds within 4 hours on business days", "4", "support", 6),
    ("The starter plan starts at £24 per month", "£24", "pricing", 6),
    ("Platform uptime is 99.95% over the last 12 months", "99.95%", "uptime", 6),
    ("Northwind Analytics is ISO 27001 certified", "ISO 27001", "certification", 6),
    ("The median forecast error reduction is 31% in customer pilots", "31%", "accuracy", 6),
]

ASSETS = [
    {"kind": "colour", "name": "Primary navy", "value": "#0B3D91", "status": "confirmed"},
    {"kind": "colour", "name": "Accent amber", "value": "#F2A900", "status": "confirmed"},
    {"kind": "colour", "name": "Ink", "value": "#1A1A1A", "status": "confirmed"},
    {"kind": "colour", "name": "Paper", "value": "#FFFFFF", "status": "confirmed"},
    {"kind": "font", "name": "Inter (headline + body)", "value": "Inter", "status": "confirmed",
     "meta": {"aspect_ratios": {"social_post": [1.0, 0.8], "blog": [1.778], "ad": [1.0, 1.91], "email": [0.75]}}},
    {"kind": "font", "name": "Source Serif 4 (editorial)", "value": "Source Serif 4", "status": "confirmed"},
    {"kind": "logo", "name": "Northwind wordmark", "value": "wordmark-3.2.svg", "version": "3.2",
     "status": "confirmed"},
    {"kind": "logo", "name": "Northwind wordmark (retired)", "value": "wordmark-2.0.svg", "version": "2.0",
     "status": "retired"},
]
