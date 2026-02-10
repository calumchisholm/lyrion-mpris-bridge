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

    const schemeOptions = [
      {id: 'http', label: _('HTTP')},
      {id: 'https', label: _('HTTPS')},
    ];
    const schemeRow = new Adw.ComboRow({
      title: _('Protocol'),
      subtitle: _('http or https'),
      model: Gtk.StringList.new(schemeOptions.map(option => option.label)),
    });
    const updateSchemeSelection = () => {
      const current = settings.get_string('server-scheme');
      const index = schemeOptions.findIndex(option => option.id === current);
      schemeRow.selected = index >= 0 ? index : 0;
      if (index < 0) {
        settings.set_string('server-scheme', schemeOptions[0].id);
      }
    };
    updateSchemeSelection();
    settings.connect('changed::server-scheme', updateSchemeSelection);
    schemeRow.connect('notify::selected', () => {
      const option = schemeOptions[schemeRow.selected] || schemeOptions[0];
      settings.set_string('server-scheme', option.id);
    });
    groupConnection.add(schemeRow);

    const rowAddress = this._createEntryRow({
      title: _('Server address'),
      subtitle: _('Hostname or IP where LMS is reachable'),
      settings,
      key: 'server-address',
    });
    groupConnection.add(rowAddress);

    const rowUsername = this._createEntryRow({
      title: _('Username'),
      subtitle: _('Optional LMS username'),
      settings,
      key: 'server-username',
    });
    groupConnection.add(rowUsername);

    const rowPassword = this._createEntryRow({
      title: _('Password'),
      subtitle: _('Optional LMS password'),
      settings,
      key: 'server-password',
      entryProps: {
        visibility: false,
        input_purpose: Gtk.InputPurpose.PASSWORD,
      },
    });
    groupConnection.add(rowPassword);

    const rowPort = new Adw.ActionRow({title: _('Port')});
    const portEntry = new Gtk.Entry({
      text: `${settings.get_int('server-port')}`,
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
      settings.set_int('server-port', Math.min(65535, Math.max(1, parsed)));
    });
    portEntry.connect('notify::has-focus', () => {
      if (!portEntry.has_focus && portEntry.text.length === 0) {
        portEntry.text = '1';
        settings.set_int('server-port', 1);
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
      adjustment: new Gtk.Adjustment({lower: 3, upper: 300, step_increment: 1, page_increment: 5, value: settings.get_int('poll-interval')}),
      numeric: true,
      valign: Gtk.Align.CENTER,
    });
    spinInterval.connect('value-changed', () => settings.set_int('poll-interval', spinInterval.get_value_as_int()));
    settings.bind('poll-interval', spinInterval, 'value', Gio.SettingsBindFlags.DEFAULT);
    rowInterval.add_suffix(spinInterval);
    rowInterval.activatable_widget = spinInterval;
    groupPlayer.add(rowInterval);

    const shuffleOptions = [
      {id: Constants.LMS_SHUFFLE_BY_SONG, label: _('Shuffle by song')},
      {id: Constants.LMS_SHUFFLE_BY_ALBUM, label: _('Shuffle by album')},
    ];
    const shuffleRow = new Adw.ComboRow({
      title: _('Shuffle mode'),
      subtitle: _('Mode used when shuffle is enabled'),
      model: Gtk.StringList.new(shuffleOptions.map(option => option.label)),
    });
    const updateShuffleSelection = () => {
      const current = settings.get_int('shuffle-mode');
      const index = shuffleOptions.findIndex(option => option.id === current);
      shuffleRow.selected = index >= 0 ? index : 0;
      if (index < 0) {
        settings.set_int('shuffle-mode', shuffleOptions[0].id);
      }
    };
    updateShuffleSelection();
    settings.connect('changed::shuffle-mode', updateShuffleSelection);
    shuffleRow.connect('notify::selected', () => {
      const option = shuffleOptions[shuffleRow.selected] || shuffleOptions[0];
      settings.set_int('shuffle-mode', option.id);
    });
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
      const selectedId = settings.get_string('player-id');
      const index = options.findIndex(option => option.id === selectedId);
      playerRow.selected = index >= 0 ? index : 0;
      updatingPlayer = false;
    };

    const refreshPlayers = async () => {
      const serverAddress = settings.get_string('server-address');
      const serverPort = settings.get_int('server-port');
      const serverScheme = settings.get_string('server-scheme');
      const serverUsername = settings.get_string('server-username');
      const serverPassword = settings.get_string('server-password');
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
      settings.set_string('player-id', selected.id ?? '');
    });

    settings.connect('changed::player-id', () => {
      if (!playerOptions.length) {
        return;
      }
      updatingPlayer = true;
      const selectedId = settings.get_string('player-id');
      const index = playerOptions.findIndex(option => option.id === selectedId);
      playerRow.selected = index >= 0 ? index : 0;
      updatingPlayer = false;
    });

    settings.connect('changed::server-address', refreshPlayers);
    settings.connect('changed::server-port', refreshPlayers);
    settings.connect('changed::server-scheme', refreshPlayers);
    settings.connect('changed::server-username', refreshPlayers);
    settings.connect('changed::server-password', refreshPlayers);
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
      active: settings.get_boolean('allow-artwork-credentials'),
      valign: Gtk.Align.CENTER,
    });
    settings.bind('allow-artwork-credentials', artworkCredentialsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
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
      active: settings.get_boolean('verbose-logging'),
      valign: Gtk.Align.CENTER,
    });
    settings.bind('verbose-logging', verboseSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
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
