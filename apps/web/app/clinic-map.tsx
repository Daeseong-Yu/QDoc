"use client";

import {
  authErrorSchema,
  mapConfigResponseSchema,
  mapUsageResponseSchema,
  nearbyHealthcareResponseSchema,
  type MapConfigResponse,
  type NearbyHealthcarePlace,
  type PatientSiteSummary,
} from "@qdoc/contracts";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Loader2, MapPin, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type ClinicMapProps = {
  sites: PatientSiteSummary[];
  selectedSiteId: string;
  refreshKey: number;
  userLocation: BrowserLocation | null;
  onSelectSite: (siteId: string) => void;
};

type ApiError = Error & {
  status: number;
  error: string;
};

type MapDisplayPlace = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  qdocSiteId: string | null;
  kind: "qdoc_site" | "provider_place";
};

type MapboxMap = {
  addControl: (control: unknown, position?: string) => void;
  flyTo: (options: Record<string, unknown>) => void;
  getZoom: () => number;
  panBy: (offset: [number, number]) => void;
  remove: () => void;
  setZoom: (zoom: number) => void;
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
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
  Popup: new (options?: Record<string, unknown>) => MapboxPopup;
};

type GoogleMap = {
  fitBounds: (bounds: GoogleBounds) => void;
  getZoom: () => number | undefined;
  panBy: (x: number, y: number) => void;
  panTo: (location: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};

type GoogleBounds = {
  extend: (location: { lat: number; lng: number }) => void;
};

type GoogleNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => {
      addListener: (event: string, handler: () => void) => void;
      setIcon: (icon: string) => void;
    };
    LatLngBounds: new () => GoogleBounds;
  };
};

type ProviderMapHandle = {
  focusPlace: (place: MapDisplayPlace) => void;
  panBy: (x: number, y: number) => void;
  recenter: (location: BrowserLocation) => void;
  remove: () => void;
  selectPlace: (placeId: string) => void;
  zoomBy: (delta: number) => void;
};

type FallbackViewport = {
  latitude: number;
  longitude: number;
  zoom: number;
};

type ProviderInteractionState = {
  fallbackPanCount: number;
  fallbackRecenterCount: number;
  focusCount: number;
  panCount: number;
  recenterCount: number;
  zoomCount: number;
};

const scriptLoads = new Map<string, Promise<void>>();
const fallbackMinZoom = 1;
const fallbackMaxZoom = 4;

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

    if (currentScript?.dataset.qdocLoaded === "true") {
      resolve();
      return;
    }

    currentScript?.remove();

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.qdocLoaded = "true";
      resolve();
    };
    script.onerror = () => {
      scriptLoads.delete(id);
      script.remove();
      reject(new Error("map_script_load_failed"));
    };
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

async function fetchNearbyHealthcare(userLocation: BrowserLocation) {
  const response = await fetch("/api/maps/nearby-healthcare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      radiusMeters: 5000,
    }),
  });

  return readApiResponse(response, nearbyHealthcareResponseSchema);
}

function getWindowMaps() {
  return window as Window & {
    mapboxgl?: MapboxNamespace;
    google?: GoogleNamespace;
  };
}

function getSiteDisplayPlaces(sites: PatientSiteSummary[]): MapDisplayPlace[] {
  return sites.flatMap((site) => {
    const coordinates = getCoordinates(site);

    if (!coordinates) {
      return [];
    }

    const address = [site.location.addressLine1, site.location.city, site.location.region].filter(Boolean).join(", ");

    return [
      {
        id: site.id,
        name: site.name,
        address: address || null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        qdocSiteId: site.id,
        kind: "qdoc_site" as const,
      },
    ];
  });
}

function getProviderDisplayPlaces(places: NearbyHealthcarePlace[]): MapDisplayPlace[] {
  return places.map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    qdocSiteId: place.qdocSiteId,
    kind: "provider_place" as const,
  }));
}

function getMarkerColor(place: MapDisplayPlace, isSelected: boolean) {
  if (isSelected) {
    return "#10b9c4";
  }

  return place.kind === "qdoc_site" ? "#087884" : "#475569";
}

