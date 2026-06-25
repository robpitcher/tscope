import * as fs from "fs";
import * as readline from "readline";

export interface JsonlReadControl {
  stop: () => void;
}

/**
 * Stream non-empty JSONL lines from a file.
 *
 * Rejects when the file cannot be opened or a stream/readline error occurs.
 * Call `control.stop()` from inside `onLine` for early termination.
 */
export async function readJsonlFile(
  filePath: string,
  onLine: (trimmedLine: string, control: JsonlReadControl) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let stream: fs.ReadStream;

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const settleReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    try {
      stream = fs.createReadStream(filePath, { encoding: "utf8" });
    } catch (err) {
      settleReject(err);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const control: JsonlReadControl = {
      stop: () => {
        rl.close();
        stream.destroy();
      },
    };

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        onLine(trimmed, control);
      } catch (err) {
        settleReject(err);
        rl.close();
        stream.destroy();
      }
    });

    rl.on("close", settleResolve);
    rl.on("error", settleReject);
    stream.on("error", settleReject);
  });
}
