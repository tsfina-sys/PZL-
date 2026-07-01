const PZL_BUILD = "PZL_NAV_ROUTE_STAYS_METAR_20260701AQ";
const APP_CACHE = "pzl-app-" + PZL_BUILD;
const TILE_CACHE = "pzl-map-tiles-v2";
const CACHE_PREFIX = "pzl-app-";

const localUrl = path => new URL(path, self.location.href).href;

const LOCAL_APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./pzl_marker_topview.png",
  "./version.txt"
];

const EXTERNAL_CORE = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

const OVERVIEW_TILES = [
  {z:5,x:16,y:11},
  {z:5,x:16,y:12},
  {z:5,x:16,y:13},
  {z:5,x:17,y:11},
  {z:5,x:17,y:12},
  {z:5,x:17,y:13},
  {z:5,x:18,y:11},
  {z:5,x:18,y:12},
  {z:5,x:18,y:13},
  {z:6,x:33,y:22},
  {z:6,x:33,y:23},
  {z:6,x:33,y:24},
  {z:6,x:33,y:25},
  {z:6,x:33,y:26},
  {z:6,x:34,y:22},
  {z:6,x:34,y:23},
  {z:6,x:34,y:24},
  {z:6,x:34,y:25},
  {z:6,x:34,y:26},
  {z:6,x:35,y:22},
  {z:6,x:35,y:23},
  {z:6,x:35,y:24},
  {z:6,x:35,y:25},
  {z:6,x:35,y:26},
  {z:6,x:36,y:22},
  {z:6,x:36,y:23},
  {z:6,x:36,y:24},
  {z:6,x:36,y:25},
  {z:6,x:36,y:26},
  {z:6,x:37,y:22},
  {z:6,x:37,y:23},
  {z:6,x:37,y:24},
  {z:6,x:37,y:25},
  {z:6,x:37,y:26}
];

function isOsmTile(url) {
  return (
    /(^|\.)tile\.openstreetmap\.org$/i.test(url.hostname) &&
    /^\/\d+\/\d+\/\d+\.png$/i.test(url.pathname)
  );
}

function parseTile(url) {
  const match = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/i);
  if (!match) return null;
  return {
    z:Number(match[1]),
    x:Number(match[2]),
    y:Number(match[3])
  };
}

function normalizedTileKey(tile) {
  return localUrl(
    "./__offline_tiles__/" +
    tile.z + "/" + tile.x + "/" + tile.y + ".png"
  );
}

function offlineTileResponse(tile) {
  const z = tile ? tile.z : "-";
  const x = tile ? tile.x : "-";
  const y = tile ? tile.y : "-";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" fill="#dce7ed"/>` +
    `<path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#b8c8d1" stroke-width="1"/>` +
    `<rect x="1" y="1" width="254" height="254" fill="none" stroke="#9fb2bd" stroke-width="2"/>` +
    `<text x="128" y="116" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#49616e">OFFLINE</text>` +
    `<text x="128" y="142" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#5f7480">χάρτης μη αποθηκευμένος</text>` +
    `<text x="128" y="164" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#758994">z${z} / x${x} / y${y}</text>` +
    `</svg>`;

  return new Response(svg, {
    status:200,
    headers:{
      "Content-Type":"image/svg+xml",
      "Cache-Control":"no-store"
    }
  });
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, {
      signal:controller.signal,
      cache:"no-store"
    });
  } finally {
    clearTimeout(timer);
  }
}

async function putExternalCore(cache, url) {
  try {
    const request = new Request(url, {
      mode:"no-cors",
      cache:"reload"
    });
    const response = await fetch(request);
    if (response) await cache.put(url, response.clone());
  } catch(e) {}
}

async function cacheOverviewTile(tileCache, tile) {
  const sourceUrl =
    "https://a.tile.openstreetmap.org/" +
    tile.z + "/" + tile.x + "/" + tile.y + ".png";

  try {
    const request = new Request(sourceUrl, {
      mode:"no-cors",
      cache:"reload"
    });
    const response = await fetch(request);
    if (response) {
      await tileCache.put(
        normalizedTileKey(tile),
        response.clone()
      );
    }
  } catch(e) {}
}

async function notifyClients() {
  const clients = await self.clients.matchAll({
    type:"window",
    includeUncontrolled:true
  });
  clients.forEach(client => client.postMessage({
    type:"PZL_OFFLINE_READY",
    build:PZL_BUILD
  }));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const appCache = await caches.open(APP_CACHE);

    await appCache.addAll(
      LOCAL_APP_SHELL.map(localUrl)
    );

    await Promise.allSettled(
      EXTERNAL_CORE.map(url => putExternalCore(appCache, url))
    );

    const tileCache = await caches.open(TILE_CACHE);
    await Promise.allSettled(
      OVERVIEW_TILES.map(tile => cacheOverviewTile(tileCache, tile))
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE)
        .map(name => caches.delete(name))
    );

    await self.clients.claim();
    await notifyClients();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "PZL_CHECK_OFFLINE_READY") {
    if (event.source && event.source.postMessage) {
      event.source.postMessage({
        type:"PZL_OFFLINE_READY",
        build:PZL_BUILD
      });
    }
  }
});

async function handleNavigation(request) {
  const appCache = await caches.open(APP_CACHE);

  try {
    const response = await fetchWithTimeout(request, 4500);
    if (response && response.ok) {
      await appCache.put(
        localUrl("./index.html"),
        response.clone()
      );
      return response;
    }
  } catch(e) {}

  return (
    await appCache.match(localUrl("./index.html"), {ignoreSearch:true})
  ) || (
    await appCache.match(localUrl("./"), {ignoreSearch:true})
  );
}

async function handleAppAsset(request) {
  const appCache = await caches.open(APP_CACHE);
  const cached =
    await appCache.match(request, {ignoreSearch:true}) ||
    await caches.match(request, {ignoreSearch:true});

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response) await appCache.put(request, response.clone());
    return response;
  } catch(e) {
    return Response.error();
  }
}

async function handleOsmTile(request, url) {
  const tile = parseTile(url);
  const tileCache = await caches.open(TILE_CACHE);
  const key = normalizedTileKey(tile);

  const cached = await tileCache.match(key);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response) {
      await tileCache.put(key, response.clone());
      return response;
    }
  } catch(e) {}

  return offlineTileResponse(tile);
}

function isOnlineOnlyApi(url) {
  return (
    url.hostname === "nominatim.openstreetmap.org" ||
    url.hostname === "api.sunrise-sunset.org" ||
    url.hostname === "api.checkwx.com"
  );
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isOsmTile(url)) {
    event.respondWith(handleOsmTile(request, url));
    return;
  }

  if (isOnlineOnlyApi(url)) {
    event.respondWith(
      fetch(request).catch(() => Response.error())
    );
    return;
  }

  if (
    url.origin === self.location.origin ||
    EXTERNAL_CORE.includes(url.href)
  ) {
    event.respondWith(handleAppAsset(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      return (
        await caches.match(request, {ignoreSearch:true})
      ) || Response.error();
    })
  );
});
