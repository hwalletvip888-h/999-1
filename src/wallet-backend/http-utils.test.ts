import { EventEmitter } from "events";
import { describe, expect, it } from "vitest";
import type * as http from "http";
import { INVALID_JSON_BODY, parseBody } from "./http-utils";

describe("parseBody", () => {
  it("rejects invalid JSON with INVALID_JSON_BODY", async () => {
    const req = new EventEmitter() as http.IncomingMessage;
    const done = parseBody(req);
    req.emit("data", Buffer.from("{"));
    req.emit("end");
    await expect(done).rejects.toThrow(INVALID_JSON_BODY);
  });

  it("resolves empty object for empty body", async () => {
    const req = new EventEmitter() as http.IncomingMessage;
    const done = parseBody(req);
    req.emit("end");
    await expect(done).resolves.toEqual({});
  });
});
