/* eslint-disable no-console */
import { getSimulator } from 'appium-ios-simulator';

async function main () {
  const udid = process.argv[2];
  if (!udid) {
    console.error('Usage: get-web-inspector-socket.mjs <simulator-udid>');
    console.error('Example: npm run get-web-inspector-socket -- 8442C4CD-77B5-4764-A1F9-AABC7AD26209');
    process.exitCode = 1;
    return;
  }

  const sim = await getSimulator(udid);
  let socket;
  let error;
  try {
    socket = await sim.getWebInspectorSocket();
  } catch (err) {
    error = err;
  }
  if (!socket || error) {
    const message = 'No Web Inspector socket path for this simulator. Is it booted?';
    if (error) {
      console.error(message, error);
    } else {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }
  console.log(socket);
}

(async () => await main())();
