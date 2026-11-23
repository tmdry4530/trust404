"""Check the packaged demo in a real offline Chromium browser (optional Playwright dependency)."""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def check(page_path, chromium_path):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chromium_path)
        context = browser.new_context(offline=True, viewport={"width": 1280, "height": 900})
        page = context.new_page()
        errors, requests = [], []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.on("request", lambda req: requests.append(req.url) if req.url.startswith(("http:", "https:")) else None)
        page.goto(page_path.resolve().as_uri())
        for scenario, verdict, count in [
            ("limit", "거절 사유 일치", 6),
            ("merchant", "거절 사유 일치", 6),
            ("false-reason", "정책상 허용 · 영수증은 거절", 5),
            ("tamper", "요청 서명 불일치", 1),
        ]:
            page.locator("#scenario").select_option(scenario)
            page.wait_for_function(
                """([title, score]) => document.querySelector('#verdict-title').textContent === title
                && document.querySelector('#check-summary').textContent.startsWith(score)""",
                arg=[verdict, f"{count} / 6"],
            )
        page.get_by_role("button", name="로컬넷 실측 영수증").click()
        page.wait_for_function("""document.querySelector('#asset').textContent === 'TEST' &&
                               document.querySelector('#verdict-card').dataset.state === 'verified'""")
        for width in [320, 390, 768, 1280, 1440]:
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth") == width, width
        assert not errors, errors
        assert not requests, requests
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("page", type=Path)
    parser.add_argument("--chromium", help="Installed Chromium or headless shell executable")
    args = parser.parse_args()
    check(args.page, args.chromium)
    print("All five scenarios passed offline.")
