import { logger } from 'appium-support';
import moment from 'moment';


const FORCE_LOG_MODE = parseInt(process.env._FORCE_LOGS, 10) === 1;

const log = logger.getLogger(function () {
  if (FORCE_LOG_MODE) {
    return `${moment().format()} ${'RemoteDebugger'}`;
  } else {
    return 'RemoteDebugger';
  }
});

export default log;
