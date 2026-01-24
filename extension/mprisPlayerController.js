import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Constants from './constants.js';
import {logDebug} from './logging.js';
import {MprisController, MPRIS_OBJECT_PATH} from './mprisController.js';

const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const MPRIS_MINIMUM_RATE = 1.0;
const MPRIS_MAXIMUM_RATE = 1.0;
const MPRIS_PLAYER_IFACE_XML = `
<node>
  <interface name="${MPRIS_PLAYER_INTERFACE}">
    <method name="PlayPause"/>
    <method name="Play"/>
    <method name="Pause"/>
    <method name="Stop"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Seek">
      <arg name="Offset" type="x" direction="in"/>
    </method>
    <method name="SetPosition">
      <arg name="TrackId" type="o" direction="in"/>
      <arg name="Position" type="x" direction="in"/>
    </method>
    <method name="OpenUri">
      <arg name="Uri" type="s" direction="in"/>
    </method>
    <signal name="Seeked">
      <arg name="Position" type="x"/>
    </signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Position" type="x" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>`;

export class MprisPlayerController extends MprisController {
  constructor(
    identity,
    playPause,
    play,
    pause,
    stop,
    next,
    previous,
    seek,
    setPosition,
    openUri,
    shuffle,
    loopStatus,
    volume,
    rate
  ) {
    super(identity);

    this._playPause = playPause;
    this._play = play;
    this._pause = pause;
    this._stop = stop;
    this._next = next;
    this._previous = previous;
    this._seek = seek;
    this._setPosition = setPosition;
    this._openUri = openUri;
    this._shuffleHandler = shuffle;
    this._loopStatusHandler = loopStatus;
    this._volumeHandler = volume;
    this._rateHandler = rate;

    this._playbackStatus = Constants.MPRIS_PLAYBACK_STOPPED;
    this._metadataVariant = new GLib.Variant('a{sv}', {});
    this._position = 0;
    this._positionUpdatedAtUs = 0;
    this._canControl = false;
    this._canSeek = false;
    this._loopStatus = Constants.MPRIS_LOOP_NONE;
    this._shuffle = false;
    this._rate = 1.0;
    this._volume = 1.0;
    this._playerExport = null;
  }

  destroy() {
    if (this._playerExport) {
      this._playerExport.unexport();
      this._playerExport = null;
    }
    super.destroy();
  }

  _onBusAcquired(connection) {
    // Extend base export with the player interface.
    super._onBusAcquired(connection);
    const nodeInfo = Gio.DBusNodeInfo.new_for_xml(MPRIS_PLAYER_IFACE_XML);
    const playerIface = nodeInfo.interfaces.find(iface => iface.name === MPRIS_PLAYER_INTERFACE);

    this._playerExport = Gio.DBusExportedObject.wrapJSObject(playerIface, this);
    this._playerExport.export(connection, MPRIS_OBJECT_PATH);

    this._emitPlayerPropertiesChanged();
  }

  updateState({
    playbackStatus,
    metadataVariant,
    position,
    canControl,
    canSeek,
    loopStatus,
    shuffle,
    volume,
    rate,
  }) {
    const nowUs = GLib.get_monotonic_time();
    const priorStatus = this._playbackStatus;
    if (playbackStatus && playbackStatus !== priorStatus) {
      this._position = this._calculatePosition(nowUs, priorStatus);
      this._positionUpdatedAtUs = nowUs;
    }
    if (playbackStatus) {
      this._playbackStatus = playbackStatus;
    }
    if (metadataVariant) {
      this._metadataVariant = metadataVariant;
    }
    if (loopStatus) {
      this._loopStatus = loopStatus;
    }
    if (typeof shuffle === 'boolean') {
      this._shuffle = shuffle;
    }
    if (typeof position === 'number') {
      this._position = position;
      this._positionUpdatedAtUs = nowUs;
    }
    if (typeof rate === 'number') {
      this._position = this._calculatePosition(nowUs, this._playbackStatus);
      this._positionUpdatedAtUs = nowUs;
      this._rate = rate;
    }
    if (typeof volume === 'number') {
      this._volume = volume;
    }
    if (typeof canSeek === 'boolean') {
      this._canSeek = canSeek;
    }
    if (typeof canControl === 'boolean') {
      this._canControl = canControl;
    }
    this._emitPlayerPropertiesChanged();
  }

