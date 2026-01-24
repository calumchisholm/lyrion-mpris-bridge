# Lyrion <--> MPRIS Bridge

A GNOME Shell extension that polls a Lyrion (Logitech Media Server) instance and bridges its Squeezebox clients to MPRIS, exposing playback state and allowing control (play/pause/skip/seek, etc.) from MPRIS clients.


## Features

- Exposes Lyrion 'now playing' metadata and transport controls to GNOME Shell media controls or any other running MPRIS clients.
- Supports play/pause, next/previous, seek, shuffle, repeat, volume and artwork.
- Polls LMS over JSON-RPC on a configurable interval.
- Preferences for server connection, player selection, shuffle mode, and diagnostics.
- Optional LMS HTTP authentication and artwork URL credentials for MPRIS clients.

Note: Although this extension exposes many of the features described in the MPRIS specification, many MPRIS clients (such as the GNOME Shell MPRIS control) do not support these in full. There are also instances where a clear 1:1 mapping between LMS and MPRIS does not exist.


## Requirements

- GNOME Shell 49.
- A reachable Lyrion/Logitech Media Server with at least one player.


## Configuration settings (extension preferences)

- **Protocol**, **Server address**, **Username**, **Password**, and **Port**: Where LMS is reachable (defaults to `http://127.0.0.1:9000`). Username and Password fields are optional, and may not be required for your LMS instance.
- **Player**: Select the LMS client to monitor. Only players currently connected to your LMS server will be listed.
- **Poll interval**: Seconds between refreshes (minimum 3s).
- **Shuffle mode**: Randomise on a per-song or per-album basis when shuffling is enabled.
- **Allow artwork URLs with credentials**: Lets MPRIS clients fetch artwork from a password-secured LMS server.


## Setup (local checkout)

1) Place the extension where GNOME Shell looks for it:
   ```bash
   EXT_DIR=~/.local/share/gnome-shell/extensions/lyrion-mpris-bridge@calumchisholm.github.io
   mkdir -p ~/.local/share/gnome-shell/extensions
   ln -s "$(pwd)/extension" "$EXT_DIR"
   ```
2) Compile the GSettings schema inside that directory:
   ```bash
   glib-compile-schemas "$EXT_DIR/schemas"
   ```
3) Reload GNOME Shell (Alt+F2, enter `r`) on X11. On Wayland, log out and log back in to restart the shell session.
4) Enable the extension from the Extensions app or
   ```bash
   gnome-extensions enable lyrion-mpris-bridge@calumchisholm.github.io
   ```


## Packaging

Build a zip for distribution:

```bash
./scripts/package.sh
```

The archive is written to `./dist/`.


## Notes

- Logs (if enabled in the extension preferences) are prefixed with `LyrionMPRIS` in the GNOME Shell log and can be queried with
  ```bash
  journalctl --user -n 100 | grep LyrionMPRIS
  ```

- GNOME Shell's built-in media control (shown under the date/time notification dropdown by default) does not implement the full MPRIS specification. For example, it does not currently support seeking, volume control or OpenUri features. This extension does expose these to any MPRIS clients that do support them however, such as [playerctl](https://github.com/altdesktop/playerctl).
- [List of open GNOME Shell issues relating to the MPRIS widget](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues?label_name[]=5.%20MPRIS%20Widget)
- Similar in concept to [slimpris2](https://github.com/mavit/slimpris2), but with a focus on user-friendliness and integration with GNOME Shell.


## MPRIS feature support

Legend: ✅ supported, ❌ not supported (or not user-visible), ⏳ planned.

| MPRIS item | This extension | GNOME Shell 49 | [Quick Settings Tweaks](https://extensions.gnome.org/extension/5446/quick-settings-tweaker/) | [playerctl](https://github.com/altdesktop/playerctl) |
| --- | --- | --- | --- | --- |
| [Track title (`xesam:title`)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Metadata) | ✅ | ✅ | ✅ | ✅ |
| [Artist (`xesam:artist`)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Metadata) | ✅ | ✅ | ✅ | ✅ |
| [Album (`xesam:album`)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Metadata) | ✅ | ❌ | ❌ | ✅ |
| [Artwork (`mpris:artUrl`)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Metadata) | ✅ | ✅ | ✅ | ✅ |
| [Track length (`mpris:length`)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Metadata) | ✅ | ❌ | ✅ | ✅ |
| [Play](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Play) | ✅ | ✅ | ✅ | ✅ |
| [Pause](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Pause) | ✅ | ✅ | ✅ | ✅ |
| [PlayPause](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:PlayPause) | ✅ | ✅ | ✅ | ✅ |
| [Stop](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Stop) | ✅ | ❌ | ❌ | ✅ |
| [Next](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Next) | ✅ | ✅ | ✅ | ✅ |
| [Previous](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Previous) | ✅ | ✅ | ✅ | ✅ |
| [Seek (relative)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:Seek) | ✅ | ❌ | ❌ | ✅ |
| [SetPosition (absolute)](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:SetPosition) | ✅ | ❌ | ✅ | ✅ |
| [OpenUri](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Method:OpenUri) | ⏳ | ❌ | ❌ | ✅ |
| [Shuffle](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Shuffle) | ✅ | ❌ | ❌ | ✅ |
| [LoopStatus](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:LoopStatus) | ✅ | ❌ | ❌ | ✅ |
| [Volume](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Property:Volume) | ✅ | ❌ | ❌ | ✅ |
| [Playlists](https://specifications.freedesktop.org/mpris/latest/Playlists_Interface.html#Interface:org.mpris.MediaPlayer2.Playlists) | ❌ | ❌ | ❌ | ❌ |


## Contributing

Well-written issue tickets and PRs are welcome. If you are reporting a bug related to MPRIS feature availability or functionality, please try to reproduce it with [`playerctl`](https://github.com/altdesktop/playerctl) to confirm it is not caused by the MPRIS client you are using.
