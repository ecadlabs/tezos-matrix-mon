// deno-lint-ignore-file camelcase

export interface Event {
    content: unknown;
    type: string;
}

export interface RoomEvent extends Event {
    event_id: string;
    sender: string;
    origin_server_ts: number;
    unsigned?: UnsignedData;
    room_id?: string;
}

export interface StateEvent extends RoomEvent {
    prev_content?: this["content"];
    state_key: string;
}

interface UnsignedData {
    age?: number;
    redacted_because?: Event;
    transaction_id?: string;
}

export interface CreateEventContent {
    creator: string;
    ["m.federate"]: boolean;
    room_version: string;
    predecessor?: RoomEvent;
}

export interface PowerLevelsEventContent {
    ban?: number;
    events?: Record<string, number>;
    events_default?: number;
    invite?: number;
    kick?: number;
    redact?: number;
    state_default?: number;
    users?: Record<string, number>;
    users_default?: number;
    notifications?: Record<string, number>;
}

export interface MessageContent {
    body: string;
    msgtype: string;
}

type Membership = "invite" | "join" | "knock" | "leave" | "ban";

export interface Signed {
    mxid: string;
    token: string;
    signatures: Record<string, Record<string, string>>;
}

interface Invite {
    display_name: string;
    signed: Signed;
}

export interface RoomMemberEvent extends StateEvent {
    type: "m.room.member";
    content: {
        avatar_url?: string;
        displayname?: string | null;
        membership: Membership;
        is_direct?: boolean;
        third_party_invite?: Invite;
        unsigned?: UnsignedData;
    };
}

export interface RoomMessageEvent extends RoomEvent {
    type: "m.room.message";
    content: MessageContent;
}

export type MatrixEvent = RoomMemberEvent | RoomMessageEvent; // TODO