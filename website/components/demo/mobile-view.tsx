"use client";

import { useState } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { Plus, QrCode, Smartphone } from "lucide-react";
import { APP_STORE_URL } from "@/lib/links";
import { MobileToggle } from "./ui-kit";
import { FOCUS_RING, PRESS } from "./ui";

type Device = { id: string; name: string; paired: string };

const INITIAL_DEVICES: Device[] = [
  { id: "iphone", name: "iPhone 16 Pro", paired: "paired 3 weeks ago" },
  { id: "ipad", name: "iPad Air", paired: "paired 2 days ago" },
];

export function MobileView() {
  const [enabled, setEnabled] = useState(true);
  const [tailscale, setTailscale] = useState(true);
  const [port, setPort] = useState(8765);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [pairing, setPairing] = useState(false);

  const addDevice = () => {
    setPairing(false);
    setDevices((prev) => [
      ...prev,
      { id: `device-${prev.length + 1}`, name: "New device", paired: "paired just now" },
    ]);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Smartphone className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Mobile app</div>
          <div className="text-[11px] text-[#919191]">
            Answer your agents from your phone — every command still runs on this Mac
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2e2e2e] px-3 py-3 sm:px-4">
        <div className="mx-auto w-full max-w-[560px] space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#2e2e2e] px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2a2a2a] text-[#b3b3b3]">
              <AppleIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#e5e5e5]">lpm Link</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                The companion app for iPhone and iPad. Install it, then pair below.
              </div>
            </div>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`shrink-0 rounded-lg border border-[#2e2e2e] px-3 py-1.5 text-[12px] font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
            >
              App Store
            </a>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[#2e2e2e] bg-[#242424] px-4 py-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors"
              style={{
                backgroundColor: enabled ? "rgba(74, 222, 128, 0.15)" : "#2a2a2a",
                color: enabled ? "#4ade80" : "#919191",
              }}
            >
              <Smartphone className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#e5e5e5]">Remote control</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    enabled ? "bg-[#4ade80]" : "bg-[#919191]"
                  }`}
                />
                <span className={enabled ? "text-[#4ade80]" : "text-[#919191]"}>
                  {enabled ? "Listening" : "Off"}
                </span>
                {enabled && (
                  <span className="font-mono text-[11px] text-[#919191]">
                    this-mac.local:{port}
                  </span>
                )}
              </div>
            </div>
            <MobileToggle
              checked={enabled}
              onChange={setEnabled}
              aria-label="Remote control"
            />
          </div>

          {enabled && (
            <div className="rounded-xl border border-[#2e2e2e]">
              <Row label="Port" desc="The port the mobile app connects to.">
                <input
                  type="number"
                  {...NO_AUTOFILL}
                  aria-label="Port"
                  value={port}
                  min={1024}
                  max={65535}
                  onChange={(e) => setPort(Number(e.target.value) || 0)}
                  className={`w-20 rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] px-2.5 py-1.5 text-[13px] tabular-nums text-[#e5e5e5] outline-none transition-colors focus:border-[#22d3ee] ${FOCUS_RING}`}
                />
              </Row>
            </div>
          )}

          <div>
            <SectionLabel>Paired devices</SectionLabel>
            <div className="overflow-hidden rounded-xl border border-[#2e2e2e]">
              {devices.length === 0 ? (
                <p className="px-4 py-4 text-center text-[12px] text-[#919191]">
                  No devices paired yet.
                </p>
              ) : (
                devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center gap-3 border-b border-[#2e2e2e] px-4 py-3"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2a2a2a] text-[#919191]">
                      <Smartphone className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[#e5e5e5]">
                        {device.name}
                      </div>
                      <div className="text-[11px] text-[#919191]">{device.paired}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDevices((prev) => prev.filter((d) => d.id !== device.id))}
                      className={`shrink-0 rounded-md px-2 py-1 text-[12px] text-[#919191] hover:bg-[#2a2a2a] hover:text-[#f87171] ${FOCUS_RING} ${PRESS}`}
                    >
                      Revoke
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => setPairing((v) => !v)}
                aria-expanded={pairing}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-dashed border-[#2e2e2e] text-[#919191]">
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[#e5e5e5]">Add a device</div>
                  <div className="text-[11px] text-[#919191]">
                    Scan a one-time QR code from the mobile app.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {pairing && (
            <div className="flex items-center gap-3.5 rounded-xl border border-[#2e2e2e] bg-[#242424] p-4">
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-[#e5e5e5] text-[#1a1a1a]">
                <QrCode className="h-14 w-14" strokeWidth={1.25} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[#e5e5e5]">Scan this in lpm Link</div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#919191]">
                  The code carries this Mac&apos;s address and a one-time key. It expires in 60
                  seconds and works once.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <code className="rounded bg-[#1a1a1a] px-2 py-1 font-mono text-[12px] tracking-[0.2em] text-[#b3b3b3]">
                    418 902
                  </code>
                  <button
                    type="button"
                    onClick={addDevice}
                    className={`rounded-lg bg-[#e5e5e5] px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:opacity-90 ${FOCUS_RING} ${PRESS}`}
                  >
                    Simulate scan
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <SectionLabel>Using lpm away from home</SectionLabel>
            <div className="overflow-hidden rounded-xl border border-[#2e2e2e]">
              <p className="px-4 py-3 text-[12px] leading-relaxed text-[#919191]">
                On the same Wi-Fi your phone connects straight to this Mac. To reach it over
                cellular, put both devices on a{" "}
                <span className="font-medium text-[#b3b3b3]">Tailscale</span> tailnet and include
                this Mac&apos;s tailnet address in the pairing QR.
              </p>
              <div className="border-t border-[#2e2e2e]">
                <Row
                  label="Add Tailscale address to QR"
                  desc="Advertises this Mac's tailnet address so scanning works from anywhere."
                >
                  <MobileToggle
                    checked={tailscale}
                    onChange={setTailscale}
                    aria-label="Tailscale address in QR"
                  />
                </Row>
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-[#919191]">
            Nothing routes through a server of ours — the phone talks to your Mac directly.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[#e5e5e5]">{label}</div>
        <div className="text-[11px] leading-relaxed text-[#919191]">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[#919191]">
      {children}
    </div>
  );
}

function AppleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.5zM14.2 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z" />
    </svg>
  );
}
