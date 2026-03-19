import * as Constants from './constants.js';

const MICROSECONDS_PER_SECOND = 1000000;

// MPRIS uses microseconds to measure durations and track positions. LMS uses seconds.
export const secondsToMicroseconds = seconds => seconds * MICROSECONDS_PER_SECOND;

export const microsecondsToSeconds = microseconds => microseconds / MICROSECONDS_PER_SECOND;

export const getPlaybackStatusFromLmsPlayerState = playbackMode => {
  switch (playbackMode) {
    case Constants.LmsPlayerState.PLAY:
      return Constants.MprisPlaybackStatus.PLAYING;
    case Constants.LmsPlayerState.PAUSE:
      return Constants.MprisPlaybackStatus.PAUSED;
    default:
      return Constants.MprisPlaybackStatus.STOPPED;
  }
};

export const getLoopStatusFromLmsRepeatMode = repeatMode => {
  switch (repeatMode) {
    case Constants.LmsRepeatMode.TRACK:
      return Constants.MprisLoopStatus.TRACK;
    case Constants.LmsRepeatMode.PLAYLIST:
      return Constants.MprisLoopStatus.PLAYLIST;
    default:
      return Constants.MprisLoopStatus.NONE;
  }
};

export const normalizeVolumePercent = volumePercent => {
  if (!Number.isFinite(volumePercent)) {
    return null;
  }
  return Math.max(0, Math.min(100, volumePercent)) / 100;
};
