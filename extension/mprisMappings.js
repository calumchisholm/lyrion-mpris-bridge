import * as Constants from './constants.js';

const MICROSECONDS_PER_SECOND = 1000000;

// MPRIS uses microseconds to measure durations and track positions. LMS uses seconds.
export const secondsToMicroseconds = seconds => seconds * MICROSECONDS_PER_SECOND;

export const microsecondsToSeconds = microseconds => microseconds / MICROSECONDS_PER_SECOND;

export const getPlaybackStatusFromLmsPlayerState = playbackMode => {
  switch (playbackMode) {
    case Constants.LMS_PLAYER_STATE_PLAY:
      return Constants.MPRIS_PLAYBACK_PLAYING;
    case Constants.LMS_PLAYER_STATE_PAUSE:
      return Constants.MPRIS_PLAYBACK_PAUSED;
    default:
      return Constants.MPRIS_PLAYBACK_STOPPED;
  }
};

export const getLoopStatusFromLmsRepeatMode = repeatMode => {
  switch (repeatMode) {
    case Constants.LMS_REPEAT_TRACK:
      return Constants.MPRIS_LOOP_TRACK;
    case Constants.LMS_REPEAT_PLAYLIST:
      return Constants.MPRIS_LOOP_PLAYLIST;
    default:
      return Constants.MPRIS_LOOP_NONE;
  }
};

export const normalizeVolumePercent = volumePercent => {
  if (!Number.isFinite(volumePercent)) {
    return null;
  }
  return Math.max(0, Math.min(100, volumePercent)) / 100;
};
