/**
 * The campus map's page, drawn by MapLibre GL inside a WebView: free tiles from OpenFreeMap (no key, no quota) and,
 * for the satellite view, Esri World Imagery. Driven from CampusMap.tsx through `window.ugb.*` (data in) and
 * `ReactNativeWebView.postMessage` (taps out). No Google Maps: it also runs on phones without Google services.
 */

export const MAPLIBRE_VERSION = '4.7.1';
const IONICONS_VERSION = '7.4.0';

export const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Messages the page sends back. */
export type MapEvent = { type: 'ready' } | { type: 'select'; id: string } | { type: 'tap' } | { type: 'zoomed'; named: boolean } | { type: 'error'; message: string };

export const campusMapHtml = (colors: { ink: string; sand: string }) => `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.ink}; }
  .pin { width: 90px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
  .band { height: 22px; }
  .dot-ico { width: 17px; height: 17px; border-radius: 50%; border: 1px solid rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
  .ico { width: 9px; height: 9px; background: #fff; -webkit-mask: var(--icon) center / contain no-repeat; mask: var(--icon) center / contain no-repeat; }
  .name { height: 22px; margin-top: 1px; font: 700 8.5px/10px -apple-system, Roboto, sans-serif; color: #F3F5F8; text-align: center;
          text-shadow: 0 1px 3px rgba(0,0,0,.9); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; opacity: 0; }
  .named .name, .on .name { opacity: 1; }
  .on .dot-ico { width: 24px; height: 24px; border: 2px solid #fff; margin: -3.5px 0; }
  .on .ico { width: 12px; height: 12px; }
  .zone { font: 800 9px -apple-system, Roboto, sans-serif; letter-spacing: 1px; color: ${colors.sand}; text-shadow: 0 1px 3px rgba(0,0,0,.9); white-space: nowrap; cursor: pointer; }
  .zone.on { font-size: 11px; color: #fff; }
  .spot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(255,255,255,.85); box-sizing: border-box; cursor: pointer; }
  .spot.on { width: 12px; height: 12px; border: 2px solid #fff; }
  .me { width: 14px; height: 14px; border-radius: 50%; background: #3B82F6; border: 2px solid #fff; box-shadow: 0 0 0 6px rgba(59,130,246,.25); }
  .maplibregl-ctrl-attrib { display: none; }
</style>
</head><body><div id="map"></div>
<script>
(function () {
  var post = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  if (!window.maplibregl) { post({ type: 'error', message: 'maplibre' }); return; }
  var map = new maplibregl.Map({ container: 'map', style: '${DARK_STYLE}', center: [-16.423, 16.063], zoom: 15, minZoom: 14, maxZoom: 19,
    attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
  map.touchZoomRotate.disableRotation();

  var state = { pins: [], selected: null, satellite: false, named: false };
  var markers = {};
  var me = null;
  var NAMES_FROM = 16.6; // names show once zoomed in enough to read them

  // The whole world minus the campus: everything outside it is dimmed. Then its dashed outline.
  var WORLD = [[-17.5, 17], [-15.5, 17], [-15.5, 15], [-17.5, 15], [-17.5, 17]];
  function frame(outline) {
    var ring = outline.map(function (p) { return [p.lng, p.lat]; });
    if (ring.length) ring.push(ring[0]);
    return {
      mask: { type: 'Feature', geometry: { type: 'Polygon', coordinates: ring.length > 3 ? [WORLD, ring] : [WORLD.slice(0, 0)] } },
      line: { type: 'Feature', geometry: { type: 'LineString', coordinates: ring } },
    };
  }

  // The plan's own drawing (roads, paths, buildings, areas): hidden over the satellite pictures, where its dark lines
  // would cross them. Its names stay, as on Google's hybrid view.
  var planLayers = [];
  map.on('load', function () {
    var layers = map.getStyle().layers;
    // Only those drawn to begin with: back on « Plan », the ones the style hides stay hidden.
    planLayers = layers.filter(function (l) { return l.type !== 'symbol' && l.type !== 'background' && !(l.layout && l.layout.visibility === 'none'); }).map(function (l) { return l.id; });
    var firstSymbol = (layers.find(function (l) { return l.type === 'symbol'; }) || {}).id;
    // Esri has no pictures past level 17 over Saint-Louis ("Map data not yet available"): beyond it, the level-17
    // picture is enlarged instead.
    map.addSource('sat', { type: 'raster', tiles: ['${SATELLITE_TILES}'], tileSize: 256, maxzoom: 17 });
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }, firstSymbol);
    map.addSource('mask', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('outline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': 'rgb(8,11,16)', 'fill-opacity': 0.78 } });
    map.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': '${colors.sand}', 'line-width': 2, 'line-dasharray': [5, 3] } });
    post({ type: 'ready' });
  });
  map.on('error', function (e) { if (e && e.error && /style/i.test(String(e.error.message))) post({ type: 'error', message: 'style' }); });
  map.on('click', function () { post({ type: 'tap' }); });
  map.on('zoomend', function () {
    var named = map.getZoom() >= NAMES_FROM;
    if (named === state.named) return;
    state.named = named;
    document.getElementById('map').classList.toggle('named', named);
    post({ type: 'zoomed', named: named });
  });

  function element(p) {
    var look = p.look || 'pin';
    var el = document.createElement('div');
    if (look === 'zone') { el.className = 'zone'; el.textContent = p.name.toUpperCase(); }
    else if (look === 'dot') { el.className = 'spot'; el.style.background = p.color; }
    else {
      el.className = 'pin';
      var band = document.createElement('div'); band.className = 'band';
      var dot = document.createElement('div'); dot.className = 'dot-ico'; dot.style.background = p.color;
      var ico = document.createElement('div'); ico.className = 'ico';
      ico.style.setProperty('--icon', 'url(https://unpkg.com/ionicons@${IONICONS_VERSION}/dist/svg/' + encodeURIComponent(p.icon) + '.svg)');
      var name = document.createElement('div'); name.className = 'name'; name.textContent = p.name;
      dot.appendChild(ico); el.appendChild(band); el.appendChild(dot); el.appendChild(name);
    }
    el.style.zIndex = look === 'dot' ? 0 : look === 'zone' ? 1 : 2;
    el.addEventListener('click', function (ev) { ev.stopPropagation(); post({ type: 'select', id: p.id }); });
    return el;
  }

  function drawPins(pins) {
    var keep = {};
    pins.forEach(function (p) {
      var key = p.kind + '-' + p.id;
      keep[key] = true;
      var sig = [p.lat, p.lng, p.look, p.color, p.icon, p.name].join('|');
      var m = markers[key];
      if (m && m.sig === sig) return;
      if (m) m.marker.remove();
      var el = element(p);
      markers[key] = { sig: sig, id: p.id, el: el, marker: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map) };
    });
    Object.keys(markers).forEach(function (k) { if (!keep[k]) { markers[k].marker.remove(); delete markers[k]; } });
  }

  function highlight(id) {
    Object.keys(markers).forEach(function (k) {
      var m = markers[k], on = m.id === id;
      m.el.classList.toggle('on', on);
      m.el.style.zIndex = on ? 3 : (m.el.className.indexOf('spot') >= 0 ? 0 : m.el.className.indexOf('zone') >= 0 ? 1 : 2);
    });
  }

  window.ugb = {
    /** The campus: its outline, the box the camera stays in, the view it opens on. */
    campus: function (c) {
      var f = frame(c.outline || []);
      map.getSource('mask').setData({ type: 'FeatureCollection', features: c.outline && c.outline.length > 2 ? [f.mask] : [] });
      map.getSource('outline').setData({ type: 'FeatureCollection', features: c.outline && c.outline.length > 2 ? [f.line] : [] });
      var b = c.box, m = 0.004;
      map.setMaxBounds([[b.west - m, b.south - m], [b.east + m, b.north + m]]);
      if (c.start) map.jumpTo({ center: [c.start.lng, c.start.lat], zoom: Math.log2(360 / c.start.delta) });
    },
    pins: function (pins) { state.pins = pins; drawPins(pins); highlight(state.selected); },
    select: function (id) { state.selected = id; highlight(id); },
    satellite: function (on) {
      state.satellite = on;
      map.setLayoutProperty('sat', 'visibility', on ? 'visible' : 'none');
      planLayers.forEach(function (id) { map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible'); });
      map.setPaintProperty('mask', 'fill-opacity', on ? 0.55 : 0.78);
    },
    padding: function (top) { map.setPadding({ top: top, right: 0, bottom: 0, left: 0 }); },
    fly: function (lat, lng, zoom) { map.flyTo({ center: [lng, lat], zoom: zoom, duration: 400 }); },
    fit: function (b, pad) { map.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: pad, duration: 500 }); },
    me: function (p) {
      if (!p) { if (me) { me.remove(); me = null; } return; }
      if (!me) { var el = document.createElement('div'); el.className = 'me'; me = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map); }
      else me.setLngLat([p.lng, p.lat]);
    },
  };
})();
</script></body></html>`;
