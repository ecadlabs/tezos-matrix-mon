import sodium from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";
import { MatrixClient, loginRequestFromKeyPair, idFromKeyPair } from "./matrix-client.ts";
import { CreateRoomRequest, JoinRequest } from "./types.ts";
import { MessageContent } from "./events.ts";

async function initiatorFunc(c: MatrixClient, peer: string) {
    const roomResponse = await c.request("POST", "createRoom", {
        body: {
            invite: [peer],
            preset: 'trusted_private_chat',
            is_direct: true
        } as CreateRoomRequest
    });
    console.log(roomResponse);

    const roomId = roomResponse.room_id;

    const msgResponse = await c.request("PUT", `rooms/${encodeURIComponent(roomId)}/send/m.room.message/${c.txID}`, { body: { msgtype: "m.text", body: "foo", } as MessageContent });
    console.log(msgResponse);

    // for await (const state of c.poll()) {
    //     if (state.rooms?.invite && Object.keys(state.rooms?.invite).length !== 0 ||
    //         state.rooms?.join && Object.keys(state.rooms?.join).length !== 0) {
    //         console.log((await c.loginData).user_id, Deno.inspect(state, { depth: 100 }));
    //     }
    // }
}

async function responderFunc(c: MatrixClient) {
    for await (const state of c.poll()) {
        if (state.rooms?.invite && Object.keys(state.rooms?.invite).length !== 0 ||
            state.rooms?.join && Object.keys(state.rooms?.join).length !== 0) {
            console.log((await c.loginData).user_id, Deno.inspect(state, { depth: 100 }));
        }

        if (state.rooms?.invite !== undefined) {
            for (const [room, updates] of Object.entries(state.rooms?.invite)) {
                for (const ev of updates.invite_state.events) {
                    if (ev.type === "m.room.member" && ev.content.membership === "invite") {
                        // join the room
                        c.request("POST", `rooms/${encodeURIComponent(room)}/join`, { body: {} as JoinRequest });
                    }
                }
            }
        }
    }
}

async function matrixMonitor(relay: string) {
    await sodium.ready;
    const initiatorKeyPair = sodium.crypto_sign_keypair();
    const responderKeyPair = sodium.crypto_sign_keypair();
    const responder = idFromKeyPair(responderKeyPair, relay);

    initiatorFunc(new MatrixClient(relay, loginRequestFromKeyPair(initiatorKeyPair)), responder);
    responderFunc(new MatrixClient(relay, loginRequestFromKeyPair(responderKeyPair)));
}

matrixMonitor("matrix.papers.tech");
