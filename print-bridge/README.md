# StockPilot print bridge

Lets StockPilot print to **network (Ethernet / Wi-Fi) receipt printers** that listen on port 9100. Browsers can't open raw TCP connections, so this tiny program runs on one computer in the shop and passes receipts through to the printer.

Requires Node.js 20+ and has no other dependencies.

1. Find the printer's IP address. Most printers print it when you hold the feed button while switching on.
2. On a computer that stays on in the shop, run:

   ```bash
   node print-bridge/bridge.mjs --printer 192.168.1.50 --key "choose-a-long-secret" --origin https://your-stockpilot-domain
   ```

3. In StockPilot open **Settings → Printer & scanner → Network (LAN)**. Keep the address `http://127.0.0.1:9123` when using StockPilot on that same computer, enter the same key, then click **Print test page**.

Options:

| Flag | Default | |
|---|---|---|
| `--printer` | — | Printer IP (required) |
| `--printer-port` | `9100` | Raw printing port |
| `--key` | `$BRIDGE_KEY` | Shared secret, 12+ characters (required) |
| `--origin` | any | Your StockPilot URL; repeat for several. Requests from other websites are refused |
| `--port` | `9123` | Local port for the browser |
| `--host` | `127.0.0.1` | Use `0.0.0.0` only if other counters on the LAN should print through this PC, and then set their bridge address to `http://<this-pc-ip>:9123` |

To keep it running after reboots, use your OS's service manager (Windows Task Scheduler, `launchd`, `systemd`) or `pm2 start print-bridge/bridge.mjs -- --printer … --key …`.
