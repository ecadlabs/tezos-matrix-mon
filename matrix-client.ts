import {
    CreateRoomRequest, EventID, InviteRequest, JoinRequest, JoinResponse, LoginRequest,
    LoginResponse, MatrixError, SyncRequest, SyncResponse,
} from "./types.ts";
import { MessageContent } from "./events.ts";

import sodium, { KeyPair } from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";

function hexBytes(bytes: number[] | Uint8Array): string {
    return Array.from(bytes).map(x => ((x >> 4) & 0xf).toString(16) + (x & 0xf).toString(16)).join("");
}

// see https://github.com/airgap-it/beacon-node/blob/master/docker/crypto_auth_provider.py
export function loginRequestFromKeyPair(kp: KeyPair): LoginRequest {
    const enquiry = sodium.from_string(`login:${Math.floor(Date.now() / 1000 / (5 * 60))}`);
    const digest = sodium.crypto_generichash(32, enquiry);
    const sig = sodium.crypto_sign_detached(digest, kp.privateKey);
    const keyHash = sodium.crypto_generichash(32, kp.publicKey);

    return {
        type: "m.login.password",
        identifier: {
            type: "m.id.user",
            user: hexBytes(keyHash),
        },
        password: `ed:${hexBytes(sig)}:${hexBytes(kp.publicKey)}`,
        device_id: hexBytes(kp.publicKey),
    };
}

export function idFromKeyPair(kp: KeyPair, relay: string): string {
    const keyHash = sodium.crypto_generichash(32, kp.publicKey);
    return `@${hexBytes(keyHash)}:${relay}`
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
    args?: unknown[];
    query?: unknown;
    body?: unknown;
    noAuth?: boolean;
}

class HTTPMatrixClient {
    private setToken: (token: string) => void = () => undefined;
    private token = new Promise<string>((resolve) => { this.setToken = resolve });

    constructor(private relay: string) { }

    public setAuthToken(token: string) {
        this.setToken(token);
    }

    public async request(method: "POST", ep: "login", options: { body: LoginRequest, noAuth: true }): Promise<LoginResponse>;
    public async request(method: "GET", ep: "sync", options: { query: SyncRequest }): Promise<SyncResponse>;
    public async request(method: "POST", ep: "createRoom", options: { body: CreateRoomRequest }): Promise<JoinResponse>;
    public async request(method: "POST", ep: string, options: { body: InviteRequest }): Promise<void>;
    public async request(method: "POST", ep: string, options: { body: JoinRequest }): Promise<JoinResponse>;
    public async request(method: "PUT", ep: string, options: { body: MessageContent }): Promise<EventID>;
    public async request(method: string, ep: string, options?: RequestOptions, init?: RequestInit): Promise<unknown> {
        const optstr = options?.query !== undefined ? buildOptions(options.query) : "";
        const url = `https://${this.relay}${APIPrefix}${ep}${(optstr !== "" ? "?" + optstr : "")}`;
        const headers = new Headers(init?.headers);
        const reqInit = { ...init, method, headers };

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
            throw new HTTPError(req, res, await res.json());
        }

        return res.json();
    }
}

export interface MatrixClientOptions {
    timeout?: number;
}

const DefaultTimeout = 30000;

export class MatrixClient extends HTTPMatrixClient {
    private setLoginData: (data: LoginResponse) => void = () => undefined;
    public loginData = new Promise<LoginResponse>((resolve) => { this.setLoginData = resolve });

    private txcnt = 0;
    get txID(): string {
        return `${new Date().getTime()}-${this.txcnt++}`;
    }

    constructor(relay: string, login: LoginRequest, private opt?: MatrixClientOptions) {
        super(relay);
        this.request("POST", "login", { body: login, noAuth: true }).then(res => {
            this.setLoginData(res);
            this.setAuthToken(res.access_token);
        });
    }

    public async *poll(timeout: number = DefaultTimeout) {
        let since: string | undefined = undefined;
        while (true) {
            const res: SyncResponse = await this.request("GET", "sync", { query: { timeout, since } });
            since = res.next_batch;
            yield res;
        }
    }
}
