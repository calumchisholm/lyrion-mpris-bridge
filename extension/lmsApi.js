import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import * as Constants from './constants.js';
import {logDebug, logWarn, logError} from './logging.js';

export class LmsApi {
  constructor({session} = {}) {
    this._session = session;
  }

  _applyAuth(message, auth) {
    if (!auth) {
      return;
    }
    const username = auth.username ?? '';
    const password = auth.password ?? '';
    if (!username && !password) {
      return;
    }
    // LMS uses basic auth for JSON-RPC.
    const raw = `${username}:${password}`;
    const encoded = GLib.base64_encode(new TextEncoder().encode(raw));
    message.request_headers.append('Authorization', `Basic ${encoded}`);
  }

  async _sendJsonBody(url, body, auth) {
    const message = Soup.Message.new('POST', url);
    message.request_headers.append('Content-Type', 'application/json');
    this._applyAuth(message, auth);
    const bytes = new GLib.Bytes(body);
    message.set_request_body_from_bytes('application/json', bytes);

    const responseBytes = await new Promise((resolve, reject) => {
      this._session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          try {
            resolve(session.send_and_read_finish(res));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
    return {
      bytes: responseBytes,
      status: message.get_status(),
    };
  }

  _buildUrl(serverScheme, serverAddress, serverPort) {
    return `${this._buildBaseUrl(serverScheme, serverAddress, serverPort)}/jsonrpc.js`;
  }

  _buildUrlWithAuth(serverScheme, serverAddress, serverPort, auth) {
    return `${this._buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth)}/jsonrpc.js`;
  }

  _buildBaseUrl(serverScheme, serverAddress, serverPort) {
    return `${serverScheme}://${serverAddress}:${serverPort}`;
  }

  _buildAuthSegment(auth) {
    const username = auth?.username ?? '';
    const password = auth?.password ?? '';
    if (!username && !password) {
      return '';
    }
    const safeUser = encodeURIComponent(username);
    const safePass = encodeURIComponent(password);
    // Allow username-only or password-only auth; LMS tolerates both.
    const separator = !username || password ? ':' : '';
    return `${safeUser}${separator}${safePass}@`;
  }

  _buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth) {
    const authSegment = this._buildAuthSegment(auth);
    if (!authSegment) {
      return this._buildBaseUrl(serverScheme, serverAddress, serverPort);
    }
    // Workaround: artwork/HTML endpoints are fetched by clients without headers, so embed auth.
    return `${serverScheme}://${authSegment}${serverAddress}:${serverPort}`;
  }

  async fetchStatus({serverScheme, serverAddress, serverPort, playerId, request, auth}) {
    const logUrl = this._buildUrl(serverScheme, serverAddress, serverPort);
    const url = this._buildUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    const body = JSON.stringify({
      id: 1,
      method: 'slim.request',
      params: [playerId, request],
    });
    const startedAtUs = GLib.get_monotonic_time();
    logDebug(`LMS status request url=${logUrl} playerId=${playerId}`);

    const {bytes, status} = await this._sendJsonBody(url, body, auth);

    const text = new TextDecoder().decode(bytes.get_data());
    if (status !== Soup.Status.OK) {
      logError(`LMS HTTP ${status} for ${logUrl}`);
      logError(`LMS response body: ${text}`);
      throw new Error(`LMS HTTP ${status}`);
    }
    if (!text) {
      logError(`empty LMS response from ${url}`);
      throw new Error('Empty LMS response');
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      logError(`failed to parse LMS response: ${e}`);
      logError(`LMS response body: ${text}`);
      throw e;
    }
    if (json?.error) {
      const message = json.error?.message || 'Unknown LMS error';
      const code = json.error?.code;
      throw new Error(code ? `LMS error ${code}: ${message}` : `LMS error: ${message}`);
    }
    if (!json?.result) {
      throw new Error('Unexpected LMS response');
    }
    const result = json.result;
    const elapsedMs = Math.round((GLib.get_monotonic_time() - startedAtUs) / 1000);
    logDebug(`LMS status ok in ${elapsedMs}ms mode=${result?.mode} time=${result?.time} duration=${result?.duration}`);
    return result;
  }

  async sendPlayerCommand({serverScheme, serverAddress, serverPort, playerId, commandArray, auth}) {
    const logUrl = this._buildUrl(serverScheme, serverAddress, serverPort);
    const url = this._buildUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    logDebug(`LMS command ${JSON.stringify(commandArray)} url=${logUrl} playerId=${playerId}`);
    const body = JSON.stringify({
      id: 1,
      method: 'slim.request',
      params: [playerId, commandArray],
    });

    const {bytes, status} = await this._sendJsonBody(url, body, auth);

    if (status !== Soup.Status.OK) {
      logWarn(`LMS command HTTP ${status} for ${logUrl}`);
    }
    const text = new TextDecoder().decode(bytes.get_data());
    if (!text) {
      logDebug('LMS command empty response');
      return;
    }
    try {
      const json = JSON.parse(text);
      if (json?.error) {
        const message = json.error?.message || 'Unknown LMS error';
        const code = json.error?.code;
        logError(code ? `LMS command error ${code}: ${message}` : `LMS command error: ${message}`);
      } else {
        logDebug('LMS command ok');
      }
    } catch (e) {
      logWarn(`LMS command response parse error: ${e}`);
    }
  }

  async loadPlayers({serverScheme, serverAddress, serverPort, auth}) {
    const logUrl = this._buildUrl(serverScheme, serverAddress, serverPort);
    const url = this._buildUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    logDebug(`LMS players request url=${logUrl}`);
    const body = JSON.stringify({
      id: 1,
      method: 'slim.request',
      params: ['', ['players', 0, 200]],
    });

    const {bytes, status} = await this._sendJsonBody(url, body, auth);
    const text = new TextDecoder().decode(bytes.get_data());
    if (status !== Soup.Status.OK) {
      logError(`LMS HTTP ${status} for ${logUrl}`);
      logError(`LMS response body: ${text}`);
      throw new Error(`LMS HTTP ${status}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      logError(`failed to parse LMS response: ${e}`);
      logError(`LMS response body: ${text}`);
      throw e;
    }
    if (json?.error) {
      const message = json.error?.message || 'Unknown LMS error';
      const code = json.error?.code;
      throw new Error(code ? `LMS error ${code}: ${message}` : `LMS error: ${message}`);
    }
    const players = json?.result?.players_loop || [];
    const mapped = players.map(player => ({
      id: player?.playerid || '',
      name: player?.name || '',
    })).filter(player => player.id);
    logDebug(`LMS players loaded count=${mapped.length}`);
    return mapped;
  }

  getPlayerName(result) {
    const candidate = result?.player_name ?? result?.playername ?? result?.['player name'];
    if (typeof candidate !== 'string') {
      return null;
    }
    const trimmed = candidate.trim();
    return trimmed ? trimmed : null;
  }

  _parseNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  getDurationSeconds(track, result, remoteMeta) {
    // LMS field names vary by endpoint/version; try common variants.
    const candidate = track?.duration
      ?? result?.duration
      ?? remoteMeta?.duration
      ?? result?.playlist_duration
      ?? result?.playlistDuration
      ?? result?.['playlist duration']
      ?? null;
    const durationSeconds = this._parseNumber(candidate);

    // Unknown or invalid durations should remain unset.
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return null;
    }
    return durationSeconds;
  }

  getPositionSeconds(result) {
    // LMS reports position seconds as "time".
    const candidate = result?.time ?? null;
    return this._parseNumber(candidate);
  }

  getShuffleMode(result) {
    // LMS reports shuffle as numeric modes (0/1/2).
    const raw = result?.playlist_shuffle ?? result?.playlistShuffle ?? result?.['playlist shuffle'];
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return Constants.LMS_SHUFFLE_OFF;
  }

  getRepeatMode(result) {
    // LMS reports repeat as numeric modes (0/1/2).
    const raw = result?.playlist_repeat ?? result?.playlistRepeat ?? result?.['playlist repeat'];
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return Constants.LMS_REPEAT_OFF;
  }

  getVolumePercent(result) {
    const raw = result?.mixer?.volume ?? result?.['mixer volume'] ?? result?.volume;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }

  _getArtworkUrl(
    track,
    remoteMeta,
    result,
    {serverScheme, serverAddress, serverPort, auth},
    {includeIcons = true} = {}
  ) {
    const baseUrl = this._buildBaseUrl(serverScheme, serverAddress, serverPort);
    const baseUrlWithAuth = this._buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    // LMS can return absolute URLs, relative paths, or icons; normalize and preserve auth.
    const candidates = [
      track?.artwork_url,
      remoteMeta?.artwork_url,
      result?.artwork_url,
    ];
    if (includeIcons) {
      candidates.push(remoteMeta?.icon, result?.icon);
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate) {
        continue;
      }
      if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
        return auth && candidate.startsWith(baseUrl)
          ? `${baseUrlWithAuth}${candidate.slice(baseUrl.length)}`
          : candidate;
      }
      if (candidate.startsWith('/')) {
        return `${baseUrlWithAuth}${candidate}`;
      }
      return `${baseUrlWithAuth}/${candidate.replace(/^\/+/, '')}`;
    }

    return null;
  }

  _buildArtworkUrl(artworkId, {serverScheme, serverAddress, serverPort, playerId, auth} = {}) {
    if (!artworkId || !playerId) {
      return null;
    }
    // LMS artwork endpoint requires both a cover id and player id.
    const safePlayer = encodeURIComponent(playerId);
    const safeArtwork = encodeURIComponent(artworkId);
    const baseUrl = this._buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    return `${baseUrl}/music/${safeArtwork}/cover.jpg?player=${safePlayer}`;
  }

  _buildCurrentArtworkUrl({serverScheme, serverAddress, serverPort, playerId, auth} = {}) {
    if (!playerId) {
      return null;
    }
    const safePlayer = encodeURIComponent(playerId);
    const baseUrl = this._buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
    return `${baseUrl}/music/current/cover.jpg?player=${safePlayer}`;
  }

  _getArtworkId(track, result, remoteMeta) {
    // Some LMS responses use 0/"0" to mean "no artwork".
    const candidates = [
      track?.artwork_track_id,
      result?.artwork_track_id,
      remoteMeta?.artwork_track_id,
      track?.coverid,
      result?.coverid,
      remoteMeta?.coverid,
    ];
    return candidates.find(id => id !== undefined && id !== null && id !== 0 && id !== '0') ?? null;
  }

  _isLikelyStreamArtworkId(artworkId) {
    if (artworkId === null || artworkId === undefined) {
      return false;
    }
    const parsed = Number(artworkId);
    return Number.isFinite(parsed) && parsed < 0;
  }

  getResolvedArtworkUrl(track, remoteMeta, result, connectionInfo) {
    const artworkUrl = this._getArtworkUrl(track, remoteMeta, result, connectionInfo, {includeIcons: false});
    if (artworkUrl) {
      return artworkUrl;
    }
    const artworkId = this._getArtworkId(track, result, remoteMeta);
    if (artworkId && !this._isLikelyStreamArtworkId(artworkId)) {
      return this._buildArtworkUrl(artworkId, connectionInfo);
    }
    const currentArtworkUrl = this._buildCurrentArtworkUrl(connectionInfo);
    if (currentArtworkUrl) {
      return currentArtworkUrl;
    }
    return this._getArtworkUrl(track, remoteMeta, result, connectionInfo, {includeIcons: true});
  }

  // buildNowPlayingUrl({serverScheme, serverAddress, serverPort, playerId, auth} = {}) {
  //   if (!serverAddress || !playerId)
  //     return null;
  //   // LMS nowplaying HTML is useful for OpenUri-capable clients.
  //   const safePlayer = encodeURIComponent(playerId);
  //   const baseUrl = this._buildBaseUrlWithAuth(serverScheme, serverAddress, serverPort, auth);
  //   return `${baseUrl}/player/${safePlayer}/nowplaying.html`;
  // }
}
