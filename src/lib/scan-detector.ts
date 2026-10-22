// Distinguishes keyboard-wedge barcode scanners (keys arrive a few ms apart) from humans.

export interface ScanDetectorOptions {
  interKeyMs: number;
  minLength: number;
  onScan: (code: string) => void;
  now?: () => number;
}

export function createScanDetector(opts: ScanDetectorOptions) {
  const now = opts.now ?? (() => performance.now());
  let buf = "";
  let last = -Infinity;

  function emitIfScan(): boolean {
    const code = buf;
    buf = "";
    if (code.length >= opts.minLength) {
      opts.onScan(code);
      return true;
    }
    return false;
  }

  return {
    /** Returns true when the key terminated a scan (caller should preventDefault). */
    handleKey(e: { key: string }): boolean {
      const t = now();
      const fast = t - last <= opts.interKeyMs;
      if (e.key.length === 1) {
        buf = fast ? buf + e.key : e.key;
        last = t;
        return false;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (!fast) {
          buf = "";
          return false;
        }
        last = -Infinity;
        return emitIfScan();
      }
      return false; // Shift, etc. never break a burst
    },
    /** For scanners configured without a terminator: call after the line goes idle. */
    flush(): boolean {
      if (now() - last <= opts.interKeyMs) return false;
      last = -Infinity;
      return emitIfScan();
    },
    /** Characters buffered so far (lets the caller strip them from a focused input). */
    pending(): string {
      return buf;
    },
    reset() {
      buf = "";
      last = -Infinity;
    },
  };
}
