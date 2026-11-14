#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dalil Ra9mana Desktop Agent  —  وكيل دليل الرقمنة
====================================================
Connects to the Dalil Ra9mana platform via WebSocket and executes
local automation tasks: screen control, file operations, SMS via GSM
modem, and parent contact scraping from the digitalization platform.

Requirements (install once):
    pip install -r requirements.txt

Usage:
    python agent.py --server https://dalilra9mana.onrender.com --token YOUR_TOKEN

    OR create agent_config.json:
    {
      "serverUrl": "https://dalilra9mana.onrender.com",
      "token":     "paste-token-here"
    }
    then just: python agent.py
"""

import argparse
import base64
import io
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

# ─── Dependency check ──────────────────────────────────────────────────────────
MISSING = []
try:
    import socketio as _sio_mod
except ImportError:
    MISSING.append("python-socketio[client]")

if MISSING:
    print("❌ مكتبات مفقودة. نفّذ الأمر التالي ثم أعد تشغيل الوكيل:")
    print(f"   pip install {' '.join(MISSING)}")
    sys.exit(1)

import socketio  # noqa: E402

try:
    import pyautogui
    pyautogui.FAILSAFE = True
    PYAUTOGUI_OK = True
except ImportError:
    PYAUTOGUI_OK = False

try:
    from PIL import ImageGrab
    PIL_OK = True
except ImportError:
    PIL_OK = False

# ─── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent")

# ─── Constants ─────────────────────────────────────────────────────────────────
SOCKET_PATH    = "/agent-socket"
HEARTBEAT_SEC  = 30
CONFIG_FILE    = Path(__file__).parent / "agent_config.json"

# ─── Socket.IO client ──────────────────────────────────────────────────────────
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,   # infinite
    reconnection_delay=5,
    reconnection_delay_max=60,
    logger=False,
    engineio_logger=False,
)

# ─── Screen helpers ────────────────────────────────────────────────────────────

def _take_screenshot() -> str:
    """Return a base64-encoded PNG screenshot."""
    if PIL_OK:
        img = ImageGrab.grab()
    elif PYAUTOGUI_OK:
        img = pyautogui.screenshot()
    else:
        raise RuntimeError("لا تتوفر مكتبة لالتقاط الشاشة (Pillow / pyautogui)")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ─── Result emitters ───────────────────────────────────────────────────────────

def emit_result(action: str, ok: bool, details: dict):
    status = "success" if ok else "failed"
    sio.emit("agent:taskResult", {
        "action":  action,
        "status":  status,
        "details": details,
        "taskId":  str(int(time.time() * 1000)),
    })
    sio.emit("task_result", {
        "action": action,
        "status": "ok" if ok else "error",
        "result": details,
    })


def emit_frame(b64: str):
    sio.emit("agent:screenFrame", b64)
    sio.emit("screen_response", {"image": b64})


# ─── Handlers ──────────────────────────────────────────────────────────────────

def h_screenshot(_payload: dict) -> tuple[bool, dict]:
    b64 = _take_screenshot()
    emit_frame(b64)
    return True, {"ok": True, "bytes": len(b64)}


def h_click(p: dict) -> tuple[bool, dict]:
    if not PYAUTOGUI_OK:
        return False, {"error": "pyautogui غير مثبّت"}
    x, y = int(p.get("x", 0)), int(p.get("y", 0))
    pyautogui.click(x, y)
    return True, {"ok": True, "x": x, "y": y}


def h_type(p: dict) -> tuple[bool, dict]:
    if not PYAUTOGUI_OK:
        return False, {"error": "pyautogui غير مثبّت"}
    text = str(p.get("text", ""))
    try:
        import pyperclip
        pyperclip.copy(text)
        pyautogui.hotkey("ctrl", "v")
    except ImportError:
        # Fallback: type ASCII only
        pyautogui.typewrite(text, interval=0.04)
    return True, {"ok": True, "length": len(text)}


def h_press(p: dict) -> tuple[bool, dict]:
    if not PYAUTOGUI_OK:
        return False, {"error": "pyautogui غير مثبّت"}
    key = str(p.get("key", ""))
    pyautogui.press(key)
    return True, {"ok": True, "key": key}


def h_hotkey(p: dict) -> tuple[bool, dict]:
    if not PYAUTOGUI_OK:
        return False, {"error": "pyautogui غير مثبّت"}
    keys = p.get("keys", [])
    pyautogui.hotkey(*keys)
    return True, {"ok": True, "keys": keys}


def h_open_folder(p: dict) -> tuple[bool, dict]:
    path = p.get("path", "")
    if sys.platform == "win32":
        subprocess.Popen(["explorer", path])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
    return True, {"ok": True, "path": path}


def h_open_url(p: dict) -> tuple[bool, dict]:
    url = p.get("url", "")
    webbrowser.open(url)
    return True, {"ok": True, "url": url}


def h_backup(p: dict) -> tuple[bool, dict]:
    import shutil
    src  = p.get("sourceFolder", "")
    dest = p.get("destFolder", "")
    if not src or not dest:
        return False, {"error": "sourceFolder and destFolder required"}
    dest_path = Path(dest) / f"backup_{int(time.time())}"
    shutil.copytree(src, str(dest_path))
    return True, {"ok": True, "dest": str(dest_path)}


def h_sync_data(_p: dict) -> tuple[bool, dict]:
    return True, {"ok": True, "acknowledged": True}


# ── SMS via local GSM modem ───────────────────────────────────────────────────

def h_send_sms(p: dict) -> tuple[bool, dict]:
    to      = str(p.get("phone") or p.get("to") or "").strip()
    message = str(p.get("message", "")).strip()

    if not to or not message:
        return False, {"error": "to و message مطلوبان"}

    try:
        import serial
        import serial.tools.list_ports

        # Auto-detect GSM modem
        modem_port: str | None = os.environ.get("MODEM_PORT")
        if not modem_port:
            for port_info in serial.tools.list_ports.comports():
                desc = (port_info.description or "").upper()
                if any(k in desc for k in ["MODEM", "GSM", "SIM", "HUAWEI", "ZTE", "WAVECOM", "TELIT"]):
                    modem_port = port_info.device
                    break

        if not modem_port:
            ports = serial.tools.list_ports.comports()
            if ports:
                modem_port = ports[0].device

        if not modem_port:
            return False, {"error": "لم يُعثر على مودم GSM — تأكد من توصيل الجهاز أو حدّد MODEM_PORT في agent_config.json"}

        log.info(f"SMS → {to}  via {modem_port}")

        with serial.Serial(modem_port, 115200, timeout=10) as ser:
            def at(cmd: str, wait: float = 1.0) -> str:
                ser.write((cmd + "\r\n").encode())
                time.sleep(wait)
                return ser.read(ser.in_waiting).decode(errors="ignore")

            at("AT")
            at("AT+CMGF=1")   # text mode
            at(f'AT+CMGS="{to}"', wait=1.2)
            ser.write(message.encode("utf-8") + b"\x1A")
            time.sleep(3.5)
            resp = ser.read(ser.in_waiting).decode(errors="ignore")

        if "+CMGS" in resp or "OK" in resp:
            return True, {"ok": True, "status": "sent", "port": modem_port}
        return False, {"error": f"AT response: {resp.strip()}", "port": modem_port}

    except ImportError:
        return False, {"error": "مكتبة pyserial غير مثبّتة — نفّذ: pip install pyserial"}
    except Exception as exc:
        return False, {"error": str(exc)}


def handle_sms_event(payload: dict):
    """Handle the dedicated server → agent SMS contract."""
    phone = str(payload.get("phone", "")).strip()
    message = str(payload.get("message", "")).strip()
    log.info(f"← send_sms  phone={phone or '—'}  message_length={len(message)}")

    if not phone or not message:
        details = {"error": "phone و message مطلوبان"}
        sio.emit("sms:confirmation", {"status": "failed", "details": details})
        emit_result("send_sms", False, details)
        return

    try:
        ok, details = h_send_sms({"phone": phone, "message": message})
        sio.emit("sms:confirmation", {
            "status": "success" if ok else "failed",
            "details": details,
        })
        emit_result("send_sms", ok, details)
        log.info(f"→ send_sms  {'✓' if ok else '✗'}")
    except Exception as exc:
        details = {"error": str(exc)}
        sio.emit("sms:confirmation", {"status": "failed", "details": details})
        emit_result("send_sms", False, details)
        log.error(f"  exception in send_sms: {exc}")


# ── Parent contact scraping from الرقمنة ─────────────────────────────────────

def h_scrape_parent_contacts(p: dict) -> tuple[bool, dict]:
    url      = p.get("url", "https://www.tarbiyatic.com/")
    students = p.get("students", [])
    contacts: list[dict] = []

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.chrome.options import Options
        from webdriver_manager.chrome import ChromeDriverManager

        opts = Options()
        opts.add_argument("--start-maximized")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        opts.add_experimental_option("excludeSwitches", ["enable-automation"])

        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=opts,
        )

        try:
            driver.get(url)
            log.info(f"Opened {url} for scraping")
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            for student in students:
                try:
                    sid   = student.get("id", "")
                    raqm  = student.get("raqm")
                    name  = student.get("name", "")
                    query = str(raqm) if raqm else name

                    # Try to find search field and look up student
                    inputs = driver.find_elements(
                        By.CSS_SELECTOR,
                        'input[type="text"], input[type="search"], input[placeholder]'
                    )
                    if inputs:
                        inp = inputs[0]
                        inp.clear()
                        inp.send_keys(query)
                        inp.submit()
                        time.sleep(2)

                    body_text = driver.find_element(By.TAG_NAME, "body").text
                    phones = re.findall(r'(?:0[567]\d{8}|\+213\s*[567]\d{8})', body_text)

                    if phones and sid:
                        phone = phones[0].replace(" ", "")
                        contacts.append({"studentId": sid, "phone": phone})
                        log.info(f"  ✓ {name}: {phone}")

                except Exception as exc:
                    log.warning(f"  ✗ {student.get('name')}: {exc}")

        finally:
            driver.quit()

        return True, {"ok": True, "contacts": contacts, "found": len(contacts)}

    except ImportError:
        return False, {
            "error": "selenium أو webdriver-manager غير مثبّت — نفّذ: pip install selenium webdriver-manager",
            "contacts": [],
        }
    except Exception as exc:
        return False, {"error": str(exc), "contacts": contacts}


# ─── Dispatcher ────────────────────────────────────────────────────────────────

HANDLERS: dict = {
    # Screen / keyboard / mouse
    "screenshot":              h_screenshot,
    "screenCapture":           h_screenshot,
    "click":                   h_click,
    "mouseClick":              h_click,
    "type":                    h_type,
    "typeText":                h_type,
    "press":                   h_press,
    "pressKey":                h_press,
    "hotkey":                  h_hotkey,
    # File / system
    "openFolder":              h_open_folder,
    "openFile":                h_open_folder,
    "openUrl":                 h_open_url,
    "backupReports":           h_backup,
    "syncData":                h_sync_data,
    # Communication
    "send_sms":                h_send_sms,
    # Scraping
    "scrape_parent_contacts":  h_scrape_parent_contacts,
}


def dispatch(action: str, payload: dict):
    log.info(f"← {action}")
    handler = HANDLERS.get(action)
    if not handler:
        log.warning(f"  unknown action: {action}")
        emit_result(action, False, {"error": f"Unknown action: {action}"})
        return
    try:
        ok, details = handler(payload)
        emit_result(action, ok, details)
        log.info(f"→ {action}  {'✓' if ok else '✗'}")
    except Exception as exc:
        log.error(f"  exception in {action}: {exc}")
        emit_result(action, False, {"error": str(exc)})


# ─── Socket events ─────────────────────────────────────────────────────────────

@sio.event
def connect():
    log.info("✓ متصل بالخادم")
    print("\n✅  الوكيل متصل بنجاح!\n")
    _heartbeat_start()


@sio.event
def connect_error(data):
    log.error(f"✗ فشل الاتصال: {data}")


@sio.event
def disconnect(reason):
    log.warning(f"✗ انقطع الاتصال: {reason}")


@sio.on("agent:command")
def on_command(payload):
    action  = payload.get("action", "")
    data    = payload.get("payload", {})
    threading.Thread(target=dispatch, args=(action, data), daemon=True).start()


@sio.on("execute_desktop_command")
def on_execute(payload):
    on_command(payload)


@sio.on("send_sms")
def on_send_sms(payload):
    """Dedicated SMS event emitted by server/socket for parent messages."""
    threading.Thread(
        target=handle_sms_event,
        args=(payload if isinstance(payload, dict) else {},),
        daemon=True,
    ).start()


# ─── Heartbeat ─────────────────────────────────────────────────────────────────

def _heartbeat_start():
    def _loop():
        while True:
            time.sleep(HEARTBEAT_SEC)
            if sio.connected:
                sio.emit("agent:ping", callback=lambda _: None)
    threading.Thread(target=_loop, daemon=True).start()


# ─── Entry point ───────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="SchoolManager Desktop Agent")
    ap.add_argument("--server", default="", help="Server URL")
    ap.add_argument("--token",  default="", help="Agent token")
    ap.add_argument("--config", default=str(CONFIG_FILE), help="Config JSON file")
    args = ap.parse_args()

    # Load config file
    cfg: dict = {}
    cfg_path = Path(args.config)
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text("utf-8"))
        except Exception as exc:
            log.warning(f"Cannot read config: {exc}")

    server = (args.server or cfg.get("serverUrl") or os.environ.get("SERVER_URL", "")).rstrip("/")
    token  = args.token  or cfg.get("token")      or os.environ.get("AGENT_TOKEN", "")

    # Interactive fallback
    if not server:
        server = input("🌐 أدخل رابط الخادم (مثال: https://dalilra9mana.onrender.com): ").strip().rstrip("/")
    if not token:
        token  = input("🔑 أدخل رمز الوكيل: ").strip()

    if not server or not token:
        print("❌ يجب توفير رابط الخادم ورمز الوكيل.")
        sys.exit(1)

    print(f"\n{'═'*52}")
    print(f"  📡  SchoolManager Desktop Agent")
    print(f"  الخادم  :  {server}")
    print(f"  الرمز   :  {token[:10]}…")
    print(f"{'═'*52}\n")
    print("جارٍ الاتصال بالخادم… اضغط Ctrl+C للإيقاف.\n")

    try:
        sio.connect(
            server,
            socketio_path=SOCKET_PATH,
            auth={"token": token},
            transports=["websocket"],
            wait_timeout=20,
        )
        sio.wait()
    except KeyboardInterrupt:
        print("\n👋 تم إيقاف الوكيل.")
    except Exception as exc:
        log.error(f"خطأ في الاتصال: {exc}")
        sys.exit(1)
    finally:
        sio.disconnect()


if __name__ == "__main__":
    main()