  _emitPlayerPropertiesChanged() {
    if (!this._connection) {
      return;
    }
    const positionUs = this._calculatePosition(GLib.get_monotonic_time(), this._playbackStatus);
    const canControl = this._canControl;
    const canSeek = this._canSeek;
    const changed = {
      PlaybackStatus: new GLib.Variant('s', this._playbackStatus),
      Metadata: this._metadataVariant,
      Position: new GLib.Variant('x', positionUs),
      LoopStatus: new GLib.Variant('s', this._loopStatus),
      Shuffle: new GLib.Variant('b', this._shuffle),
      Rate: new GLib.Variant('d', this._rate),
      MinimumRate: new GLib.Variant('d', MPRIS_MINIMUM_RATE),
      MaximumRate: new GLib.Variant('d', MPRIS_MAXIMUM_RATE),
      Volume: new GLib.Variant('d', this._volume),
      CanGoNext: new GLib.Variant('b', canControl),
      CanGoPrevious: new GLib.Variant('b', canControl),
      CanPlay: new GLib.Variant('b', canControl),
      CanPause: new GLib.Variant('b', canControl),
      CanSeek: new GLib.Variant('b', canSeek),
      CanControl: new GLib.Variant('b', canControl),
    };
    this._emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, changed);
  }

  // MediaPlayer2.Player methods and properties
  // https://specifications.freedesktop.org/mpris/latest/Player_Interface.html

  PlayPause() {
    logDebug('MPRIS PlayPause');
    this._playPause?.();
  }
  Play() {
    logDebug('MPRIS Play');
    this._play?.();
  }
  Pause() {
    logDebug('MPRIS Pause');
    this._pause?.();
  }
  Stop() {
    logDebug('MPRIS Stop');
    this._stop?.();
  }
  Next() {
    logDebug('MPRIS Next');
    this._next?.();
  }
  Previous() {
    logDebug('MPRIS Previous');
    this._previous?.();
  }
  Seek(offset) {
    logDebug(`MPRIS Seek offset=${offset}`);
    this._seek?.(offset);
  }
  SetPosition(trackId, position) {
    logDebug(`MPRIS SetPosition trackId=${trackId} position=${position}`);
    this._setPosition?.(trackId, position);
  }
  OpenUri(uri) {
    logDebug(`MPRIS OpenUri uri=${uri}`);
    this._openUri?.(uri);
  }

  _calculatePosition(nowUs, status) {
    if (status !== Constants.MPRIS_PLAYBACK_PLAYING) {
      return this._position;
    }
    if (!Number.isFinite(this._positionUpdatedAtUs) || this._positionUpdatedAtUs <= 0) {
      return this._position;
    }
    const elapsed = Math.max(0, nowUs - this._positionUpdatedAtUs);
    const adjusted = this._position + Math.floor(elapsed * this._rate);
    return adjusted;
  }

  emitSeeked(position) {
    if (!this._connection) {
      return;
    }
    logDebug(`MPRIS Seeked position=${position}`);
    const signal = new GLib.Variant('(x)', [position]);
    this._connection.emit_signal(
      null,
      MPRIS_OBJECT_PATH,
      MPRIS_PLAYER_INTERFACE,
      'Seeked',
      signal
    );
  }

  get PlaybackStatus() {
    return this._playbackStatus;
  }
  get Metadata() {
    return this._metadataVariant;
  }
  get Position() {
    return this._calculatePosition(GLib.get_monotonic_time(), this._playbackStatus);
  }
  get LoopStatus() {
    return this._loopStatus;
  }
  set LoopStatus(value) {
    if (value !== Constants.MPRIS_LOOP_NONE &&
        value !== Constants.MPRIS_LOOP_TRACK &&
        value !== Constants.MPRIS_LOOP_PLAYLIST) {
      return;
    }
    this._loopStatus = value;
    logDebug(`MPRIS LoopStatus=${value}`);
    this._loopStatusHandler?.(value);
    this._emitPlayerPropertiesChanged();
  }
  get Shuffle() {
    return this._shuffle;
  }
  set Shuffle(value) {
    const next = !!value;
    this._shuffle = next;
    logDebug(`MPRIS Shuffle=${next}`);
    this._shuffleHandler?.(next);
    this._emitPlayerPropertiesChanged();
  }
  get Rate() {
    return this._rate;
  }
  set Rate(value) {
    logDebug(`MPRIS Rate ignored value=${value}`);
  }
  get MinimumRate() {
    return MPRIS_MINIMUM_RATE;
  }
  get MaximumRate() {
    return MPRIS_MAXIMUM_RATE;
  }
  get Volume() {
    return this._volume;
  }
  set Volume(value) {
    if (!Number.isFinite(value)) {
      return;
    }
    const next = Math.max(0, Math.min(1, value));
    this._volume = next;
    logDebug(`MPRIS Volume=${next}`);
    this._volumeHandler?.(next);
    this._emitPlayerPropertiesChanged();
  }
  get CanGoNext() {
    return this._canControl;
  }
  get CanGoPrevious() {
    return this._canControl;
  }
  get CanPlay() {
    return this._canControl;
  }
  get CanPause() {
    return this._canControl;
  }
  get CanSeek() {
    return this._canSeek;
  }
  get CanControl() {
    return this._canControl;
  }
}