function styleMapboxMarkerElement(element: HTMLButtonElement, place: MapDisplayPlace, isSelected: boolean) {
  element.dataset.selected = isSelected ? "true" : "false";
  element.setAttribute("aria-pressed", isSelected ? "true" : "false");
  element.style.width = isSelected ? "34px" : "28px";
  element.style.height = isSelected ? "34px" : "28px";
  element.style.border = "2px solid white";
  element.style.borderRadius = "9999px";
  element.style.boxShadow = isSelected ? "0 0 0 8px rgba(16, 185, 196, 0.18)" : "0 8px 18px rgba(15, 23, 42, 0.2)";
  element.style.background = getMarkerColor(place, isSelected);
}

function createMapboxMarkerElement(place: MapDisplayPlace, isSelected: boolean, onSelectPlace: (place: MapDisplayPlace) => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.testid = place.kind === "qdoc_site" ? "qdoc-map-marker" : "provider-map-marker";
  element.dataset.mapKind = place.kind;
  element.setAttribute("aria-label", `Select ${place.name}`);
  element.title = place.name;
  styleMapboxMarkerElement(element, place, isSelected);
  element.style.cursor = "pointer";
  element.style.transition = "transform 150ms ease, box-shadow 150ms ease";
  element.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectPlace(place);
  };

  return element;
}

