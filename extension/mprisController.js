import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DEFAULT_BUS_NAME = 'org.mpris.MediaPlayer2.LyrionMprisBridgePrefs';
const MPRIS_ROOT_INTERFACE = 'org.mpris.MediaPlayer2';
const MPRIS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
export const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_SUPPORTED_URI_SCHEMES = Object.freeze([]);
const MPRIS_SUPPORTED_MIME_TYPES = Object.freeze([]);
const MPRIS_ROOT_IFACE_XML = `
<node>
  <interface name="${MPRIS_ROOT_INTERFACE}">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
</node>`;

export class MprisController {
  constructor(identity) {
    this._identity = identity;
    this._connection = null;
    this._rootExport = null;
    this._nameId = Gio.DBus.own_name(
      Gio.BusType.SESSION,
      DEFAULT_BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      this._onBusAcquired.bind(this),
      null,
      null
    );
  }

  destroy() {
    if (this._rootExport) {
      this._rootExport.unexport();
      this._rootExport = null;
    }
    if (this._nameId) {
      Gio.DBus.unown_name(this._nameId);
      this._nameId = 0;
    }
    this._connection = null;
  }

  updateIdentity(identity) {
    if (!identity || identity === this._identity) {
      return;
    }
    this._identity = identity;
    this._emitRootPropertiesChanged({
      Identity: new GLib.Variant('s', this._identity),
    });
  }

  _onBusAcquired(connection) {
    this._connection = connection;
    const nodeInfo = Gio.DBusNodeInfo.new_for_xml(MPRIS_ROOT_IFACE_XML);
    const rootIface = nodeInfo.interfaces.find(iface => iface.name === MPRIS_ROOT_INTERFACE);

    this._rootExport = Gio.DBusExportedObject.wrapJSObject(rootIface, this);
    this._rootExport.export(connection, MPRIS_OBJECT_PATH);

    this._emitRootPropertiesChanged();
  }

  _emitRootPropertiesChanged(changed) {
    if (!this._connection) {
      return;
    }
    const payload = changed ?? {
      Identity: new GLib.Variant('s', this._identity),
      DesktopEntry: new GLib.Variant('s', ''),
    };
    this._emitPropertiesChanged(MPRIS_ROOT_INTERFACE, payload);
  }

  _emitPropertiesChanged(interfaceName, changed) {
    if (!this._connection) {
      return;
    }
    const signal = new GLib.Variant('(sa{sv}as)', [interfaceName, changed, []]);
    this._connection.emit_signal(
      null,
      MPRIS_OBJECT_PATH,
      MPRIS_PROPERTIES_INTERFACE,
      'PropertiesChanged',
      signal
    );
  }

  // MediaPlayer2 methods and properties
  // https://specifications.freedesktop.org/mpris/latest/Media_Player.html

  Raise() {} // Unsupported
  Quit() {}  // Unsupported

  get CanRaise() {
    return false;
  }
  get CanQuit() {
    return false;
  }
  get HasTrackList() {
    return false;
  }
  get Identity() {
    return this._identity;
  }
  get DesktopEntry() {
    return '';
  }
  get SupportedUriSchemes() {
    return MPRIS_SUPPORTED_URI_SCHEMES;
  }
  get SupportedMimeTypes() {
    return MPRIS_SUPPORTED_MIME_TYPES;
  }
}
