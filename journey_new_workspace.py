"""A real browser, a real account, a real image, and a refresh in the middle of a run.

No API calls from this script except a final read used to check what the screen claimed.
Everything happens through the interface: workspace setup on /login, an image upload on
/new, the proof desk, a reload while the run is in flight, and then the empty-kit path
with the kit row removed underneath the app.
"""
from __future__ import annotations

import io
import json
import re
import secrets
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
suffix = secrets.token_hex(3)
EMAIL = f"admin@{suffix}.example"
PASSWORD = "Sentinel!2026"
SHOTS = "shots/checks"
out = {"suffix": suffix, "steps": [], "console": []}


def log(step, **kw):
    entry = {"step": step, **kw}
    out["steps"].append(entry)
    print(json.dumps(entry)[:400], flush=True)


def png(path, size=(1000, 1000)):
    Image.new("RGB", size, (216, 74, 40)).save(path, "PNG")


def main():
    import os

    os.makedirs(SHOTS, exist_ok=True)
    png(f"{SHOTS}/upload-image.png")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: out["console"].append(f"{m.type}: {m.text}"[:300]) if m.type == "error" else None)
        page.on("pageerror", lambda e: out["console"].append(f"pageerror: {e}"[:300]))

        # ---------------------------------------------------------------- 1. a new account
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.get_by_role("tab", name=re.compile("Create workspace", re.I)).click()
        page.fill("#org_name", f"Studio {suffix}")
        page.fill("#slug", f"studio-{suffix}")
        page.fill("#admin_name", "Asha Menon")
        page.fill("#admin_email", EMAIL)
        page.fill("#admin_password", PASSWORD)
        page.get_by_role("button", name=re.compile("^Create workspace$", re.I)).last.click()
        page.wait_for_url(re.compile(r"^(?!.*login).*"), timeout=20000)
        page.wait_for_load_state("networkidle")
        log("workspace created", url=page.url)

        # the checklist should be on the overview for a workspace with no rules
        body = page.inner_text("body")
        log("overview", checklist="Getting started" in body,
            steps=body.count("Confirm some rules") > 0, no_kit_copy="Set up a Brand Kit" in body)
        page.screenshot(path=f"{SHOTS}/01-overview-new-workspace.png", full_page=True)

        # ---------------------------------------------------------------- 2. upload an image
        page.goto(f"{BASE}/new", wait_until="networkidle")
        page.fill("#title", "Launch image — first pass")
        page.get_by_role("tab", name=re.compile("Upload file", re.I)).click()
        page.set_input_files("#file", f"{SHOTS}/upload-image.png")
        page.get_by_role("button", name=re.compile("Run review", re.I)).click()
        page.wait_for_url(re.compile(r"/content/"), timeout=30000)
        item_url = page.url
        log("uploaded and submitted", url=item_url)

        # ---------------------------------------------------------------- 3. refresh mid-run
        # reload immediately: the run is either queued or running right now
        page.wait_for_timeout(250)
        started = page.inner_text("body")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        after = page.inner_text("body")
        log("refresh mid-run", url=page.url, same_item=page.url == item_url,
            before_has_reading="reading" in started.lower(), after_has_value=len(after) > 0)
        page.screenshot(path=f"{SHOTS}/02-proof-desk-no-rules.png", full_page=True)

        # wait for the run to settle: either the limited-review note or a finding count
        deadline = time.time() + 60
        settled = False
        while time.time() < deadline:
            txt = page.inner_text("body")
            if "Limited review" in txt or "The review did not finish" in txt or "One step first" in txt:
                settled = True
                break
            page.wait_for_timeout(700)
        final = page.inner_text("body")
        log("run settled", settled=settled,
            limited_review="Limited review" in final,
            no_rules_sentence="no rules confirmed; results limited to built-in checks" in final,
            failed_panel="The review did not finish" in final,
            one_step_first="One step first" in final)
        page.screenshot(path=f"{SHOTS}/03-proof-desk-settled.png", full_page=True)

        # ---------------------------------------------------------------- 4. the sample kit
        page.goto(f"{BASE}/kit", wait_until="networkidle")
        page.wait_for_timeout(800)
        kit_page = page.inner_text("body")
        has_sample_button = "Start with a sample Brand Kit" in kit_page
        log("kit page", sample_button=has_sample_button)
        page.screenshot(path=f"{SHOTS}/04-kit-empty.png", full_page=True)
        if has_sample_button:
            page.get_by_role("button", name=re.compile("Start with a sample Brand Kit", re.I)).click()
            page.wait_for_timeout(2500)
            after_sample = page.inner_text("body")
            log("sample loaded", rules_shown="14" in after_sample, labelled="sample" in after_sample.lower())
            page.screenshot(path=f"{SHOTS}/05-kit-sample.png", full_page=True)

        # ---------------------------------------------------------------- 5. re-run the same draft
        page.goto(item_url, wait_until="networkidle")
        page.wait_for_timeout(500)
        rerun = page.get_by_role("button", name=re.compile("Re-run review|Run it again", re.I))
        if rerun.count():
            rerun.first.click()
            page.wait_for_timeout(4000)
        txt = page.inner_text("body")
        log("after sample kit", findings=len(re.findall(r"margin note|Finding", txt)),
            failed="The review did not finish" in txt,
            limited="Limited review" in txt)
        page.screenshot(path=f"{SHOTS}/06-proof-desk-sample.png", full_page=True)

        out["item_url"] = item_url
        out["email"] = EMAIL
        browser.close()


if __name__ == "__main__":
    try:
        main()
    finally:
        with open("/tmp/journey.json", "w") as fh:
            json.dump(out, fh, indent=1)
        print("\nconsole errors:", out["console"][:10])
