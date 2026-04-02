"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Sun, Search, X, MapPin, Loader2, Link2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeoFeature {
  id: string;
  text: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}

export interface TopBarProps {
  onSelect?: (lng: number, lat: number, placeName: string) => void;
  /**
   * When a map click resolves its reverse-geocoded address, the parent pushes
   * it here so the search bar stays in sync without re-mounting the component.
   * `null` means "no external update yet" — don't touch local state.
   */
  externalAddress?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * Extracts a searchable address string from a Hemnet listing URL.
 * e.g. hemnet.se/bostad/lagenhet-3rum-82m2-sodermalm-stockholm-12345678
 *  → "sodermalm stockholm"
 */
function parseHemnetUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!url.hostname.includes("hemnet.se")) return null;

    // Find the /bostad/… segment
    const slug = url.pathname.split("/").find((s) =>
      /^(lagenhet|villa|radhus|bostadsratt|fritidshus|tomt)/.test(s)
    );
    if (!slug) return null;

    // Remove type prefix, size tokens, and trailing numeric ID
    const parts = slug.split("-").filter(
      (p) =>
        !/^\d+$/.test(p) &&       // pure number → ID at end
        !/^\d+rum/.test(p) &&     // "3rum"
        !/^\d+m2/.test(p) &&      // "82m2"
        !/^(lagenhet|villa|radhus|bostadsratt|fritidshus|tomt)$/.test(p)
    );

    return parts.join(" ") || null;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopBar({ onSelect, externalAddress }: TopBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [isHemnet, setIsHemnet] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}` +
        `&country=se` +
        `&language=sv` +
        `&types=address,poi,place` +
        `&limit=5`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("geocode_fail");
      const data = await res.json();
      setResults(data.features ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleSearch = useCallback(
    (val: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchResults(val), 320);
    },
    [fetchResults]
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    // Hemnet URL detection
    if (val.includes("hemnet.se")) {
      setIsHemnet(true);
      const parsed = parseHemnetUrl(val);
      if (parsed) {
        scheduleSearch(parsed);
        return;
      }
    } else {
      setIsHemnet(false);
    }

    scheduleSearch(val);
  };

  const handleSelect = (feat: GeoFeature) => {
    setQuery(feat.place_name);
    setOpen(false);
    setResults([]);
    setIsHemnet(false);
    onSelect?.(feat.center[0], feat.center[1], feat.place_name);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setIsHemnet(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !dropdownRef.current?.contains(target) &&
        !inputRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync search bar text when a map click resolves a reverse-geocoded address
  useEffect(() => {
    if (externalAddress == null) return;
    setQuery(externalAddress);
    setOpen(false);
    setResults([]);
    setIsHemnet(false);
  }, [externalAddress]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <header className="h-16 shrink-0 bg-panel border-b border-black/[0.06] flex items-center px-4 gap-4 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
          <Sun size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Sol<span className="text-accent">Karta</span>
        </span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-black/[0.1] shrink-0" />

      {/* Search field + dropdown */}
      <div className="flex-1 max-w-lg relative">
        {/* Left icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
          {isHemnet ? (
            <Link2 size={14} className="text-accent" />
          ) : (
            <Search size={15} className="text-muted" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Ange adress eller Hemnet-URL…"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-9 pl-9 pr-8 text-sm bg-surface border border-black/[0.1] rounded-lg
                     text-ink placeholder:text-muted
                     focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60
                     transition-all duration-150"
        />

        {/* Right icon: spinner or clear */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10">
          {loading ? (
            <Loader2 size={14} className="text-accent animate-spin" />
          ) : query ? (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleClear();
              }}
              className="w-5 h-5 flex items-center justify-center rounded-full
                         text-muted hover:text-ink hover:bg-black/[0.06] transition-colors"
              aria-label="Rensa sökning"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        {/* Dropdown results */}
        {open && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1.5 z-50
                       bg-panel border border-black/[0.08] rounded-xl shadow-xl
                       overflow-hidden"
          >
            {results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-4">
                <MapPin size={13} className="text-muted shrink-0" />
                <span className="text-sm text-muted">Inga resultat hittades</span>
              </div>
            ) : (
              <ul role="listbox">
                {results.map((feat) => (
                  <li key={feat.id} role="option" aria-selected={false}>
                    <button
                      onMouseDown={(e) => {
                        // prevent blur before click registers
                        e.preventDefault();
                        handleSelect(feat);
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left
                                 hover:bg-accent/[0.07] active:bg-accent/[0.12]
                                 transition-colors duration-100
                                 border-b border-black/[0.04] last:border-b-0"
                    >
                      <MapPin size={13} className="text-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink truncate leading-snug">
                          {feat.text}
                        </p>
                        <p className="text-[11px] text-muted truncate leading-tight mt-0.5">
                          {feat.place_name}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Hemnet hint */}
            {isHemnet && results.length > 0 && (
              <div className="px-4 py-2 border-t border-black/[0.04] bg-accent/[0.04]">
                <p className="text-[11px] text-accent font-medium">
                  Hemnet-URL tolkad — välj ett resultat ovan
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right slot — Step 4 premium button placeholder */}
      <div className="ml-auto shrink-0">
        <span className="text-xs text-muted font-medium">Beta</span>
      </div>
    </header>
  );
}
