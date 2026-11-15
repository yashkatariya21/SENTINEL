"""Second pass: 390 px, the dismiss, and the no-kit path that signup can no longer produce.

The no-kit state is real for organisations created before this change (and for anyone who
deletes a kit), so it is generated here by deleting the kit row from the live database
while the browser is signed in, then driving the screens a user would touch.
"""
from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
DB = "backend/sentinel.db"  # the local SQLite the dev API is using
SHOTS = "shots/checks"
out = {"steps": [], "console": [], "axe": []}


def log(step, **kw):
    entry = {"step": step, **kw}
    out["steps"].append(entry)
    print(json.dumps(entry)[:500], flush=True)


def delete_kits(email: str) -> str:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    org_id = cur.execute(
        "select org_id from users where email = ?", (email,)).fetchone()[0]
    con.execute("delete from rule_versions where rule_id in (select id from rules where org_id = ?)", (org_id,))
    for table in ("findings", "terms", "facts", "assets", "chunks", "rules", "documents",
                  "rule_review_tasks", "brand_kits"):
        try:
            con.execute(f"delete from {table} where org_id = ?", (org_id,))
        except sqlite3.OperationalError as exc:
            print("skip", table, exc)
    con.commit()
    left = cur.execute("select count(*) from brand_kits where org_id = ?", (org_id,)).fetchone()[0]
    con.close()
    return f"kits left: {left}"


async def main(email: str, item_url: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: out["console"].append(f"pageerror: {e}"[:240]))

        # sign in with the same account the first pass created
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#email", email)
        await page.fill("#password", "Sentinel!2026")
        await page.get_by_role("button", name="Sign in", exact=False).last.click()
        await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        await page.wait_for_load_state("networkidle")
        log("signed in", url=page.url)

        # ---- the checklist at 390, and that dismissing it sticks
        await page.wait_for_timeout(1200)
        body = await page.inner_text("body")
        log("390 overview", checklist="Getting started" in body,
            overflow=await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))
        await page.screenshot(path=f"{SHOTS}/10-overview-390.png", full_page=True)
        if "Dismiss" in body:
            await page.get_by_role("button", name="Dismiss").first.click()
            await page.wait_for_timeout(400)
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(900)
            after = await page.inner_text("body")
            log("dismiss persisted", still_there="Getting started" in after)

        # ---- delete the kit underneath the signed-in browser
        result = delete_kits(email)
        log("kit removed from the database", result=result)

        # ---- /kit must show a calm empty state with an action, not a skeleton for ever
        await page.goto(f"{BASE}/kit", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        kit_body = await page.inner_text("body")
        log("390 kit without a kit", empty_state="No Brand Kit yet" in kit_body,
            action="Create an empty Brand Kit" in kit_body,
            still_skeleton=kit_body.strip().count("\n") < 3)
        await page.screenshot(path=f"{SHOTS}/11-kit-no-kit-390.png", full_page=True)

        # ---- /new with an image: upload succeeds, review is refused with a route
        await page.goto(f"{BASE}/new", wait_until="networkidle")
        await page.fill("#title", "Mobile image, no kit")
        await page.get_by_role("tab", name="Upload file").click()
        from PIL import Image

        os.makedirs(SHOTS, exist_ok=True)
        Image.new("RGB", (1000, 1000), (216, 74, 40)).save(f"{SHOTS}/upload-image.png", "PNG")
        await page.set_input_files("#file", f"{SHOTS}/upload-image.png")
        await page.get_by_role("button", name="Run review").click()
        await page.wait_for_timeout(2500)
        new_body = await page.inner_text("body")
        log("390 submit without a kit", one_step_first="One step first" in new_body,
            route="Go to the Brand Kit" in new_body,
            retry="Retry the review" in new_body or "Try again" in new_body,
            raw_error="Internal error" in new_body)
        await page.screenshot(path=f"{SHOTS}/12-new-no-kit-390.png", full_page=True)

        # ---- the proof desk of the item that exists but cannot be reviewed
        await page.goto(item_url, wait_until="networkidle")
        await page.wait_for_timeout(2500)
        desk = await page.inner_text("body")
        log("390 proof desk without a kit", one_step_first="One step first" in desk,
            route="Set up the Brand Kit" in desk,
            failed_panel="The review did not finish" in desk,
            blank=len(desk.strip()) < 40)
        await page.screenshot(path=f"{SHOTS}/13-proof-no-kit-390.png", full_page=True)
        out["axe"] = await page.evaluate("1")
        await browser.close()


if __name__ == "__main__":
    email, item = sys.argv[1], sys.argv[2]
    try:
        asyncio.run(main(email, item))
    finally:
        with open("/tmp/checks2.json", "w") as fh:
            json.dump(out, fh, indent=1)
        print("\npage errors:", out["console"][:6])
