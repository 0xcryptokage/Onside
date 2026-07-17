const fetch = require("node-fetch");

const AUTH_HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";

let cachedJwt = null;

async function getJwt(forceRefresh = false) {
  if (cachedJwt && !forceRefresh) return cachedJwt;
  const res = await fetch(`${AUTH_HOST}/auth/guest/start`, { method: "POST" });
  const data = await res.json();
  cachedJwt = data.token;
  return cachedJwt;
}

/**
 * Wraps any TxLINE API call. If it returns 401 (expired JWT — happens after
 * 30 days per their docs, but cheap to always handle), fetches a fresh JWT
 * and retries once. The API token itself doesn't need refreshing — it's
 * valid for the whole subscription period.
 */
async function callWithAuth(path, apiToken) {
  let jwt = await getJwt();
  let res = await fetch(`${AUTH_HOST}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });

  if (res.status === 401) {
    jwt = await getJwt(true);
    res = await fetch(`${AUTH_HOST}${path}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TxLINE request failed (${res.status}): ${text}`);
  }
  return res.json();
}

module.exports = { getJwt, callWithAuth, AUTH_HOST };
