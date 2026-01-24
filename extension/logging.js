const LOG_PREFIX = 'LyrionMPRIS';
let debugEnabled = false;

export const setDebugEnabled = enabled => {
  debugEnabled = enabled === true;
};

export const logDebug = message => {
  if (!debugEnabled) {
    return;
  }
  log(`${LOG_PREFIX}(debug): ${message}`);
};

export const logError = message => {
  log(`${LOG_PREFIX}(error): ${message}`);
};
