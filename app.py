#!/usr/bin/env python3
"""Excel tabanli stok verisini yerel, tarayici tabanli bir uygulamaya sunar."""
from __future__ import annotations

import json
import mimetypes
import os
import re
import socket
import threading
import webbrowser
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
DATA_FILE = APP_DIR / "stok_verisi.json"
SOURCE_FILE = Path(os.environ.get("STOK_EXCEL_DOSYASI", "/Users/user/Desktop/POWERSTYLE/van takip/Stok_Takip_Sistemi.xlsx"))
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def col_index(ref: str) -> int:
    result = 0
    for char in re.match(r"[A-Z]+", ref).group(0):
        result = result * 26 + ord(char) - 64
    return result - 1


def cell_value(cell, strings):
    cell_type = cell.attrib.get("t")
    value = cell.find("m:v", NS)
    if value is None:
        inline = cell.find("m:is/m:t", NS)
        return inline.text if inline is not None else None
    raw = value.text
    if cell_type == "s":
        return strings[int(raw)]
    if cell_type == "b":
        return raw == "1"
    try:
        return float(raw) if "." in raw else int(raw)
    except (TypeError, ValueError):
        return raw


def read_sheet(book, filename, strings):
    root = ET.fromstring(book.read(filename))
    rows = {}
    for row in root.findall(".//m:sheetData/m:row", NS):
        values = {}
        for cell in row.findall("m:c", NS):
            values[col_index(cell.attrib["r"])] = cell_value(cell, strings)
        rows[int(row.attrib["r"])] = values
    return rows


def import_excel():
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Kaynak Excel dosyasi bulunamadi: {SOURCE_FILE}")
    with zipfile.ZipFile(SOURCE_FILE) as book:
        strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            strings = ["".join(node.itertext()) for node in root.findall("m:si", NS)]
        stock_rows = read_sheet(book, "xl/worksheets/sheet1.xml", strings)
        cost_rows = read_sheet(book, "xl/worksheets/sheet2.xml", strings)

    def number(value):
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0

    costs = {}
    for _, row in cost_rows.items():
        sku = row.get(0)
        if sku is not None and str(sku).isdigit():
            costs[str(sku)] = {"cost": number(row.get(3)), "price": number(row.get(5))}

    products = []
    for row_number in range(4, 501):
        row = stock_rows.get(row_number, {})
        sku, name = row.get(0), row.get(2)
        if sku is None and not name:
            continue
        details = costs.get(str(sku), {})
        products.append({
            "id": str(sku or f"URUN-{row_number}"),
            "sku": str(sku or ""),
            "name": str(name or "İsimsiz ürün"),
            "category": str(row.get(1) or "Kategorisiz"),
            "openingStock": int(row.get(3) or 0),
            "cost": details.get("cost", 0),
            "price": details.get("price", 0),
            "minStock": 3,
        })
    return {"products": products, "movements": [], "settings": {"companyName": "POWERSTYLE", "currency": "£"}}


def load_data():
    if not DATA_FILE.exists():
        data = import_excel()
        save_data(data)
    with DATA_FILE.open(encoding="utf-8") as handle:
        return json.load(handle)


def save_data(data):
    temporary = DATA_FILE.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    temporary.replace(DATA_FILE)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, payload, status=200):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self):
        size = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(size).decode("utf-8"))

    def do_GET(self):
        if urlparse(self.path).path == "/api/data":
            try:
                self.send_json(load_data())
            except Exception as error:
                self.send_json({"error": str(error)}, 500)
            return
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/data":
            self.send_error(404)
            return
        try:
            data = self.read_json()
            if not isinstance(data.get("products"), list) or not isinstance(data.get("movements"), list):
                raise ValueError("Geçersiz veri yapısı")
            save_data(data)
            self.send_json({"ok": True})
        except Exception as error:
            self.send_json({"error": str(error)}, 400)

    def translate_path(self, path):
        path = urlparse(path).path
        requested = (APP_DIR / path.lstrip("/")).resolve()
        return str(requested if APP_DIR in requested.parents or requested == APP_DIR else APP_DIR / "index.html")


def main():
    os.chdir(APP_DIR)
    server = None
    port = None
    for candidate in range(8765, 8786):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError("Uygulama için uygun yerel bağlantı noktası bulunamadı.")
    url = f"http://127.0.0.1:{port}"
    print(f"Stok uygulaması: {url}")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
