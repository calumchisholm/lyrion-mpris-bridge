const LOG_PREFIX = 'LyrionMPRIS';
let verboseEnabled = false;

const formatMessage = (level, message) => `${LOG_PREFIX}(${level}): ${message}`;

export const setVerboseEnabled = enabled => {
  verboseEnabled = enabled === true;
};

export const logDebug = message => {
  if (!verboseEnabled) {
    return;
  }
  console.log(formatMessage('debug', message));
};

export const logInfo = message => {
  console.log(formatMessage('info', message));
};

export const logWarn = message => {
  console.warn(formatMessage('warn', message));
};

export const logError = message => {
  console.error(formatMessage('error', message));
};
