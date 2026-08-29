import { MODULE_ID, DEFAULT_PROXY_URL } from "./config.mjs";

/**
 * Direct API Client for Jenne DDB Proxy
 */
export class JenneDDBApi {
  static getProxyUrl() {
    return game.settings.get(MODULE_ID, "proxyUrl") || DEFAULT_PROXY_URL;
  }

  static getCobaltCookie() {
    return game.settings.get(MODULE_ID, "cobaltCookie") || "";
  }

  static async post(endpoint, data = {}) {
    const proxyUrl = this.getProxyUrl();
    const cobalt = this.getCobaltCookie();
    const payload = { cobalt, ...data };

    const url = `${proxyUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return await res.json();
  }

  static async get(endpoint) {
    const proxyUrl = this.getProxyUrl();
    const url = `${proxyUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    return await res.json();
  }

  static async checkCobalt(cookieOverride = null, proxyOverride = null) {
    const proxyUrl = proxyOverride || this.getProxyUrl();
    const cobalt = cookieOverride !== null ? cookieOverride : this.getCobaltCookie();
    const payload = { cobalt };
    const url = `${proxyUrl}${proxyUrl.endsWith("/") ? "" : "/"}proxy/auth`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
      }
      const data = await res.json();
      return { success: !!data.success, message: data.message || (data.success ? "Authenticated" : "Unauthenticated session") };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  static async getConfig() {
    const res = await this.get("/proxy/api/config/json");
    return res.data;
  }

  static async extractAdventure(sourceId) {
    return await this.post(`/proxy/adventure/extract/${sourceId}`, { sourceId });
  }

  static async getMonsters(options = {}) {
    return await this.post("/proxy/monsters", options);
  }

  static async getSpells(options = {}) {
    return await this.post("/proxy/class/spells", options);
  }

  static async getItems(campaignId = null) {
    return await this.post("/proxy/items", { campaignId });
  }

  static async getGameData(type, campaignId = null) {
    return await this.post(`/proxy/${type}`, { campaignId });
  }

  static async getCampaigns() {
    return await this.post("/proxy/campaigns");
  }

  static async getEncounters() {
    return await this.post("/proxy/encounters");
  }

  static async getCharacter(characterId) {
    return await this.post("/proxy/v5/character", { characterId });
  }
}
