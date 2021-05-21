// deno-lint-ignore-file camelcase

import sodium, { KeyPair } from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";
import * as hex from "https://deno.land/std@0.97.0/encoding/hex.ts";
import * as log from "https://deno.land/std@0.97.0/log/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.97.0/log/handlers.ts";
import { LogRecord } from "https://deno.land/std@0.97.0/log/logger.ts";
import { MatrixClient, loginRequestFromKeyPair, idFromPublicKey } from "./matrix-client.ts";
import { CreateRoomRequest, JoinRequest, LoginRequest } from "./types.ts";
import { MatrixEvent, MessageContent } from "./events.ts";
import { tick, Canceller } from "./util.ts";

interface Peer {
    id: string;
    pub: Uint8Array;
}

async function initiatorFunc(c: MatrixClient, login: LoginRequest, kp: KeyPair, peer: Peer, room: string | undefined, canceller: Canceller): Promise<string> {
    await canceller.wrap(sodium.ready);

    log.info("Login request", login.identifier);
    log.info("Logged in", { user_id: (await c.login(login)).user_id });

    const user_id = (await c.loginData).user_id;
    let roomID: string;
    if (room !== undefined) {
        roomID = room;
    } else {
        log.info("Create room", { user_id });
        const roomResponse = await canceller.wrap(c.request("POST", {
            body: {
                invite: [peer.id],
                preset: 'trusted_private_chat',
                is_direct: true
            } as CreateRoomRequest,
        }, "createRoom"));
        log.info("Room created", roomResponse, { user_id });
        roomID = roomResponse.room_id;
    }

    const msg = sodium.randombytes_buf(32);
    const signed = sodium.crypto_sign(msg, kp.privateKey);
    const body = hex.encodeToString(signed);
    log.info("Send ping message", { user_id });
    const msgID = await canceller.wrap(c.request("PUT", { body: { msgtype: "m.text", body } as MessageContent },
        "rooms/%s/send/%s/%s", roomID, "m.room.message", c.txID));
    log.info("Ping sent", msgID, { user_id });

    for await (const evt of c.events(undefined, <T>(p: Promise<T>) => canceller.wrap(p))) {
        const ev = evt as MatrixEvent;
        if (ev.type === "m.room.message" && ev.sender === peer.id) {
            log.info("Got pong", { user_id, event_id: ev.event_id });
            const msg = hex.decodeString(ev.content.body);
            sodium.crypto_sign_open(msg, peer.pub);
            break;
        }
    }
    return roomID;
}

async function responderFunc(c: MatrixClient, login: LoginRequest, kp: KeyPair, peer: Peer, room: string | undefined, canceller: Canceller) {
    await canceller.wrap(sodium.ready);

    log.info("Login request", login.identifier);
    log.info("Logged in", { user_id: (await c.login(login)).user_id });

    const user_id = (await c.loginData).user_id;
    for await (const evt of c.events(undefined, <T>(p: Promise<T>) => canceller.wrap(p))) {
        const ev = evt as MatrixEvent;
        if (room === undefined && ev.type === "m.room.member" && ev.content.membership === "invite") {
            // join the room
            log.info("Join room", { user_id });
            await canceller.wrap(c.request("POST", { body: {} as JoinRequest }, "rooms/%s/join", ev.room_id));
        }

        if (ev.type === "m.room.message" && ev.sender === peer.id) {
            log.info("Got ping", { user_id, event_id: ev.event_id });
            const msg = hex.decodeString(ev.content.body);
            sodium.crypto_sign_open(msg, peer.pub);
            const signed = sodium.crypto_sign(msg, kp.privateKey);

            // send reply
            const msgID = await canceller.wrap(c.request("PUT", { body: { msgtype: "m.text", body: hex.encodeToString(signed) } as MessageContent },
                "rooms/%s/send/%s/%s", ev.room_id, "m.room.message", c.txID));
            log.info("Pong sent", msgID, { user_id });
            return;
        }
    }
}

interface MonitorOptions {
    url: string;
    interval: number;
    timeout?: number;
}

async function matrixMonitor(opt: MonitorOptions) {
    await sodium.ready;
    const initiatorKeyPair = sodium.crypto_sign_keypair();
    const responderKeyPair = sodium.crypto_sign_keypair();
    const initiatorID = await idFromPublicKey(initiatorKeyPair.publicKey, opt.url);
    const responderID = await idFromPublicKey(responderKeyPair.publicKey, opt.url);

    let roomID: string | undefined;
    for await (const _t of tick(opt.interval, true)) {
        const canceller = new Canceller();
        if (opt.timeout) {
            setTimeout(() => {
                canceller.cancel(new Error("timeout"));
            }, opt.timeout);
        }

        log.info("Roundtrip start");
        const start = Date.now();
        try {
            const res = await Promise.all([
                initiatorFunc(new MatrixClient(opt.url), await loginRequestFromKeyPair(initiatorKeyPair), initiatorKeyPair, { id: responderID, pub: responderKeyPair.publicKey }, roomID, canceller),
                responderFunc(new MatrixClient(opt.url), await loginRequestFromKeyPair(responderKeyPair), responderKeyPair, { id: initiatorID, pub: initiatorKeyPair.publicKey }, roomID, canceller),
            ]);
            const duration = Date.now() - start;
            log.info("Roundtrip end", { duration });
            roomID = res[0];
        } catch (err) {
            canceller.cancel(err);
            log.error(err instanceof Error ? err.message : err);
        }
    }
}

// mimic a structured JSON logger
await log.setup({
    handlers: {
        default: new ConsoleHandler("INFO", {
            formatter: (r: LogRecord) => {
                const res = {
                    timestamp: r.datetime,
                    level: r.levelName,
                    msg: r.msg,
                    ...(Object.assign({}, ...r.args)),
                };
                return JSON.stringify(res);
            }
        }),
    },
});

matrixMonitor({ url: "https://matrix.papers.tech", interval: 30000 });
