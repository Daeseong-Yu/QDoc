"use client";

import {
  authErrorSchema,
  mapConfigResponseSchema,
  mapUsageResponseSchema,
  type MapConfigResponse,
  type PatientSiteSummary,
} from "@qdoc/contracts";
import { Crosshair, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type ClinicMapProps = {
  sites: PatientSiteSummary[];
  selectedSiteId: string;
  userLocation: BrowserLocation | null;
  onSelectSite: (siteId: string) => void;
};

type ApiError = Error & {
  status: number;
  error: string;
};

type MapboxMap = {
  remove: () => void;
};

type MapboxPopup = {
  setText: (text: string) => MapboxPopup;
};

type MapboxMarker = {
  setLngLat: (coordinates: [number, number]) => MapboxMarker;
  setPopup: (popup: MapboxPopup) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
};

type MapboxNamespace = {
  accessToken: string;
  Map: new (options: Record<string, unknown>) => MapboxMap;
  Marker: new (options?: Record<string, unknown>) => MapboxMarker;
  Popup: new (options?: Record<string, unknown>) => MapboxPopup;
};

type GoogleMap = {
  fitBounds: (bounds: GoogleBounds) => void;
};

type GoogleBounds = {
  extend: (location: { lat: number; lng: number }) => void;
};

type GoogleNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => unknown;
    LatLngBounds: new () => GoogleBounds;
  };
};

const scriptLoads = new Map<string, Promise<void>>();

async function readApiResponse<T>(response: Response, schema: z.ZodSchema<T>) {
  const data: unknown = await response.json();

  if (!response.ok) {
    const parsedError = authErrorSchema.safeParse(data);
    const error = new Error(parsedError.success ? parsedError.data.error : "request_failed") as ApiError;
    error.status = response.status;
    error.error = parsedError.success ? parsedError.data.error : "request_failed";
    throw error;
  }

  return schema.parse(data);
}

function getCoordinates(site: PatientSiteSummary) {
  const { latitude, longitude } = site.location;

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function loadScript(id: string, src: string) {
  const existing = scriptLoads.get(id);

  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const currentScript = document.getElementById(id) as HTMLScriptElement | null;

    if (currentScript) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("map_script_load_failed"));
    document.head.appendChild(script);
  });

  scriptLoads.set(id, promise);
  return promise;
}

function loadMapboxCss() {
  if (document.getElementById("qdoc-mapbox-css")) {
    return;
  }

  const link = document.createElement("link");
  link.id = "qdoc-mapbox-css";
  link.rel = "stylesheet";
  link.href = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css";
  document.head.appendChild(link);
}

async function reserveMapLoad() {
  const response = await fetch("/api/maps/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usageType: "map_load" }),
  });

  return readApiResponse(response, mapUsageResponseSchema);
}

function getWindowMaps() {
  return window as Window & {
    mapboxgl?: MapboxNamespace;
    google?: GoogleNamespace;
  };
}

