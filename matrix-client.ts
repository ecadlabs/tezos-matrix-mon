// deno-lint-ignore-file camelcase

import { sprintf } from "https://deno.land/std@0.97.0/fmt/printf.ts";
import * as hex from "https://deno.land/std@0.97.0/encoding/hex.ts";
import {
    CreateRoomRequest, EventID, InviteRequest, JoinRequest, JoinResponse, LoginRequest,
    LoginResponse, MatrixError, SyncRequest, SyncResponse,
} from "./types.ts";
import { MessageContent, Event, RoomEvent } from "./events.ts";

import sodium, { KeyPair } from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";

// see https://github.com/airgap-it/beacon-node/blob/master/docker/crypto_auth_provider.py
export async function loginRequestFromKeyPair(kp: KeyPair): Promise<LoginRequest> {
    await sodium.ready;
    const enquiry = sodium.from_string(`login:${Math.floor(Date.now() / 1000 / (5 * 60))}`);
    const digest = sodium.crypto_generichash(32, enquiry);
    const sig = sodium.crypto_sign_detached(digest, kp.privateKey);
    const keyHash = sodium.crypto_generichash(32, kp.publicKey);

    return {
        type: "m.login.password",
        identifier: {
            type: "m.id.user",
            user: hex.encodeToString(keyHash),
        },
        password: `ed:${hex.encodeToString(sig)}:${hex.encodeToString(kp.publicKey)}`,
        device_id: hex.encodeToString(kp.publicKey),
    };
}

export async function idFromPublicKey(pk: Uint8Array, url: string): Promise<string> {
    await sodium.ready;
    const keyHash = sodium.crypto_generichash(32, pk);
    return `@${hex.encodeToString(keyHash)}:${new URL(url).hostname}`
}

const APIPrefix = "/_matrix/client/r0/";

function buildOptions(opt: unknown): string {
    const enc = (val: unknown) => encodeURIComponent((typeof val !== "object" || val === null) ? String(val) : JSON.stringify(val));
    if (typeof opt !== "object" || opt === null) {
        return enc(opt);
    }
    const elt: string[] = [];
    for (const key of Object.keys(opt).sort()) {
        const val = (opt as Record<string, unknown>)[key];
        const vals = Array.isArray(val) ? val as unknown[] : [val];
        for (const v of vals) {
            if (v !== undefined) {
                elt.push(enc(key) + "=" + enc(v));
            }
        }
    }
    return elt.join("&");
}

class HTTPError extends Error {
    constructor(public request: Request, public response: Response, public error: MatrixError) {
        super(response.statusText);
        Object.setPrototypeOf(this, HTTPError.prototype);
    }
}

interface RequestOptions {
    query?: unknown;
    body?: unknown;
    noAuth?: boolean;
    init?: RequestInit;
}

class HTTPMatrixClient {
    private setToken: (token: string) => void = () => undefined;
    private token = new Promise<string>((resolve) => { this.setToken = resolve });

    constructor(private url: string) { }

    public setAuthToken(token: string) {
        this.setToken(token);
    }

    public async request(method: "POST", options: { body: LoginRequest, noAuth: true, init?: RequestInit }, ep: "login"): Promise<LoginResponse>;
    public async request(method: "GET", options: { query: SyncRequest, init?: RequestInit }, ep: "sync"): Promise<SyncResponse>;
    public async request(method: "POST", options: { body: CreateRoomRequest, init?: RequestInit }, ep: "createRoom"): Promise<JoinResponse>;
    public async request(method: "POST", options: { body: InviteRequest, init?: RequestInit }, ep: "rooms/%s/invite", ...args: [string]): Promise<void>;
    public async request(method: "POST", options: { body: JoinRequest, init?: RequestInit }, ep: "rooms/%s/join", ...args: [string]): Promise<JoinResponse>;
    public async request(method: "PUT", options: { body: MessageContent, init?: RequestInit }, ep: "rooms/%s/send/%s/%s", ...args: [string, string, string]): Promise<EventID>;
    public async request(method: string, options: RequestOptions, ep: string, ...args: unknown[]): Promise<unknown> {
        const optstr = options?.query !== undefined ? buildOptions(options.query) : "";
        const url = `${this.url}${APIPrefix}${sprintf(ep, ...args.map(a => encodeURIComponent(String(a))))}${(optstr !== "" ? "?" + optstr : "")}`;
        const headers = new Headers(options?.init?.headers);
        const reqInit = { ...options?.init, method, headers };

        if (!options?.noAuth) {
            headers.set("Authorization", "Bearer " + await this.token);
        }

        if (options?.body !== undefined && options?.body !== null) {
            headers.set("Content-Type", "application/json");
            reqInit.body = JSON.stringify(options.body);
        }

        const req = new Request(url, reqInit);
        const res = await fetch(req);
        if (!res.ok) {
            try {
                const j = await res.json();
                throw new HTTPError(req, res, j);
            } catch (_err) {
                // JSON error
                throw new Error(res.statusText);
            }
        }

        return res.json();
    }
}

