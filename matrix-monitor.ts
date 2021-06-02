// deno-lint-ignore-file camelcase

import sodium, { KeyPair } from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";
import * as hex from "https://deno.land/std@0.97.0/encoding/hex.ts";
import * as log from "https://deno.land/std@0.97.0/log/mod.ts";
import { MatrixClient, loginRequestFromKeyPair } from "./matrix-client.ts";
import { CreateRoomRequest, JoinRequest, LoginRequest, LoginResponse } from "./types.ts";
import { MatrixEvent, MessageContent } from "./events.ts";
import { tick, Canceller } from "./util.ts";

interface Peer {
    id: string;
    pub: Uint8Array;
}

export interface MonitorOptions {
    url: string;
    interval: number;
    timeout?: number;
}

interface HandlerOptions {
    client: MatrixClient;
    login: LoginRequest;
    loginResolve: (l: LoginResponse) => void;
    kp: KeyPair;
    peer: Promise<Peer>;
    canceller: Canceller;
}

export class MatrixMonitor {
    private room: string | undefined;
    private initiatorSeen: Record<string, unknown> = {};
    private responderSeen: Record<string, unknown> = {};

    constructor(private opt: MonitorOptions) { }

    private async initiatorFunc(o: HandlerOptions): Promise<string> {
        log.info("Login request", o.login.identifier);
        const loginResponse = await o.client.login(o.login);
        const user_id = loginResponse.user_id;
        log.info("Logged in", { user_id });
        o.loginResolve(loginResponse);

        let roomID: string;
        if (this.room !== undefined) {
            roomID = this.room;
        } else {
            log.info("Create room", { user_id });
            const roomResponse = await o.canceller.wrap(o.client.request("POST", {
                body: {
                    invite: [(await o.canceller.wrap(o.peer)).id],
                    preset: 'trusted_private_chat',
                    is_direct: true
                } as CreateRoomRequest,
            }, "createRoom"));
            log.info("Room created", roomResponse, { user_id });
            roomID = roomResponse.room_id;
        }

        const msg = sodium.randombytes_buf(32);
        const signed = sodium.crypto_sign(msg, o.kp.privateKey);
        const body = hex.encodeToString(signed);
        log.info("Send ping message", { user_id });
        const msgID = await o.canceller.wrap(o.client.request("PUT", { body: { msgtype: "m.text", body } as MessageContent },
            "rooms/%s/send/%s/%s", roomID, "m.room.message", o.client.txID));
        log.info("Ping sent", msgID, { user_id });

        for await (const evt of o.client.events(undefined, <T>(p: Promise<T>) => o.canceller.wrap(p))) {
            const ev = evt as MatrixEvent;
            if (ev.type === "m.room.message" && ev.sender === (await o.canceller.wrap(o.peer)).id) {
                log.info("Got pong", { user_id, event_id: ev.event_id });
                const msg = hex.decodeString(ev.content.body);
                sodium.crypto_sign_open(msg, (await o.canceller.wrap(o.peer)).pub);
                break;
            }
        }
        return roomID;
    }

    private async responderFunc(o: HandlerOptions) {
        log.info("Login request", o.login.identifier);
        const loginResponse = await o.client.login(o.login);
        const user_id = loginResponse.user_id;
        log.info("Logged in", { user_id });
        o.loginResolve(loginResponse);

        for await (const evt of o.client.events(undefined, <T>(p: Promise<T>) => o.canceller.wrap(p))) {
            const ev = evt as MatrixEvent;
            if (this.room === undefined && ev.type === "m.room.member" && ev.content.membership === "invite") {
                // join the room
                log.info("Join room", { user_id });
                await o.canceller.wrap(o.client.request("POST", { body: {} as JoinRequest }, "rooms/%s/join", ev.room_id));
            }

            if (ev.type === "m.room.message" && ev.sender === (await o.canceller.wrap(o.peer)).id) {
                log.info("Got ping", { user_id, event_id: ev.event_id });
                const msg = hex.decodeString(ev.content.body);
                sodium.crypto_sign_open(msg, (await o.canceller.wrap(o.peer)).pub);
                const signed = sodium.crypto_sign(msg, o.kp.privateKey);

                // send reply
                const msgID = await o.canceller.wrap(o.client.request("PUT", { body: { msgtype: "m.text", body: hex.encodeToString(signed) } as MessageContent },
                    "rooms/%s/send/%s/%s", ev.room_id, "m.room.message", o.client.txID));
                log.info("Pong sent", msgID, { user_id });
                return;
            }
        }
    }

    public async start() {
        await sodium.ready;

        const initiatorKeyPair = sodium.crypto_sign_keypair();
        const responderKeyPair = sodium.crypto_sign_keypair();

        for await (const _t of tick(this.opt.interval, true)) {
            const canceller = new Canceller();
            const to = this.opt.timeout ?
                setTimeout(() => canceller.cancel(new Error("timeout")), this.opt.timeout) :
                undefined;

            let initiatorLoginResolve: (l: LoginResponse) => void = () => { };
            const initiatorPeer = new Promise<Peer>((resolve) => initiatorLoginResolve = (l: LoginResponse) => resolve({ id: l.user_id, pub: initiatorKeyPair.publicKey }));

            let responderLoginResolve: (l: LoginResponse) => void = () => { };
            const responderPeer = new Promise<Peer>((resolve) => responderLoginResolve = (l: LoginResponse) => resolve({ id: l.user_id, pub: responderKeyPair.publicKey }));

            log.info("Roundtrip start");
            const start = Date.now();
            try {
                const res = await Promise.all([
                    this.initiatorFunc({
                        client: new MatrixClient(this.opt.url, { seen: this.initiatorSeen }),
                        login: await loginRequestFromKeyPair(initiatorKeyPair),
                        loginResolve: initiatorLoginResolve,
                        kp: initiatorKeyPair,
                        peer: responderPeer,
                        canceller
                    }),
                    this.responderFunc({
                        client: new MatrixClient(this.opt.url, { seen: this.responderSeen }),
                        login: await loginRequestFromKeyPair(responderKeyPair),
                        loginResolve: responderLoginResolve,
                        kp: responderKeyPair,
                        peer: initiatorPeer,
                        canceller
                    }),
                ]);
                const duration = Date.now() - start;
                log.info("Roundtrip end", { duration });
                this.room = res[0];
            } catch (err) {
                canceller.cancel(err);
                log.error(err instanceof Error ? err.message : err);
            } finally {
                if (to) {
                    clearTimeout(to);
                }
            }
        }
    }
}

