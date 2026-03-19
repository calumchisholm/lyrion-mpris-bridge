// https://lyrion.org/reference/cli/playlist/#mode
export const LmsPlayerState = Object.freeze({
  PLAY: 'play',
  STOP: 'stop',
  PAUSE: 'pause',
  MUTE: 'mute',
});

// https://lyrion.org/reference/cli/playlist/#playlist-shuffle
export const LmsShuffleMode = Object.freeze({
  OFF: 0,
  BY_SONG: 1,
  BY_ALBUM: 2,
});

// https://lyrion.org/reference/cli/playlist/#playlist-repeat
export const LmsRepeatMode = Object.freeze({
  OFF: 0,
  TRACK: 1,
  PLAYLIST: 2,
});


// https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Enum:Loop_Status
export const MprisLoopStatus = Object.freeze({
  NONE: 'None',
  TRACK: 'Track',
  PLAYLIST: 'Playlist',
});

// https://specifications.freedesktop.org/mpris/latest/Player_Interface.html#Enum:Playback_Status
export const MprisPlaybackStatus = Object.freeze({
  PLAYING: 'Playing',
  PAUSED: 'Paused',
  STOPPED: 'Stopped',
});



export const ServerScheme = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
});

export const SettingsKey = Object.freeze({
  SERVER_SCHEME: 'server-scheme',
  SERVER_ADDRESS: 'server-address',
  SERVER_PORT: 'server-port',
  SERVER_USERNAME: 'server-username',
  SERVER_PASSWORD: 'server-password',
  PLAYER_ID: 'player-id',
  POLL_INTERVAL: 'poll-interval',
  SHUFFLE_MODE: 'shuffle-mode',
  ALLOW_ARTWORK_CREDENTIALS: 'allow-artwork-credentials',
  VERBOSE_LOGGING: 'verbose-logging',
});
