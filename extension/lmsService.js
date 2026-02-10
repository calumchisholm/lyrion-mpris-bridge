import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {logInfo, logDebug, logError, setVerboseEnabled} from './logging.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Constants from './constants.js';
import {LmsApi} from './lmsApi.js';
import {MprisPlayerController} from './mprisPlayerController.js';
import {buildMprisTrackMetadata} from './mprisTrackMetadata.js';
import {
  getPlaybackStatusFromLmsPlayerState,
  getLoopStatusFromLmsRepeatMode,
  secondsToMicroseconds,
  microsecondsToSeconds,
  normalizeVolumePercent,
} from './mprisMappings.js';

const getAuthFromSettings = settings => {
  const username = settings.get_string('server-username');
  const password = settings.get_string('server-password');
  if (!username && !password) {
    return null;
  }
  return {username, password};
};

const getConnectionInfo = settings => ({
  serverScheme: settings.get_string('server-scheme'),
  serverAddress: settings.get_string('server-address'),
  serverPort: settings.get_int('server-port'),
  playerId: settings.get_string('player-id'),
  auth: getAuthFromSettings(settings),
});

const sendPlayerCommandFromSettings = (lmsApi, settings, commandArray) => {
  const {serverScheme, serverAddress, serverPort, playerId, auth} = getConnectionInfo(settings);
  if (!serverAddress || !playerId) {
    return;
  }
  return lmsApi.sendPlayerCommand({
    serverScheme,
    serverAddress,
    serverPort,
    playerId,
    auth,
    commandArray,
  });
};

// LMS status tags: a=artist, l=album, c=cover id, o=track URL, J=artwork URL, t=title, j=artwork track id, d=duration.
const DEFAULT_STATUS_REQUEST = ['status', '-', 1, 'tags:alcoJtjd'];
const DEFAULT_MPRIS_IDENTITY = 'Lyrion Now Playing';

export class LmsService {
  constructor(settings) {
    this._settings = settings;
    this._session = new Soup.Session();
    this._pollId = 0;
    this._requestId = 0;
    this._pollInFlight = false;
    this._pollPending = false;
    this._currentMprisTrackId = null;
    this._currentPositionSeconds = null;
    this._verboseLogging = this._settings.get_boolean('verbose-logging');
    setVerboseEnabled(this._verboseLogging);
    logInfo('Lyrion MPRIS bridge starting');
    this._lms = new LmsApi({
      session: this._session,
    });
    this._mpris = new MprisPlayerController(
      DEFAULT_MPRIS_IDENTITY,
      () => this._togglePlayPause(),
      () => sendPlayerCommandFromSettings(this._lms, this._settings, ['play']),
      () => sendPlayerCommandFromSettings(this._lms, this._settings, ['pause', 1]),
      () => sendPlayerCommandFromSettings(this._lms, this._settings, ['stop']),
      () => sendPlayerCommandFromSettings(this._lms, this._settings, ['playlist', 'jump', '+1']),
      () => sendPlayerCommandFromSettings(this._lms, this._settings, ['playlist', 'jump', '-1']),
      offset => this._seekRelative(offset),
      (trackId, position) => this._setPosition(trackId, position),
      // OpenUri handling is disabled for now; GNOME Shell doesn't call it.
      // uri => this._handleOpenUri(uri),
      undefined,
      value => this._setShuffle(value),
      value => this._setLoopStatus(value),
      value => this._setVolume(value),
      value => this._setRate(value)
    );

    this._settingsChangedIds = [
      this._settings.connect('changed::server-address', () => this._restartPolling()),
      this._settings.connect('changed::server-port', () => this._restartPolling()),
      this._settings.connect('changed::server-scheme', () => this._restartPolling()),
      this._settings.connect('changed::server-username', () => this._restartPolling()),
      this._settings.connect('changed::server-password', () => this._restartPolling()),
      this._settings.connect('changed::player-id', () => this._restartPolling()),
      this._settings.connect('changed::poll-interval', () => this._restartPolling()),
    ];
    this._settingsChangedIds.push(
      this._settings.connect('changed::verbose-logging', () => {
        this._verboseLogging = this._settings.get_boolean('verbose-logging');
        setVerboseEnabled(this._verboseLogging);
        if (this._verboseLogging) {
          logInfo('verbose logging enabled');
        }
      })
    );

    this._restartPolling();
  }

