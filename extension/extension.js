// Lyrion / MPRIS controller GNOME Shell extension
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {LmsService} from './lmsService.js';

export default class LyrionMprisBridgeExtension extends Extension {
  enable() {
    this._settings = this.getSettings();

    this._service = new LmsService(this._settings);
  }

  disable() {
    if (this._service) {
      this._service.destroy();
      this._service = null;
    }

    this._settings = null;
  }
}
