import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const lstat = util.promisify(fs.lstat);
const unlink = util.promisify(fs.unlink);
const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);

async function makeRecursivDirectory(dir : string) : Promise<boolean> {
  let segments = dir.split(path.sep);
  let tempPath = segments[0];
  let created = false;

  if (path.isAbsolute(dir)) {
    if (segments[0] === "") {
      tempPath = "/";
    } else {
      tempPath = segments[0];
    }
    segments.shift();
  } 
  
  for (let i=0; i < segments.length; i++) {
    tempPath = path.join(tempPath, segments[i]);
    let res = await stat(tempPath).catch((e) => {
      let fsError = e as NodeJS.ErrnoException;
      if (fsError.code === "ENOENT") {
        return undefined;
      } else {
        throw e;
      }
    });
    if (!res) {
      await mkdir(tempPath);
      created = true;
    } else {
      created = false;
    }
  }
  return created;
}

async function removeDir (dir: string) {
  try {
    await lstat(dir);
  } catch (e) {
    return;
  }
  let files = await readdir(dir);
  await Promise.all(files.map(async (file) => {
    let p = path.join(dir, file);
    const stat = await lstat(p);
    if (stat.isDirectory()) {
      await removeDir(p);
    } else {
      await unlink(p);
    }
  }));
  await rmdir(dir);
}
export {makeRecursivDirectory, removeDir};