/* eslint-disable no-console */
import { SubProcess } from 'teen_process';
import { plist, util } from '@appium/support';
import { asyncify } from 'asyncbox';
import B from 'bluebird';
import { getSimulator } from 'appium-ios-simulator';
import _ from 'lodash';


async function getSocket (udid) {
  const sim = await getSimulator(udid);
  return await sim.getWebInspectorSocket();
}

function printRecord (lines) {
  const header = lines.shift();
  console.log(header);

  const START = '62 70 6c 69 73 74';

  lines = lines.join(' ');
  while (lines.length) {
    let end = lines.indexOf(START, 29);
    if (end === -1) {
      end = lines.length;
    } else {
      end = end - 12;
    }
    const str = lines.slice(0, end);
    lines = lines.slice(end);
    let arr = str
      .trim()
      .replace(/(\r\n|\n|\r)/gm, ' ')
      .split(' ')
      .map((str) => str.trim())
      .filter((str) => str !== '');

    arr = arr.slice(4);
    const data = arr
      .map((str) => parseInt(str, 16));
    if (data.length === 0) {
      console.log('no data');
      return;
    }
    const buf = Buffer.from(data);
    try {
      const doc = plist.parsePlist(buf);
      console.log(util.jsonStringify(doc));
    } catch (err) {
      if (err.message.includes('maxObjectCount exceeded')) {
        return str;
      }
      console.log('ERROR:', err.message);
    }
  }
  return '';
}

async function startSoCat (socket) {
  const cmd = 'socat';
  const args = [
    '-t100',
    '-x', `UNIX-LISTEN:${socket},mode=777,reuseaddr,fork`, `UNIX-CONNECT:${socket}.original`];
  const proc = new SubProcess(cmd, args);

  let buffer = [];
  proc.on('lines-stderr', (lines) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('>') || line.startsWith('<')) {
        if (buffer.length) {
          const remainder = printRecord(buffer);

          // save the header, and go forward
          buffer = [line];
          if (remainder) {
            buffer.push(remainder);
          }
          continue;
        }
      }
      // add the line to the buffer
      buffer.push(line);
    }
  });

  const prom = new B(function (resolve) {
    proc.on('exit', function () {
      resolve('done');
    });
  });

  await proc.start();

  return prom;
}

async function main () {
  const udid = _.last(process.argv);
  const s = await getSocket(udid);
  console.log('Simulator web inspector socket:', s);
  await startSoCat(s);
}

asyncify(main);
