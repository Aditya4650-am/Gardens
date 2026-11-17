// Gardenscapes server-side ADB transport helpers.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const ADB_PATH = "C:\\Program Files\\Microvirt\\MEmu\\adb.exe";
export const ADB_DEVICE = "127.0.0.1:21503";
export const GAME_PACKAGE = "com.playrix.gardenscapes";
export const SAVE_FILENAME = "GameData.db";
export const SAVE_REMOTE_PATH = `/data/data/${GAME_PACKAGE}/Documents/${SAVE_FILENAME}`;

export async function adbRun(args: string[], serial: string = ADB_DEVICE): Promise<string> {
  const res = await execFileP(ADB_PATH, ["-s", serial, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  return res.stdout;
}

export async function adbPull(remotePath: string, localPath: string, serial: string = ADB_DEVICE): Promise<void> {
  await adbRun(["pull", remotePath, localPath], serial);
}

export async function adbPush(localPath: string, remotePath: string, serial: string = ADB_DEVICE): Promise<void> {
  await adbRun(["push", localPath, remotePath], serial);
}