function getGoogleMarkerIcon(place: MapDisplayPlace, isSelected: boolean) {
  const color = getMarkerColor(place, isSelected);
  const radius = isSelected ? 11 : 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="${radius}" fill="${color}" stroke="white" stroke-width="3"/></svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function initializeProviderMap(
  container: HTMLElement,
  config: MapConfigResponse,
  places: MapDisplayPlace[],
  userLocation: BrowserLocation | null,
  selectedPlaceId: string,
  onSelectPlace: (place: MapDisplayPlace) => void,
) {
  if (!config.provider) {
    return null;
  }

  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const firstPlace = places[0] ?? null;
  const center = selectedPlace
    ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }
    : userLocation
      ? { latitude: userLocation.latitude, longitude: userLocation.longitude }
      : firstPlace
        ? { latitude: firstPlace.latitude, longitude: firstPlace.longitude }
        : null;

  if (!center) {
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

    mapboxgl.accessToken = publicToken;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.longitude, center.latitude],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    if (userLocation) {
      new mapboxgl.Marker({ color: "#087884" }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map);
    }

    const markerElements = new Map<string, { element: HTMLButtonElement; place: MapDisplayPlace }>();

    for (const place of places) {
      const element = createMapboxMarkerElement(place, place.id === selectedPlaceId, onSelectPlace);
      markerElements.set(place.id, { element, place });
      new mapboxgl.Marker({ element })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(place.name))
        .addTo(map);
    }

    return {
      focusPlace: (place: MapDisplayPlace) => {
        map.flyTo({ center: [place.longitude, place.latitude], zoom: 13, essential: true });
      },
      panBy: (x: number, y: number) => {
        map.panBy([x, y]);
      },
      recenter: (location: BrowserLocation) => {
        map.flyTo({ center: [location.longitude, location.latitude], zoom: 13, essential: true });
      },
      remove: () => {
        map.remove();
      },
      selectPlace: (placeId: string) => {
        for (const [id, marker] of markerElements) {
          styleMapboxMarkerElement(marker.element, marker.place, id === placeId);
        }
      },
      zoomBy: (delta: number) => {
        map.setZoom(clamp(map.getZoom() + delta, 1, 18));
      },
    };
  }

  await loadScript(
    "qdoc-google-maps",
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(publicToken)}&loading=async`,
  );

  const google = getWindowMaps().google;

  if (!google) {
    throw new Error("google_maps_unavailable");
  }

  const map = new google.maps.Map(container, {
    center: { lat: center.latitude, lng: center.longitude },
    disableDefaultUI: false,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    zoomControl: true,
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

  const googleMarkers = new Map<string, { marker: { setIcon: (icon: string) => void }; place: MapDisplayPlace }>();

  for (const place of places) {
    const position = { lat: place.latitude, lng: place.longitude };
    bounds.extend(position);
    const marker = new google.maps.Marker({
      icon: getGoogleMarkerIcon(place, place.id === selectedPlaceId),
      map,
      position,
      title: place.name,
    });
    marker.addListener("click", () => onSelectPlace(place));
    googleMarkers.set(place.id, { marker, place });
  }

  if (userLocation || places.length > 0) {
    map.fitBounds(bounds);
  }

  return {
    focusPlace: (place: MapDisplayPlace) => {
      map.panTo({ lat: place.latitude, lng: place.longitude });
      map.setZoom(13);
    },
    panBy: (x: number, y: number) => {
      map.panBy(x, y);
    },
    recenter: (location: BrowserLocation) => {
      map.panTo({ lat: location.latitude, lng: location.longitude });
      map.setZoom(13);
    },
    remove: () => {
      container.replaceChildren();
    },
    selectPlace: (placeId: string) => {
      for (const [id, { marker, place }] of googleMarkers) {
        marker.setIcon(getGoogleMarkerIcon(place, id === placeId));
      }
    },
    zoomBy: (delta: number) => {
      map.setZoom(clamp((map.getZoom() ?? 12) + delta, 1, 18));
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getFallbackPosition(
  place: Pick<MapDisplayPlace, "latitude" | "longitude">,
  viewport: FallbackViewport,
  selected: boolean,
) {
  const kmPerLatitudeDegree = 111;
  const kmPerLongitudeDegree = Math.max(28, 111 * Math.cos((viewport.latitude * Math.PI) / 180));
  const percentPerKm = 7 * 2 ** (viewport.zoom - 1);
  const xOffset = (place.longitude - viewport.longitude) * kmPerLongitudeDegree * percentPerKm;
  const yOffset = (viewport.latitude - place.latitude) * kmPerLatitudeDegree * percentPerKm;

  return {
    left: `${clamp(50 + xOffset, 8, 92)}%`,
    top: `${clamp(50 + yOffset + (selected ? -3 : 0), 12, 88)}%`,
  };
}

function getInitialFallbackViewport(
  displayPlaces: MapDisplayPlace[],
  selectedDisplayPlaceId: string,
  userLocation: BrowserLocation | null,
): FallbackViewport {
  const selectedPlace = displayPlaces.find((place) => place.id === selectedDisplayPlaceId);
  const firstPlace = displayPlaces[0];

  if (selectedPlace) {
    return { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude, zoom: 2 };
  }

  if (userLocation) {
    return { latitude: userLocation.latitude, longitude: userLocation.longitude, zoom: 2 };
  }

  if (firstPlace) {
    return { latitude: firstPlace.latitude, longitude: firstPlace.longitude, zoom: 2 };
  }

  return { latitude: 43.465, longitude: -80.522, zoom: 2 };
}

function getFallbackPanOffset(viewport: FallbackViewport) {
  return 0.01 / 2 ** (viewport.zoom - 1);
}

export function ClinicMap({ sites, selectedSiteId, refreshKey, userLocation, onSelectSite }: ClinicMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMapRef = useRef<ProviderMapHandle | null>(null);
  const locationSignature = userLocation
    ? `${userLocation.latitude.toFixed(5)}:${userLocation.longitude.toFixed(5)}`
    : "";
  const [nearbyResult, setNearbyResult] = useState<{
    locationSignature: string;
    places: NearbyHealthcarePlace[];
  } | null>(null);
  const [selectedNearbyPlaceId, setSelectedNearbyPlaceId] = useState<string | null>(null);
  const [mapState, setMapState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [fallbackViewport, setFallbackViewport] = useState<FallbackViewport>({
    latitude: 43.465,
    longitude: -80.522,
    zoom: 2,
  });
  const [providerInteraction, setProviderInteraction] = useState<ProviderInteractionState>({
    fallbackPanCount: 0,
    fallbackRecenterCount: 0,
    focusCount: 0,
    panCount: 0,
    recenterCount: 0,
    zoomCount: 0,
  });

  const hasLocationContext = userLocation !== null;
  const siteDisplayPlaces = useMemo(() => getSiteDisplayPlaces(sites), [sites]);
  const providerDisplayPlaces = useMemo(() => {
    if (!nearbyResult || nearbyResult.locationSignature !== locationSignature) {
      return [];
    }

    return getProviderDisplayPlaces(nearbyResult.places);
  }, [locationSignature, nearbyResult]);
  const displayPlaces = useMemo(
    () =>
      hasLocationContext
        ? [
            ...siteDisplayPlaces,
            ...providerDisplayPlaces.filter(
              (place) => !place.qdocSiteId || !siteDisplayPlaces.some((site) => site.qdocSiteId === place.qdocSiteId),
            ),
          ]
        : siteDisplayPlaces,
    [hasLocationContext, providerDisplayPlaces, siteDisplayPlaces],
  );
  const isNearbySearchSettled = !hasLocationContext || nearbyResult?.locationSignature === locationSignature;
  const selectedNearbyPlace = selectedNearbyPlaceId
    ? providerDisplayPlaces.find((place) => place.id === selectedNearbyPlaceId) ?? null
    : null;
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0] ?? null;
  const selectedSiteAddress =
    selectedSite && !selectedNearbyPlace
      ? [selectedSite.location.addressLine1, selectedSite.location.city, selectedSite.location.region].filter(Boolean).join(", ")
      : "";
  const selectedLabel = selectedNearbyPlace?.name ?? selectedSite?.name ?? (hasLocationContext ? "No nearby clinics found" : "Select a clinic");
  const selectedAddress = selectedNearbyPlace?.address ?? selectedSiteAddress;
  const selectedDisplayPlaceId = selectedNearbyPlace?.id ?? selectedSiteId;
  const selectedDisplayPlaceIdRef = useRef(selectedDisplayPlaceId);

  const displaySignature = useMemo(
    () =>
      displayPlaces
        .map((place) => `${place.id}:${place.latitude}:${place.longitude}`)
        .join("|"),
    [displayPlaces],
  );

  useEffect(() => {
    return () => {
      providerMapRef.current?.remove();
      providerMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectedDisplayPlaceIdRef.current = selectedDisplayPlaceId;
  }, [selectedDisplayPlaceId]);

  useEffect(() => {
    setFallbackViewport((current) => {
      const next = getInitialFallbackViewport(displayPlaces, selectedDisplayPlaceId, userLocation);

      return { ...next, zoom: current.zoom };
    });
  }, [displayPlaces, selectedDisplayPlaceId, userLocation]);

  useEffect(() => {
    setSelectedNearbyPlaceId(null);
  }, [selectedSiteId]);

  const focusProviderPlace = useCallback((place: MapDisplayPlace) => {
    if (!providerMapRef.current) {
      return;
    }

    providerMapRef.current.focusPlace(place);
    setProviderInteraction((current) => ({
      ...current,
      focusCount: current.focusCount + 1,
    }));
  }, []);

  const recenterProviderMap = useCallback((location: BrowserLocation) => {
    if (!providerMapRef.current) {
      return;
    }

    providerMapRef.current.recenter(location);
    setProviderInteraction((current) => ({
      ...current,
      recenterCount: current.recenterCount + 1,
    }));
  }, []);

  const panProviderMap = useCallback((x: number, y: number) => {
    if (!providerMapRef.current) {
      return;
    }

    providerMapRef.current.panBy(x, y);
    setProviderInteraction((current) => ({
      ...current,
      panCount: current.panCount + 1,
    }));
  }, []);

  const zoomProviderMap = useCallback((delta: number) => {
    if (!providerMapRef.current) {
      return;
    }

    providerMapRef.current.zoomBy(delta);
    setProviderInteraction((current) => ({
      ...current,
      zoomCount: current.zoomCount + 1,
    }));
  }, []);

  const panFallbackMap = useCallback((latitudeDelta: number, longitudeDelta: number) => {
    setFallbackViewport((current) => ({
      ...current,
      latitude: current.latitude + latitudeDelta,
      longitude: current.longitude + longitudeDelta,
    }));
    setProviderInteraction((current) => ({
      ...current,
      fallbackPanCount: current.fallbackPanCount + 1,
    }));
  }, []);

  useEffect(() => {
    if (!userLocation) {
      setNearbyResult(null);
      setSelectedNearbyPlaceId(null);
      return;
    }

    const location = userLocation;
    const currentLocationSignature = locationSignature;
    let cancelled = false;

    async function loadNearbyPlaces() {
      try {
        const data = await fetchNearbyHealthcare(location);

        if (!cancelled) {
          setNearbyResult({ locationSignature: currentLocationSignature, places: data.places });
          setSelectedNearbyPlaceId((current) => (current && data.places.some((place) => place.id === current) ? current : null));
        }
      } catch {
        if (!cancelled) {
          setNearbyResult({ locationSignature: currentLocationSignature, places: [] });
          setSelectedNearbyPlaceId(null);
        }
      }
    }

    void loadNearbyPlaces();

    return () => {
      cancelled = true;
    };
  }, [locationSignature, refreshKey, userLocation]);

  const selectDisplayPlace = useCallback(
    (place: MapDisplayPlace) => {
      setFallbackViewport((current) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        zoom: Math.max(current.zoom, 2),
      }));

      if (place.qdocSiteId) {
        setSelectedNearbyPlaceId(null);
        onSelectSite(place.qdocSiteId);
        focusProviderPlace(place);
        return;
      }

      setSelectedNearbyPlaceId(place.id);
      focusProviderPlace(place);
    },
    [focusProviderPlace, onSelectSite],
  );

  useEffect(() => {
    if (!mapContainerRef.current || !isNearbySearchSettled) {
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

        if (!mapConfig.canLoad || !mapContainerRef.current) {
          setMapState("fallback");
          return;
        }

        const providerMap = await initializeProviderMap(
          mapContainerRef.current,
          mapConfig,
          displayPlaces,
          userLocation,
          selectedDisplayPlaceIdRef.current,
          selectDisplayPlace,
        );

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
  }, [displaySignature, displayPlaces, isNearbySearchSettled, refreshKey, selectDisplayPlace, userLocation]);

  useEffect(() => {
    providerMapRef.current?.selectPlace(selectedDisplayPlaceId);

    const place = displayPlaces.find((item) => item.id === selectedDisplayPlaceId);
    if (place && mapState === "ready") {
      focusProviderPlace(place);
    } else if (place) {
      setFallbackViewport((current) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        zoom: Math.max(current.zoom, 2),
      }));
    }
  }, [displayPlaces, focusProviderPlace, mapState, selectedDisplayPlaceId]);

  return (
    <section
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      data-fallback-pan-count={providerInteraction.fallbackPanCount}
      data-fallback-recenter-count={providerInteraction.fallbackRecenterCount}
      data-fallback-zoom={fallbackViewport.zoom}
      data-has-user-location={userLocation ? "true" : "false"}
      data-map-display-place-count={displayPlaces.length}
      data-map-state={mapState}
      data-nearby-search-settled={isNearbySearchSettled ? "true" : "false"}
      data-provider-focus-count={providerInteraction.focusCount}
      data-provider-pan-count={providerInteraction.panCount}
      data-provider-place-count={providerDisplayPlaces.length}
      data-provider-recenter-count={providerInteraction.recenterCount}
      data-provider-zoom-count={providerInteraction.zoomCount}
      data-qdoc-site-count={siteDisplayPlaces.length}
      data-testid="clinic-map-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Nearby clinics</h2>
          <p className="text-sm text-slate-600">
            {userLocation ? "Centered on your current area." : "Using clinic locations until location access is allowed."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#087884]">
          {mapState === "loading" ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
          {mapState === "loading" ? "Loading map" : "Clinic map"}
        </div>
      </div>

      <div className="relative h-[280px] bg-[#e4f5f3]">
        <div
          ref={mapContainerRef}
          data-testid="clinic-map-provider-container"
          className={`absolute inset-0 z-10 ${mapState === "ready" ? "" : "pointer-events-none"}`}
          aria-hidden={mapState !== "ready"}
        />
        {mapState !== "ready" ? (
          <div
            className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#dcf4f1_0%,#f8fafc_56%,#eaf7ef_100%)]"
            data-testid="clinic-map-fallback"
          >
            <div className="absolute left-[-8%] top-[20%] h-24 w-[120%] rotate-[-7deg] bg-white/70" />
            <div className="absolute left-[18%] top-[-8%] h-[120%] w-24 rotate-[25deg] bg-white/55" />
            <div className="absolute left-[5%] top-[54%] h-20 w-[110%] rotate-[8deg] bg-white/60" />
            {userLocation ? (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#087884] p-2 text-white shadow-md ring-8 ring-[#087884]/15"
                style={getFallbackPosition(userLocation, fallbackViewport, false)}
                data-testid="clinic-map-current-location"
              >
                <Crosshair size={18} aria-hidden="true" />
              </div>
            ) : null}
            {displayPlaces.map((place) => {
              const isSelected = place.id === selectedDisplayPlaceId;
              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => selectDisplayPlace(place)}
                  className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full p-2 shadow-md transition ${
                    isSelected
                      ? "bg-[#10b9c4] text-white ring-8 ring-[#10b9c4]/20"
                      : place.kind === "qdoc_site"
                        ? "bg-white text-[#087884]"
                        : "bg-slate-700 text-white"
                  }`}
                  data-map-kind={place.kind}
                  data-selected={isSelected ? "true" : "false"}
                  data-testid={place.kind === "qdoc_site" ? "qdoc-map-marker" : "provider-map-marker"}
                  style={getFallbackPosition(place, fallbackViewport, isSelected)}
                  aria-label={`Select ${place.name}`}
                  aria-pressed={isSelected}
                >
                  <MapPin size={18} aria-hidden="true" />
                </button>
              );
            })}
            <div className="absolute left-3 top-3 z-20 grid w-[92px] grid-cols-3 gap-1">
              <span />
              <button
                type="button"
                onClick={() => panFallbackMap(getFallbackPanOffset(fallbackViewport), 0)}
                className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Pan map up"
                data-testid="clinic-map-pan-up"
              >
                <ArrowUp size={15} aria-hidden="true" />
              </button>
              <span />
              <button
                type="button"
                onClick={() => panFallbackMap(0, -getFallbackPanOffset(fallbackViewport))}
                className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Pan map left"
                data-testid="clinic-map-pan-left"
              >
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => panFallbackMap(-getFallbackPanOffset(fallbackViewport), 0)}
                className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Pan map down"
                data-testid="clinic-map-pan-down"
              >
                <ArrowDown size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => panFallbackMap(0, getFallbackPanOffset(fallbackViewport))}
                className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Pan map right"
                data-testid="clinic-map-pan-right"
              >
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="absolute right-3 top-3 z-20 grid gap-2">
              <button
                type="button"
                onClick={() =>
                  setFallbackViewport((current) => ({
                    ...current,
                    zoom: Math.min(fallbackMaxZoom, current.zoom + 1),
                  }))
                }
                className="inline-flex size-9 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Zoom in map"
                data-testid="clinic-map-zoom-in"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setFallbackViewport((current) => ({
                    ...current,
                    zoom: Math.max(fallbackMinZoom, current.zoom - 1),
                  }))
                }
                className="inline-flex size-9 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                aria-label="Zoom out map"
                data-testid="clinic-map-zoom-out"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              {userLocation ? (
                <button
                  type="button"
                  onClick={() => {
                    setFallbackViewport((current) => ({
                      latitude: userLocation.latitude,
                      longitude: userLocation.longitude,
                      zoom: Math.max(current.zoom, 2),
                    }));
                    setProviderInteraction((current) => ({
                      ...current,
                      fallbackRecenterCount: current.fallbackRecenterCount + 1,
                    }));
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
                  aria-label="Recenter map to your location"
                  data-testid="clinic-map-fallback-recenter"
                >
                  <Crosshair size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="absolute bottom-3 left-3 z-20 rounded-md bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
              Showing clinic locations.
            </div>
          </div>
        ) : null}
        {userLocation && mapState === "ready" ? (
          <button
            type="button"
            onClick={() => recenterProviderMap(userLocation)}
            className="absolute bottom-3 right-3 z-30 inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
            aria-label="Recenter map to your location"
            data-testid="clinic-map-provider-recenter"
          >
            <Crosshair size={16} aria-hidden="true" />
            Current area
          </button>
        ) : null}
        {mapState === "ready" ? (
          <div className="absolute left-3 top-3 z-30 grid w-[92px] grid-cols-3 gap-1">
            <span />
            <button
              type="button"
              onClick={() => panProviderMap(0, -80)}
              className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Pan map up"
              data-testid="clinic-map-provider-pan-up"
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <span />
            <button
              type="button"
              onClick={() => panProviderMap(-80, 0)}
              className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Pan map left"
              data-testid="clinic-map-provider-pan-left"
            >
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => panProviderMap(0, 80)}
              className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Pan map down"
              data-testid="clinic-map-provider-pan-down"
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => panProviderMap(80, 0)}
              className="inline-flex size-8 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Pan map right"
              data-testid="clinic-map-provider-pan-right"
            >
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {mapState === "ready" ? (
          <div className="absolute right-3 top-3 z-30 grid gap-2">
            <button
              type="button"
              onClick={() => zoomProviderMap(1)}
              className="inline-flex size-9 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Zoom in map"
              data-testid="clinic-map-provider-zoom-in"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => zoomProviderMap(-1)}
              className="inline-flex size-9 items-center justify-center rounded-md bg-white text-[#087884] shadow-sm ring-1 ring-slate-200 hover:bg-[#eefbfc]"
              aria-label="Zoom out map"
              data-testid="clinic-map-provider-zoom-out"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
        <span className="font-medium text-slate-950" data-testid="clinic-map-selected-label">
          {selectedLabel}
        </span>
        {selectedAddress ? (
          <span className="text-slate-500" data-testid="clinic-map-selected-address">
            {selectedAddress}
          </span>
        ) : null}
      </div>
    </section>
  );
}