  destroy() {
    this._stopPolling();
    if (this._session) {
      this._session.abort();
      this._session = null;
    }
    if (this._mpris) {
      this._mpris.destroy();
      this._mpris = null;
    }
    for (const id of this._settingsChangedIds) {
      this._settings.disconnect(id);
    }
    this._settingsChangedIds = [];
    setVerboseEnabled(false);
  }

  _restartPolling() {
    this._stopPolling();
    this._refresh();
    const interval = this._settings.get_int('poll-interval');
    this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
      this._refresh();
      return GLib.SOURCE_CONTINUE;
    });
  }

  _stopPolling() {
    if (this._pollId) {
      GLib.source_remove(this._pollId);
      this._pollId = 0;
    }
  }

  _refresh() {
    if (this._pollInFlight) {
      this._pollPending = true;
      return;
    }

    const {
      serverScheme,
      serverAddress,
      serverPort,
      playerId,
      auth,
    } = getConnectionInfo(this._settings);

    if (!serverAddress || !playerId) {
      const metadataVariant = new GLib.Variant('a{sv}', {
        'mpris:trackid': new GLib.Variant('o', '/org/mpris/MediaPlayer2/Track/NoTrack'),
      });
      this._mpris?.updateIdentity(DEFAULT_MPRIS_IDENTITY);
      this._mpris?.updateState({
        playbackStatus: Constants.MPRIS_PLAYBACK_STOPPED,
        metadataVariant,
        position: 0,
        loopStatus: Constants.MPRIS_LOOP_NONE,
        shuffle: false,
        rate: 1.0,
        volume: 1.0,
        canSeek: false,
        canControl: false,
      });
      return;
    }

    this._pollInFlight = true;
    const requestId = ++this._requestId;
    logDebug(`LMS refresh requestId=${requestId} playerId=${playerId} server=${serverScheme}://${serverAddress}:${serverPort}`);
    this._lms.fetchStatus({
      serverScheme,
      serverAddress,
      serverPort,
      auth,
      playerId,
      request: DEFAULT_STATUS_REQUEST,
    })
    .then(status => {
      if (requestId !== this._requestId) {
        return;
      }
      this._updateMpris(status, {serverScheme, serverAddress, serverPort, playerId, auth});
    })
    .catch(err => {
      if (requestId !== this._requestId) {
        return;
      }
      logError(`LMS status fetch failed: ${err}`);
      const metadataVariant = new GLib.Variant('a{sv}', {
        'mpris:trackid': new GLib.Variant('o', '/org/mpris/MediaPlayer2/Track/NoTrack'),
      });
      this._mpris?.updateState({
        playbackStatus: Constants.MPRIS_PLAYBACK_STOPPED,
        metadataVariant,
        position: 0,
        loopStatus: Constants.MPRIS_LOOP_NONE,
        shuffle: false,
        rate: 1.0,
        volume: 1.0,
        canSeek: false,
        canControl: false,
      });
    })
    .finally(() => {
      this._pollInFlight = false;
      if (this._pollPending) {
        this._pollPending = false;
        this._refresh();
      }
    });
  }

  _updateMpris(result, connectionInfo) {
    if (!this._mpris) {
      return;
    }

    this._mpris.updateIdentity(this._lms.getPlayerName(result) || DEFAULT_MPRIS_IDENTITY);

    const track = result?.playlist_loop?.[0];
    const remoteMeta = result?.remoteMeta;
    const artist = track?.artist || remoteMeta?.artist || result?.artist || _('Unknown artist');
    const title = track?.title || remoteMeta?.title || result?.title || _('Unknown track');
    const album = track?.album || remoteMeta?.album || result?.album;
    const trackId = track?.id ?? result?.id ?? null;
    const allowArtworkCredentials = this._settings.get_boolean('allow-artwork-credentials');
    const artworkConnectionInfo = {
      ...connectionInfo,
      auth: allowArtworkCredentials ? connectionInfo?.auth : null,
    };
    const artworkUrl = this._lms.getResolvedArtworkUrl(track, remoteMeta, result, artworkConnectionInfo);
    const durationSeconds = this._lms.getDurationSeconds(track, result, remoteMeta);
    const durationMicroseconds = Number.isFinite(durationSeconds)
      ? secondsToMicroseconds(durationSeconds)
      : null;

    const metadataResult = buildMprisTrackMetadata({
      artist,
      title,
      album,
      trackId,
      artworkUrl,
      durationMicroseconds,
    });
    this._currentMprisTrackId = metadataResult.mprisTrackId;

    // MPRIS expects microseconds.
    const positionSeconds = this._lms.getPositionSeconds(result);
    let position = Number.isFinite(positionSeconds)
      ? Math.floor(secondsToMicroseconds(positionSeconds))
      : 0;
    const playbackStatus = getPlaybackStatusFromLmsPlayerState(result?.mode);
    const loopStatus = getLoopStatusFromLmsRepeatMode(this._lms.getRepeatMode(result));
    const shuffle = this._lms.getShuffleMode(result) !== Constants.LMS_SHUFFLE_OFF;
    const volume = normalizeVolumePercent(this._lms.getVolumePercent(result));
    const canSeek = Number.isFinite(durationSeconds) && durationSeconds > 0;
    if (playbackStatus === Constants.MPRIS_PLAYBACK_PLAYING && canSeek && position <= 0) {
      // Some clients ignore zero position while playing; bump to a tiny non-zero value.
      position = 1;
    }
    this._currentPositionSeconds = microsecondsToSeconds(position);
    logDebug(`MPRIS update duration=${Number.isFinite(durationSeconds) ? durationSeconds : 'unknown'} position=${positionSeconds} canSeek=${canSeek}`);
    logDebug(`MPRIS state status=${playbackStatus} trackId=${trackId} posUs=${position} loop=${loopStatus} shuffle=${shuffle} volume=${volume}`);
    this._mpris.updateState({
      playbackStatus,
      metadataVariant: metadataResult.metadataVariant,
      position,
      loopStatus,
      shuffle,
      rate: 1.0,
      volume,
      canSeek,
      canControl: true,
    });
  }

  _setShuffle(value) {
    const enabled = !!value;
    logInfo(`LMS set shuffle=${enabled}`);
    const preferredMode = this._settings.get_int('shuffle-mode');
    const shuffleMode = preferredMode === Constants.LMS_SHUFFLE_BY_ALBUM ? Constants.LMS_SHUFFLE_BY_ALBUM : Constants.LMS_SHUFFLE_BY_SONG;
    sendPlayerCommandFromSettings(this._lms, this._settings, ['playlist', 'shuffle', enabled ? shuffleMode : Constants.LMS_SHUFFLE_OFF]);
  }

  _setLoopStatus(value) {
    let mode = Constants.LMS_REPEAT_OFF;
    if (value === Constants.MPRIS_LOOP_TRACK) {
      mode = Constants.LMS_REPEAT_TRACK;
    } else if (value === Constants.MPRIS_LOOP_PLAYLIST) {
      mode = Constants.LMS_REPEAT_PLAYLIST;
    }
    logInfo(`LMS set repeat=${mode}`);
    sendPlayerCommandFromSettings(this._lms, this._settings, ['playlist', 'repeat', mode]);
  }

  _setVolume(value) {
    if (!Number.isFinite(value)) {
      return;
    }
    const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
    logInfo(`LMS set volume=${percent}`);
    sendPlayerCommandFromSettings(this._lms, this._settings, ['mixer', 'volume', percent]);
  }

  _setRate(_value) {
    // LMS does not support playback rate changes; keep at 1.0.
  }

  _seekRelative(offset) {
    if (!Number.isFinite(offset)) {
      return;
    }
    // LMS uses seconds; MPRIS uses microseconds with a signed offset.
    const seconds = Math.round(microsecondsToSeconds(offset));
    if (!seconds) {
      return;
    }
    logInfo(`LMS seek relative seconds=${seconds}`);
    const formatted = `${seconds >= 0 ? '+' : ''}${seconds}`;
    sendPlayerCommandFromSettings(this._lms, this._settings, ['time', formatted]);
    const nextPosition = Number.isFinite(this._currentPositionSeconds)
      ? Math.max(0, Math.round(this._currentPositionSeconds + seconds))
      : null;
    if (Number.isFinite(nextPosition)) {
      this._currentPositionSeconds = nextPosition;
    }
    if (this._mpris && Number.isFinite(nextPosition)) {
      const position = Math.floor(secondsToMicroseconds(nextPosition));
      this._mpris.updateState({position});
      this._mpris.emitSeeked(position);
    }
  }

  _setPosition(trackId, position) {
    if (!Number.isFinite(position)) {
      return;
    }
    // Ignore stale SetPosition calls from a previous track.
    if (this._currentMprisTrackId && trackId !== this._currentMprisTrackId) {
      logDebug(`LMS SetPosition ignored trackId=${trackId} current=${this._currentMprisTrackId}`);
      return;
    }
    const seconds = Math.max(0, Math.floor(microsecondsToSeconds(position)));
    logInfo(`LMS set position seconds=${seconds}`);
    sendPlayerCommandFromSettings(this._lms, this._settings, ['time', seconds]);
    if (Number.isFinite(seconds)) {
      this._currentPositionSeconds = seconds;
    }
    if (this._mpris) {
      const positionUs = Math.floor(secondsToMicroseconds(seconds));
      this._mpris.updateState({position: positionUs});
      this._mpris.emitSeeked(positionUs);
    }
  }

  _handleOpenUri(uri) {
    // OpenUri handling is disabled for now; GNOME Shell doesn't call it.
    // const behavior = this._settings.get_string('mpris-openuri-action');
    // const trimmedUri = `${uri || ''}`.trim();
    // logDebug(`OpenUri behavior=${behavior} uri=${trimmedUri}`);
    // if (behavior === 'provided') {
    //   if (trimmedUri)
    //     this._openUri(trimmedUri);
    //   return;
    // }
    // if (behavior === 'auto' && trimmedUri) {
    //   this._openUri(trimmedUri);
    //   return;
    // }
    // this._openNowPlayingUrl();
  }

  _openNowPlayingUrl() {
    // OpenUri handling is disabled for now; keep helpers for quick re-enable.
    // const {serverScheme, serverAddress, serverPort, playerId, auth} = getConnectionInfo(this._settings);
    // const url = this._lms.buildNowPlayingUrl({serverScheme, serverAddress, serverPort, playerId, auth});
    // if (!url)
    //   return;
    // this._openUri(url);
  }

  _openUri(uri) {
    // OpenUri handling is disabled for now; keep helpers for quick re-enable.
    // try {
    //   Gio.AppInfo.launch_default_for_uri(uri, null);
    // } catch (e) {
    //   logDebug(`failed to open URI ${uri}: ${e}`);
    // }
  }

  async _togglePlayPause() {
    const playerId = this._settings.get_string('player-id');
    if (!playerId) {
      return;
    }
    try {
      await sendPlayerCommandFromSettings(this._lms, this._settings, ['pause']);
      this._refresh();
    } catch (e) {
      logError(`failed to toggle play/pause: ${e}`);
    }
  }
}
