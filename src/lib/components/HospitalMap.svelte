<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let points: Array<{
    id: string;
    name: string;
    shortName: string;
    lat: number;
    lng: number;
    count: number;
  }>;
  export let height: string = '480px';

  let mapEl: HTMLDivElement | undefined;
  let map: any = null;
  let markersLayer: any = null;
  let LRef: any = null;

  onMount(async () => {
    // Lazy-load Leaflet so SSR doesn't choke on `window`.
    const L = await import('leaflet');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await import('leaflet/dist/leaflet.css');
    LRef = L;
    if (!mapEl) return;
    map = L.map(mapEl, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true
    }).setView([39.5, -96], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap · © CARTO',
      subdomains: 'abcd'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    drawMarkers();
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });

  function drawMarkers() {
    if (!map || !LRef || !markersLayer) return;
    const L = LRef;
    markersLayer.clearLayers();

    if (points.length === 0) return;

    const max = Math.max(1, ...points.map((p) => p.count));
    // Visual area scales linearly with count, min size large enough to fit
    // a 4-digit count label centered in the circle.
    const k = 36 / Math.sqrt(max);

    for (const p of points) {
      const radius = Math.max(16, Math.sqrt(Math.max(1, p.count)) * k);
      const circle = L.circleMarker([p.lat, p.lng], {
        radius,
        color: 'oklch(44% 0.030 115)',
        fillColor: 'oklch(60% 0.036 115)',
        fillOpacity: 0.7,
        weight: 1.5
      });
      circle.bindTooltip(p.count.toLocaleString(), {
        permanent: true,
        direction: 'center',
        className: 'cb-count-label',
        opacity: 1,
        offset: [0, 0]
      });
      circle.bindPopup(
        `<div style="font-family: Inter, system-ui, sans-serif;">
           <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${escapeHtml(p.name)}</div>
           <div style="font-size:12px; color:#666;">${p.count.toLocaleString()} patient${p.count === 1 ? '' : 's'}</div>
         </div>`
      );
      circle.addTo(markersLayer);
    }

    // Fit bounds to all points
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Re-draw if the points prop changes
  $: if (map && LRef && markersLayer && points) drawMarkers();
</script>

<div bind:this={mapEl} class="map" style:height></div>

<style>
  .map {
    width: 100%;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    background: var(--bg-sunken);
  }

  :global(.leaflet-container) {
    font-family: var(--font-sans);
  }

  :global(.leaflet-popup-content-wrapper) {
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  /* Permanent count label centered exactly inside each hospital circle.
     Leaflet centers the tooltip via negative margins it sets on the element
     when direction === 'center'; we let that do the math and just style. */
  :global(.leaflet-tooltip.cb-count-label) {
    background: transparent;
    border: none;
    box-shadow: none;
    color: white;
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    white-space: nowrap;
  }
  :global(.leaflet-tooltip.cb-count-label::before) {
    display: none;
  }
</style>
