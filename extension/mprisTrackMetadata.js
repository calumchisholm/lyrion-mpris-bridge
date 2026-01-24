import GLib from 'gi://GLib';

const MPRIS_TRACK_ID_PREFIX = '/org/mpris/MediaPlayer2/Track/';

// Substitutes an underscore for any value that isn't an ASCII letter, digit or underscore.
const sanitiseMprisId = value => `${value}`.replace(/[^A-Za-z0-9_]/g, '_');

export const buildMprisTrackMetadata = ({
  artist,
  title,
  album,
  trackId,
  artworkUrl,
  durationMicroseconds,
}) => {
  const metadata = {};
  if (title) {
    metadata['xesam:title'] = new GLib.Variant('s', `${title}`);
  }
  if (artist) {
    metadata['xesam:artist'] = new GLib.Variant('as', [`${artist}`]);
  }
  if (album) {
    metadata['xesam:album'] = new GLib.Variant('s', `${album}`);
  }

  const mprisTrackId = trackId
    ? `${MPRIS_TRACK_ID_PREFIX}${sanitiseMprisId(trackId)}`
    : `${MPRIS_TRACK_ID_PREFIX}0`;

  metadata['mpris:trackid'] = new GLib.Variant('o', mprisTrackId);

  if (artworkUrl) {
    metadata['mpris:artUrl'] = new GLib.Variant('s', `${artworkUrl}`);
  }
  if (Number.isFinite(durationMicroseconds)) {
    // MPRIS length in microseconds.
    metadata['mpris:length'] = new GLib.Variant('x', Math.floor(durationMicroseconds));
  }

  return {
    metadataVariant: new GLib.Variant('a{sv}', metadata),
    mprisTrackId,
  };
};
