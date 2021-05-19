import sodium from "https://raw.githubusercontent.com/ecadlabs/sodium/0.2.1/basic.ts";
import { MatrixClient, loginRequestFromKeyPair, idFromKeyPair } from "./matrix-client.ts";
import { CreateRoomRequest, JoinRequest } from "./types.ts";
import { MatrixEvent, MessageContent } from "./events.ts";

async function initiatorFunc(c: MatrixClient, peer: string) {
    const roomResponse = await c.request("POST", {
        body: {
            invite: [peer],
            preset: 'trusted_private_chat',
            is_direct: true
        } as CreateRoomRequest
    }, "createRoom");
    console.log(roomResponse);

    const roomId = roomResponse.room_id;

    const msgResponse = await c.request("PUT",
        { body: { msgtype: "m.text", body: "foo", } as MessageContent },
        "rooms/%s/send/%s/%s", roomId, "m.room.message", c.txID);
    console.log(msgResponse);
}

async function responderFunc(c: MatrixClient) {
    for await (const ev of c.events() as AsyncIterable<MatrixEvent>) {
        console.log((await c.loginData).user_id, Deno.inspect(ev, { depth: 100 }));
        if (ev.type === "m.room.member" && ev.content.membership === "invite") {
            // join the room
            c.request("POST", { body: {} as JoinRequest }, "rooms/%s/join", ev.room_id);
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
