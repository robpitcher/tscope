import { EventEmitter } from "events";
import * as fs from "fs";
import * as readline from "readline";
import { readJsonlFile } from "../jsonlReader";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  createReadStream: jest.fn(),
}));

jest.mock("readline", () => ({
  ...jest.requireActual("readline"),
  createInterface: jest.fn(),
}));

describe("readJsonlFile cleanup on errors", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function setupMocks() {
    const stream = new EventEmitter() as fs.ReadStream & {
      destroy: jest.Mock<void, []>;
    };
    stream.destroy = jest.fn();

    const rl = new EventEmitter() as readline.Interface & {
      close: jest.Mock<void, []>;
    };
    rl.close = jest.fn();

    (fs.createReadStream as unknown as jest.Mock).mockReturnValue(stream);
    (readline.createInterface as unknown as jest.Mock).mockReturnValue(rl);

    return { stream, rl };
  }

  test("closes readline and destroys stream on readline error", async () => {
    const { stream, rl } = setupMocks();
    const readPromise = readJsonlFile("events.jsonl", () => {});

    const err = new Error("readline failed");
    rl.emit("error", err);

    await expect(readPromise).rejects.toThrow("readline failed");
    expect(rl.close).toHaveBeenCalledTimes(1);
    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });

  test("closes readline and destroys stream on stream error", async () => {
    const { stream, rl } = setupMocks();
    const readPromise = readJsonlFile("events.jsonl", () => {});

    const err = new Error("stream failed");
    stream.emit("error", err);

    await expect(readPromise).rejects.toThrow("stream failed");
    expect(rl.close).toHaveBeenCalledTimes(1);
    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });
});