async function initializeProviderMap(
  container: HTMLElement,
  config: MapConfigResponse,
  sites: PatientSiteSummary[],
  userLocation: BrowserLocation | null,
) {
  if (!config.provider) {
    return null;
  }

  const mappedSites = sites
    .map((site) => ({ site, coordinates: getCoordinates(site) }))
    .filter((item): item is { site: PatientSiteSummary; coordinates: BrowserLocation } => item.coordinates !== null);

  if (mappedSites.length === 0) {
    return null;
  }

  const reservation = await reserveMapLoad();
  const publicToken = reservation.publicToken;

  if (config.provider === "mapbox") {
    loadMapboxCss();
    await loadScript("qdoc-mapbox-gl", "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js");

    const mapboxgl = getWindowMaps().mapboxgl;

    if (!mapboxgl) {
      throw new Error("mapbox_unavailable");
    }

    const firstSite = mappedSites[0];
    const center: [number, number] = userLocation
      ? [userLocation.longitude, userLocation.latitude]
      : [firstSite.coordinates.longitude, firstSite.coordinates.latitude];

    mapboxgl.accessToken = publicToken;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: 12,
      attributionControl: false,
    });

    if (userLocation) {
      new mapboxgl.Marker({ color: "#087884" }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map);
    }

    for (const { site, coordinates } of mappedSites) {
      new mapboxgl.Marker()
        .setLngLat([coordinates.longitude, coordinates.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(site.name))
        .addTo(map);
    }

    return map;
  }

  await loadScript(
    "qdoc-google-maps",
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(publicToken)}&loading=async`,
  );

  const google = getWindowMaps().google;

  if (!google) {
    throw new Error("google_maps_unavailable");
  }

  const firstSite = mappedSites[0];
  const map = new google.maps.Map(container, {
    center: userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude }
      : { lat: firstSite.coordinates.latitude, lng: firstSite.coordinates.longitude },
    disableDefaultUI: true,
    zoom: 12,
  });
  const bounds = new google.maps.LatLngBounds();

  if (userLocation) {
    const position = { lat: userLocation.latitude, lng: userLocation.longitude };
    bounds.extend(position);
    new google.maps.Marker({
      map,
      position,
      title: "Your location",
    });
  }

  for (const { site, coordinates } of mappedSites) {
    const position = { lat: coordinates.latitude, lng: coordinates.longitude };
    bounds.extend(position);
    new google.maps.Marker({
      map,
      position,
      title: site.name,
    });
  }

  map.fitBounds(bounds);
  return {
    remove: () => {
      container.replaceChildren();
    },
  };
}

function getFallbackPosition(site: PatientSiteSummary, index: number, selectedSiteId: string) {
  if (site.id === selectedSiteId) {
    return { left: "50%", top: "45%" };
  }

  const positions = [
    { left: "28%", top: "34%" },
    { left: "66%", top: "38%" },
    { left: "40%", top: "68%" },
    { left: "72%", top: "66%" },
  ];

  return positions[index % positions.length];
}

export function ClinicMap({ sites, selectedSiteId, userLocation, onSelectSite }: ClinicMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMapRef = useRef<MapboxMap | null>(null);
  const [config, setConfig] = useState<MapConfigResponse | null>(null);
  const [mapState, setMapState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");

  const siteSignature = useMemo(
    () =>
      sites
        .map((site) => `${site.id}:${site.location.latitude ?? ""}:${site.location.longitude ?? ""}`)
        .join("|"),
    [sites],
  );

  useEffect(() => {
    return () => {
      providerMapRef.current?.remove();
      providerMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sites.length === 0 || !mapContainerRef.current) {
      return;
    }

    let cancelled = false;
    providerMapRef.current?.remove();
    providerMapRef.current = null;

    async function startMap() {
      setMapState("loading");

      try {
        const response = await fetch("/api/maps/config", { cache: "no-store" });
        const mapConfig = await readApiResponse(response, mapConfigResponseSchema);

        if (cancelled) {
          return;
        }

        setConfig(mapConfig);

        if (!mapConfig.canLoad || !mapContainerRef.current) {
          setMapState("fallback");
          return;
        }

        const providerMap = await initializeProviderMap(mapContainerRef.current, mapConfig, sites, userLocation);

        if (cancelled) {
          providerMap?.remove();
          return;
        }

        providerMapRef.current = providerMap;
        setMapState(providerMap ? "ready" : "fallback");
      } catch {
        if (!cancelled) {
          setMapState("fallback");
        }
      }
    }

    void startMap();

    return () => {
      cancelled = true;
      providerMapRef.current?.remove();
      providerMapRef.current = null;
    };
  }, [siteSignature, sites, userLocation]);

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0] ?? null;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Nearby clinics</h2>
          <p className="text-sm text-slate-600">
            {userLocation ? "Centered on your current area." : "Using clinic locations until location access is allowed."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#087884]">
          {mapState === "loading" ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
          {mapState === "ready" ? `${config?.provider ?? "map"} guarded` : "cost guard active"}
        </div>
      </div>

      <div className="relative h-[280px] bg-[#e4f5f3]">
        <div
          ref={mapContainerRef}
          className={`absolute inset-0 z-10 ${mapState === "ready" ? "" : "pointer-events-none"}`}
          aria-hidden={mapState !== "ready"}
        />
        {mapState !== "ready" ? (
          <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#dcf4f1_0%,#f8fafc_56%,#eaf7ef_100%)]">
            <div className="absolute left-[-8%] top-[20%] h-24 w-[120%] rotate-[-7deg] bg-white/70" />
            <div className="absolute left-[18%] top-[-8%] h-[120%] w-24 rotate-[25deg] bg-white/55" />
            <div className="absolute left-[5%] top-[54%] h-20 w-[110%] rotate-[8deg] bg-white/60" />
            {userLocation ? (
              <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#087884] p-2 text-white shadow-md ring-8 ring-[#087884]/15">
                <Crosshair size={18} aria-hidden="true" />
              </div>
            ) : null}
            {sites.map((site, index) => {
              const position = getFallbackPosition(site, index, selectedSiteId);
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onSelectSite(site.id)}
                  className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full p-2 shadow-md transition ${
                    site.id === selectedSiteId ? "bg-[#10b9c4] text-white ring-8 ring-[#10b9c4]/20" : "bg-white text-[#087884]"
                  }`}
                  style={position}
                  aria-label={`Select ${site.name}`}
                >
                  <MapPin size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
        <span className="font-medium text-slate-950">{selectedSite?.name ?? "Select a clinic"}</span>
        <span className="text-slate-500">
          {config?.canLoad ? `${config.remainingMapLoads} guarded map loads left this month` : "Provider map disabled by budget guard"}
        </span>
      </div>
    </section>
  );
}
