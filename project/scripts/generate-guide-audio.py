#!/usr/bin/env python3

import base64
import json
import sys
import subprocess
import time
from pathlib import Path


ROOT = Path("/Users/penthouse/Documents/New project/project")
OUT_DIR = ROOT / "public" / "guide-audio"
APP_NAME = "Google Chrome"
TTS_URL = "https://ttsforall.com/"
DOWNLOADS_DIR = Path("/Users/penthouse/Downloads")


GUIDES = [
    {
        "key": "driver_onboarding",
        "voice": "en-US-AriaNeural",
        "filename": "driver-onboarding-aria.mp3",
        "text": (
            "Welcome to Penthouse Dispatch. Set your home address so the scheduler can match nearby work. "
            "When a trip offer comes in, your phone vibrates and you accept or reject it on screen. "
            "Keep location on, follow each onboarding step, and tap Request Rides Near Me when you are ready to start. "
            "Drive safe, stay professional, and come back to this guide anytime you need a quick refresher."
        ),
    },
    {
        "key": "driver_guide",
        "voice": "en-US-GuyNeural",
        "filename": "driver-guide-guy.mp3",
        "text": (
            "Here is the quick driver guide. To get trips, tap Request Rides Near Me and watch for the timer. "
            "Accept fast, use the trip card to open maps, confirm when you arrive, then complete the ride after dropoff. "
            "Use the chat button for dispatch help, the SOS button only for real emergencies, and the break timer when you need to pause new offers. "
            "Your earnings, schedule, incentives, and payout setup are all inside the driver app. "
            "Keep your status, location, and phone volume on so you do not miss assigned work."
        ),
    },
    {
        "key": "rider_guide",
        "voice": "en-US-JennyNeural",
        "filename": "rider-guide-jenny.mp3",
        "text": (
            "Welcome to rider tracking. This page shows your driver, pickup, dropoff, and live map updates. "
            "If your driver is on the way, keep your phone nearby and be ready at pickup. "
            "If the trip status changes, stay on this page and you will keep getting updates. "
            "You can copy or share the tracking link with family or a caregiver. "
            "If we need to find a new driver, do not panic. The app will keep looking and update this page for you."
        ),
    },
    {
        "key": "company_guide",
        "voice": "en-GB-RyanNeural",
        "filename": "company-guide-ryan.mp3",
        "text": (
            "Welcome to the company dashboard. Use Dispatch to watch live trips, assign drivers, and recover rejected trips with reassign, reroute, or trip copy when needed. "
            "Use Drivers to keep roster, TLC details, pay, and status current. Use Marketplace to refresh provider trips. "
            "Use Settings and AI Settings to control branding, routing, and recovery behavior. "
            "Review onboarding before a driver goes live, keep billing contact details current, and use Guide Audio anytime your team needs quick training."
        ),
    },
    {
        "key": "dispatcher_guide",
        "voice": "en-US-AriaNeural",
        "filename": "dispatcher-guide-aria.mp3",
        "text": (
            "Dispatcher guide. Refresh the open queue, select the best driver, and assign trips carefully so Sentry and dispatch stay in sync. "
            "Use recovery tools only when needed. Reassign to a free driver after a reject, reroute if the route changes, and use trip copy only when the broker expects a new trip record. "
            "Always watch sync status and error logs before moving to the next live step."
        ),
    },
    {
        "key": "admin_guide",
        "voice": "en-US-GuyNeural",
        "filename": "admin-guide-guy.mp3",
        "text": (
            "Admin guide. Use the admin tools to review companies, audit logs, guide settings, and Sentry readiness without changing live dispatch by accident. "
            "Check sync logs, verify live provider payloads, and keep guide audio and branding current. "
            "When testing with a broker, move one step at a time and confirm what the broker sees before you continue."
        ),
    },
]


def chrome_js(script: str) -> str:
    args = []
    for line in [
        f'tell application "{APP_NAME}" to activate',
        f'tell application "{APP_NAME}" to execute active tab of front window javascript "{script}"',
    ]:
        args.extend(["-e", line])
    result = subprocess.run(
        ["osascript", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def generate_audio_download(text: str, voice: str, destination: Path) -> None:
    encoded_text = base64.b64encode(text.encode("utf-8")).decode("ascii")
    js = (
        "document.querySelector('#text').value = decodeURIComponent(escape(atob('"
        + encoded_text
        + "')));"
        "document.querySelector('#text').dispatchEvent(new Event('input',{bubbles:true}));"
        f"document.querySelector('#voice').value = '{voice}';"
        "document.querySelector('#voice').dispatchEvent(new Event('change',{bubbles:true}));"
        "document.querySelector('#download').href='';"
        "document.querySelector('#audio').src='';"
        "document.querySelector('button[type=submit]').click();"
        "'started';"
    )
    chrome_js(js)

    href = ""
    for _ in range(45):
        time.sleep(1)
        href = chrome_js("document.querySelector('#download')?.href || '';")
        if href.startswith("http"):
            break
    if not href.startswith("http"):
        raise RuntimeError(f"Timed out waiting for generated audio for {voice}")

    before = {path.name for path in DOWNLOADS_DIR.glob("*.mp3")}
    download_started_at = time.time()
    chrome_js("document.querySelector('#download').click(); 'downloaded';")

    for _ in range(90):
        time.sleep(1)
        newest = sorted(
            (
                path for path in DOWNLOADS_DIR.glob("*.mp3")
                if path.name not in before and path.stat().st_mtime >= download_started_at
            ),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not newest:
            continue
        candidate = newest[0]
        if candidate.with_suffix(candidate.suffix + ".crdownload").exists():
            continue
        destination.write_bytes(candidate.read_bytes())
        candidate.unlink(missing_ok=True)
        return

    raise RuntimeError(f"Timed out downloading generated audio file for {voice}")


def open_url(url: str) -> None:
    subprocess.run(["open", "-a", APP_NAME, url], check=True)
    time.sleep(2)


def push_files_to_origin(origin_url: str) -> None:
    open_url(origin_url)
    for guide in GUIDES:
        path = OUT_DIR / guide["filename"]
        mime = "audio/mpeg"
        data_url = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
        record = json.dumps(
            {
                "key": guide["key"],
                "type": "upload",
                "label": path.name,
                "src": data_url,
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        storage_key = f"pd_guide_audio:{guide['key']}"
        js = f"localStorage.setItem('{storage_key}', {json.dumps(record)}); 'ok';"
        chrome_js(js)

    chrome_js("window.location.reload(); 'reloaded';")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    push_origin = None
    if len(sys.argv) >= 3 and sys.argv[1] == "--push-origin":
      push_origin = sys.argv[2]

    open_url(TTS_URL)

    for guide in GUIDES:
        destination = OUT_DIR / guide["filename"]
        generate_audio_download(guide["text"], guide["voice"], destination)
        manifest[guide["key"]] = {
            "file": str(destination),
            "voice": guide["voice"],
        }
        print(f"generated {guide['key']} -> {destination.name}")

    if push_origin:
        push_files_to_origin(push_origin)
        print(f"pushed guide audio into browser storage for {push_origin}")

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