export interface MatrixClientOptions {
    pollTimeout?: number;
    seen?: Record<string, unknown>;
}

const DefaultTimeout = 30000;

export class MatrixClient extends HTTPMatrixClient {
    private setLoginData: (data: LoginResponse) => void = () => undefined;
    public loginData = new Promise<LoginResponse>((resolve) => { this.setLoginData = resolve });

    constructor(url: string, private opt?: MatrixClientOptions) {
        super(url);
    }

    public async login(login: LoginRequest, init?: RequestInit): Promise<LoginResponse> {
        const res = await this.request("POST", { body: login, noAuth: true, init }, "login");
        this.setLoginData(res);
        this.setAuthToken(res.access_token);
        return res;
    }

    private txcnt = 0;
    get txID(): string {
        return `${new Date().getTime()}-${this.txcnt++}`;
    }

    private isUnique(id?: string): boolean {
        if (id === undefined || this.opt?.seen === undefined) {
            return true;
        }
        if (id in this.opt.seen) {
            return false;
        }
        this.opt.seen[id] = {};
        return true;
    }

    // transform sync replies into a single stream of events
    public async *events(timeout: number = this.opt?.pollTimeout || DefaultTimeout, cancel: <T>(p: Promise<T>) => Promise<T> = (p) => p, init?: RequestInit): AsyncGenerator<Event> {
        let since: string | undefined = undefined;
        while (true) {
            const res: SyncResponse = await cancel(this.request("GET", { query: { timeout, since } as SyncRequest, init }, "sync"));
            since = res.next_batch;

            for (const ev of [
                ...(res.account_data?.events || []),
                ...(res.to_device?.events || []),
                ...(res.presence?.events || []),
            ]) {
                yield ev;
            }

            if (res.rooms === undefined) {
                continue;
            }

            if (res.rooms.invite !== undefined) {
                for (const [room_id, data] of Object.entries(res.rooms.invite)) {
                    for (const ev of data.invite_state.events) {
                        if (this.isUnique(ev.event_id)) {
                            yield { ...ev, room_id } as RoomEvent;
                        }
                    }
                }
            }

            if (res.rooms.join !== undefined) {
                for (const [room_id, data] of Object.entries(res.rooms.join)) {
                    for (const ev of [...(data.account_data?.events || []), ...(data.ephemeral?.events || [])]) {
                        yield { ...ev, room_id } as RoomEvent;
                    }
                    for (const ev of [...(data.state?.events || []), ...(data.timeline?.events || [])]) {
                        if (this.isUnique(ev.event_id)) {
                            yield { ...ev, room_id } as RoomEvent;
                        }
                    }
                }
            }

            if (res.rooms.leave !== undefined) {
                for (const [room_id, data] of Object.entries(res.rooms.leave)) {
                    if (data.account_data !== undefined) {
                        for (const ev of data.account_data.events) {
                            yield { ...ev, room_id } as RoomEvent;
                        }
                    }
                    for (const ev of [...(data.state?.events || []), ...(data.timeline?.events || [])]) {
                        if (this.isUnique(ev.event_id)) {
                            yield { ...ev, room_id } as RoomEvent;
                        }
                    }
                }
            }
        }
    }
}
