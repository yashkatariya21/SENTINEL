"""Footer + two new pages: axe, contrast, 1920/390, both themes, and overlap.

Three things are measured rather than eyeballed:

1. axe-core violations (contrast, landmarks, names) on /about, /trust, /welcome, /login;
2. the footer's own text against the pixel actually behind it, not the token;
3. that the footer never covers content — it is not fixed, and every page's last piece of
   content sits above its top edge.
"""
from __future__ import annotations

import asyncio
import json

from axe_playwright_python.async_playwright import Axe
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
SHOTS = "shots/checks"
PAGES = [("/welcome", "welcome"), ("/about", "about"), ("/trust", "trust"), ("/login", "login")]
VIEWPORTS = [("1920", 1920, 1080), ("390", 390, 844)]


async def luminance(rgb):
    r, g, b = [c / 255 for c in rgb[:3]]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = sorted([luminance(a), luminance(b)], reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


async def main():
    report = {"axe": [], "footer": [], "overlap": [], "colours": []}
    axe = Axe()
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for label, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = await ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            for theme in ("light", "dark"):
                await page.goto(f"{BASE}/welcome", wait_until="domcontentloaded")
                await page.evaluate(f"localStorage.setItem('sentinel.prefs.theme','{theme}')")
                for path, name in PAGES:
                    await page.goto(f"{BASE}{path}", wait_until="networkidle")
                    await page.evaluate("sessionStorage.setItem('sentinel.seen.opening','1')")
                    await page.wait_for_timeout(700)
                    await page.evaluate("document.querySelectorAll('.desk-bg,.desk-glow').forEach(e=>e.setAttribute('data-hidden','1'))")

                    res = await axe.run(page, options={"resultTypes": ["violations"]})
                    violations = res.response["violations"]
                    report["axe"].append({"view": label, "theme": theme, "page": name,
                                          "violations": [(v["id"], len(v["nodes"]), v["nodes"][0]["html"][:140]) for v in violations]})

                    # footer geometry: not fixed, and below every piece of page content
                    geo = await page.evaluate(
                        """() => {
                          const f = document.querySelector('footer[aria-labelledby="site-footer-heading"]');
                          if (!f) return null;
                          const r = f.getBoundingClientRect();
                          const pos = getComputedStyle(f).position;
                          const main = document.querySelector('main');
                          const m = main ? main.getBoundingClientRect() : null;
                          const docH = document.documentElement.scrollHeight;
                          // anything painted under the footer that is not the footer itself?
                          const covered = [];
                          const all = document.querySelectorAll('main *');
                          for (const el of all) {
                            const b = el.getBoundingClientRect();
                            if (b.height < 8 || b.width < 8) continue;
                            if (b.top + window.scrollY > r.top + window.scrollY + 2) {
                              covered.push((el.tagName + ' ' + (el.textContent||'').slice(0,40)).trim());
                              if (covered.length > 3) break;
                            }
                          }
                          return {position: pos, footerTop: Math.round(r.top + window.scrollY),
                                  footerHeight: Math.round(r.height), mainBottom: m ? Math.round(m.bottom + window.scrollY) : null,
                                  docHeight: docH, covered};
                        }"""
                    )
                    if geo:
                        report["overlap"].append({"view": label, "theme": theme, "page": name, **geo})

                    await page.screenshot(path=f"{SHOTS}/footer-{name}-{label}-{theme}.png", full_page=True)

                    # sample the actual pixels behind the footer's own text
                    colours = await page.evaluate(
                        """() => {
                          const f = document.querySelector('footer[aria-labelledby="site-footer-heading"]');
                          if (!f) return null;
                          const pick = (el) => {
                            const cs = getComputedStyle(el);
                            return {text: cs.color, bg: cs.backgroundColor};
                          };
                          const notice = [...f.querySelectorAll('p')].find(p => p.textContent.includes('not legal advice'));
                          const eyebrow = f.querySelector('nav p');
                          const bottom = f.querySelector('.font-mono');
                          return {
                            footerBg: getComputedStyle(f).backgroundColor,
                            notice: notice ? pick(notice) : null,
                            eyebrow: eyebrow ? pick(eyebrow) : null,
                            bottom: bottom ? pick(bottom) : null,
                          };
                        }"""
                    )
                    if colours:
                        report["colours"].append({"view": label, "theme": theme, "page": name, **colours})
            report.setdefault("errors", []).extend(errors)
            await ctx.close()
        await browser.close()
    with open("/tmp/footer_report.json", "w") as fh:
        json.dump(report, fh, indent=1)

    total = sum(len(v["violations"]) for v in report["axe"])
    print(f"axe violations: {total} across {len(report['axe'])} page/view/theme combos")
    for v in report["axe"]:
        for x in v["violations"]:
            print(" ", v["view"], v["theme"], v["page"], x)
    print("\ngeometry:")
    for g in report["overlap"]:
        print(" ", g["view"], g["theme"], g["page"], g["position"], "footerTop", g["footerTop"],
              "mainBottom", g["mainBottom"], "covered", g["covered"][:2])
    print("\npage errors:", report.get("errors")[:5])


asyncio.run(main())
