import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Constants from './constants.js';
import {LmsApi} from './lmsApi.js';
import {logError} from './logging.js';

export default class LyrionMprisBridgePrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage({title: _('Lyrion / MPRIS Bridge')});
    window.add(page);

    const groupConnection = new Adw.PreferencesGroup({title: _('Lyrion Server')});
    page.add(groupConnection);

    const schemeOptions = Object.freeze([
      {id: Constants.ServerScheme.HTTP, label: _('HTTP')},
      {id: Constants.ServerScheme.HTTPS, label: _('HTTPS')},
    ]);
    const schemeRow = new Adw.ComboRow({
      title: _('Protocol'),
      subtitle: _('http or https'),
      model: Gtk.StringList.new(schemeOptions.map(option => option.label)),
    });
    const updateSchemeSelection = () => {
      const current = settings.get_string(Constants.SettingsKey.SERVER_SCHEME);
      const index = schemeOptions.findIndex(option => option.id === current);
      schemeRow.selected = index >= 0 ? index : 0;
      if (index < 0) {
        settings.set_string(Constants.SettingsKey.SERVER_SCHEME, schemeOptions[0].id);
      }
    };
    updateSchemeSelection();
    settings.connect(`changed::${Constants.SettingsKey.SERVER_SCHEME}`, updateSchemeSelection);
    schemeRow.connect('notify::selected', () => {
      const option = schemeOptions[schemeRow.selected] || schemeOptions[0];
      settings.set_string(Constants.SettingsKey.SERVER_SCHEME, option.id);
    });
    groupConnection.add(schemeRow);

    const rowAddress = this._createEntryRow({
      title: _('Server address'),
      subtitle: _('Hostname or IP where LMS is reachable'),
      settings,
      key: Constants.SettingsKey.SERVER_ADDRESS,
    });
    groupConnection.add(rowAddress);

    const rowUsername = this._createEntryRow({
      title: _('Username'),
      subtitle: _('Optional LMS username'),
      settings,
      key: Constants.SettingsKey.SERVER_USERNAME,
    });
    groupConnection.add(rowUsername);

    const rowPassword = this._createEntryRow({
      title: _('Password'),
      subtitle: _('Optional LMS password'),
      settings,
      key: Constants.SettingsKey.SERVER_PASSWORD,
      entryProps: {
        visibility: false,
        input_purpose: Gtk.InputPurpose.PASSWORD,
      },
    });
    groupConnection.add(rowPassword);

    const rowPort = new Adw.ActionRow({title: _('Port')});
    const portEntry = new Gtk.Entry({
      text: `${settings.get_int(Constants.SettingsKey.SERVER_PORT)}`,
      input_purpose: Gtk.InputPurpose.NUMBER,
      valign: Gtk.Align.CENTER,
      width_chars: 6,
    });
    portEntry.connect('changed', () => {
      const digits = portEntry.text.replace(/\D+/g, '');
      if (digits !== portEntry.text) {
        portEntry.text = digits;
      }
      if (digits.length === 0) {
        return;
      }
      const parsed = Number.parseInt(digits, 10);
      settings.set_int(Constants.SettingsKey.SERVER_PORT, Math.min(65535, Math.max(1, parsed)));
    });
    portEntry.connect('notify::has-focus', () => {
      if (!portEntry.has_focus && portEntry.text.length === 0) {
        portEntry.text = '1';
        settings.set_int(Constants.SettingsKey.SERVER_PORT, 1);
      }
    });
    rowPort.add_suffix(portEntry);
    rowPort.activatable_widget = portEntry;
    groupConnection.add(rowPort);

    const groupPlayer = new Adw.PreferencesGroup({title: _('Playback')});
    page.add(groupPlayer);

    const playerRow = new Adw.ComboRow({
      title: _('Player'),
      subtitle: _('Select the LMS client to monitor'),
      model: Gtk.StringList.new([_('Loading players...')]),
    });
    groupPlayer.add(playerRow);

    const rowInterval = new Adw.ActionRow({title: _('Poll interval (seconds)')});
    const spinInterval = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({lower: 3, upper: 300, step_increment: 1, page_increment: 5, value: settings.get_int(Constants.SettingsKey.POLL_INTERVAL)}),
      numeric: true,
      valign: Gtk.Align.CENTER,
    });
    spinInterval.connect('value-changed', () => settings.set_int(Constants.SettingsKey.POLL_INTERVAL, spinInterval.get_value_as_int()));
    settings.bind(Constants.SettingsKey.POLL_INTERVAL, spinInterval, 'value', Gio.SettingsBindFlags.DEFAULT);
    rowInterval.add_suffix(spinInterval);
    rowInterval.activatable_widget = spinInterval;
    groupPlayer.add(rowInterval);

    const shuffleRow = new Adw.ActionRow({
      title: _('Shuffle by album'),
      subtitle: _('When disabled, shuffle is done by track instead'),
    });
    const shuffleSwitch = new Gtk.Switch({
      active: settings.get_int(Constants.SettingsKey.SHUFFLE_MODE) === Constants.LmsShuffleMode.BY_ALBUM,
      valign: Gtk.Align.CENTER,
    });
    shuffleSwitch.connect('notify::active', () => {
      settings.set_int(
        Constants.SettingsKey.SHUFFLE_MODE,
        shuffleSwitch.active ? Constants.LmsShuffleMode.BY_ALBUM : Constants.LmsShuffleMode.BY_SONG
      );
    });
    settings.connect(`changed::${Constants.SettingsKey.SHUFFLE_MODE}`, () => {
      const active = settings.get_int(Constants.SettingsKey.SHUFFLE_MODE) === Constants.LmsShuffleMode.BY_ALBUM;
      if (shuffleSwitch.active !== active) {
        shuffleSwitch.active = active;
      }
    });
    shuffleRow.add_suffix(shuffleSwitch);
    shuffleRow.activatable_widget = shuffleSwitch;
    groupPlayer.add(shuffleRow);

    const session = new Soup.Session();
    const lmsApi = new LmsApi({session});
    let playerOptions = [];
    let updatingPlayer = false;

    const setPlayerStatus = label => {
      playerRow.model = Gtk.StringList.new([label]);
      playerRow.selected = 0;
      playerRow.sensitive = false;
      playerOptions = [];
    };

    const applyPlayerOptions = options => {
      updatingPlayer = true;
      playerOptions = options;
      playerRow.model = Gtk.StringList.new(options.map(option => option.label));
      playerRow.sensitive = options.length > 1;
      const selectedId = settings.get_string(Constants.SettingsKey.PLAYER_ID);
      const index = options.findIndex(option => option.id === selectedId);
      playerRow.selected = index >= 0 ? index : 0;
      updatingPlayer = false;
    };

    const refreshPlayers = async () => {
      const serverAddress = settings.get_string(Constants.SettingsKey.SERVER_ADDRESS);
      const serverPort = settings.get_int(Constants.SettingsKey.SERVER_PORT);
      const serverScheme = settings.get_string(Constants.SettingsKey.SERVER_SCHEME);
      const serverUsername = settings.get_string(Constants.SettingsKey.SERVER_USERNAME);
      const serverPassword = settings.get_string(Constants.SettingsKey.SERVER_PASSWORD);
      if (!serverAddress) {
        setPlayerStatus(_('Configure server first'));
        return;
      }
      setPlayerStatus(_('Loading players...'));
      try {
        const auth = (serverUsername || serverPassword)
          ? {username: serverUsername, password: serverPassword}
          : null;
        const players = await lmsApi.loadPlayers({
          serverScheme,
          serverAddress,
          serverPort,
          auth,
        });
        if (!players.length) {
          setPlayerStatus(_('No players found'));
          return;
        }
        const options = [
          {id: '', label: _('Select a player')},
          ...players.map(player => ({
            id: player.id,
            label: player.name || player.id,
          })),
        ];
        applyPlayerOptions(options);
      } catch (e) {
        logError(`failed to load LMS players: ${e}`);
        setPlayerStatus(_('Failed to load players'));
      }
    };

    playerRow.connect('notify::selected', () => {
      if (updatingPlayer || !playerOptions.length) {
        return;
      }
      const selected = playerOptions[playerRow.selected];
      if (!selected) {
        return;
      }
      settings.set_string(Constants.SettingsKey.PLAYER_ID, selected.id ?? '');
    });

    settings.connect(`changed::${Constants.SettingsKey.PLAYER_ID}`, () => {
      if (!playerOptions.length) {
        return;
      }
      updatingPlayer = true;
      const selectedId = settings.get_string(Constants.SettingsKey.PLAYER_ID);
      const index = playerOptions.findIndex(option => option.id === selectedId);
      playerRow.selected = index >= 0 ? index : 0;
      updatingPlayer = false;
    });

    settings.connect(`changed::${Constants.SettingsKey.SERVER_ADDRESS}`, refreshPlayers);
    settings.connect(`changed::${Constants.SettingsKey.SERVER_PORT}`, refreshPlayers);
    settings.connect(`changed::${Constants.SettingsKey.SERVER_SCHEME}`, refreshPlayers);
    settings.connect(`changed::${Constants.SettingsKey.SERVER_USERNAME}`, refreshPlayers);
    settings.connect(`changed::${Constants.SettingsKey.SERVER_PASSWORD}`, refreshPlayers);
    refreshPlayers();

    // OpenUri handling is disabled for now; GNOME Shell's built-in media widget never calls it.
    // const openUriOptions = [
    //   {id: 'lms', label: _('Open LMS now playing')},
    //   {id: 'provided', label: _('Open provided URI')},
    //   {id: 'auto', label: _('Provided URI or LMS fallback')},
    // ];
    // const openUriRow = new Adw.ComboRow({
    //   title: _('OpenUri behavior'),
    //   subtitle: _('Choose what happens when a client calls OpenUri'),
    //   model: Gtk.StringList.new(openUriOptions.map(option => option.label)),
    // });
    // const updateOpenUriSelection = () => {
    //   const current = settings.get_string('mpris-openuri-action');
    //   const index = openUriOptions.findIndex(option => option.id === current);
    //   openUriRow.selected = index >= 0 ? index : 0;
    // };
    // updateOpenUriSelection();
    // settings.connect('changed::mpris-openuri-action', updateOpenUriSelection);
    // openUriRow.connect('notify::selected', () => {
    //   const option = openUriOptions[openUriRow.selected] || openUriOptions[0];
    //   settings.set_string('mpris-openuri-action', option.id);
    // });
    // groupMpris.add(openUriRow);

    const groupMpris = new Adw.PreferencesGroup({title: _('MPRIS')});
    page.add(groupMpris);

    const artworkCredentialsRow = new Adw.ActionRow({
      title: _('Allow artwork URLs with credentials'),
      subtitle: _('Lets MPRIS clients load artwork that requires LMS authentication'),
    });
    const artworkCredentialsSwitch = new Gtk.Switch({
      active: settings.get_boolean(Constants.SettingsKey.ALLOW_ARTWORK_CREDENTIALS),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(Constants.SettingsKey.ALLOW_ARTWORK_CREDENTIALS, artworkCredentialsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    artworkCredentialsRow.add_suffix(artworkCredentialsSwitch);
    artworkCredentialsRow.activatable_widget = artworkCredentialsSwitch;
    groupMpris.add(artworkCredentialsRow);

    const artworkWarningRow = new Adw.ActionRow({
      title: _('Warning'),
      subtitle: _('Enabling this exposes LMS credentials to other local apps via MPRIS artwork URLs.'),
    });
    artworkWarningRow.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
    groupMpris.add(artworkWarningRow);

    const groupDiagnostics = new Adw.PreferencesGroup({title: _('Diagnostics')});
    page.add(groupDiagnostics);

    const verboseRow = new Adw.ActionRow({
      title: _('Verbose logging'),
      subtitle: _('Log extra LMS and MPRIS details'),
    });
    const verboseSwitch = new Gtk.Switch({
      active: settings.get_boolean(Constants.SettingsKey.VERBOSE_LOGGING),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(Constants.SettingsKey.VERBOSE_LOGGING, verboseSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    verboseRow.add_suffix(verboseSwitch);
    verboseRow.activatable_widget = verboseSwitch;
    groupDiagnostics.add(verboseRow);
  }

  _createEntryRow({title, subtitle, settings, key, entryProps = {}}) {
    const row = new Adw.ActionRow({title, subtitle});
    const entry = new Gtk.Entry({text: settings.get_string(key), valign: Gtk.Align.CENTER, ...entryProps});
    settings.bind(key, entry, 'text', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(entry);
    row.activatable_widget = entry;
    return row;
  }

}
