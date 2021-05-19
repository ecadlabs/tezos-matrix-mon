// deno-lint-ignore-file camelcase ban-types

export type EventType = "m.room.canonical_alias" | "m.room.create" | "m.room.join_rules" | "m.room.member" |
    "m.room.third_party_invite" | "m.room.power_levels" | "m.room.name" | "m.room.topic" | "m.room.avatar" |
    "m.room.pinned_events" | "m.room.encryption" | "m.room.history_visibility" | "m.room.guest_access" |
    "m.room.server_acl" | "m.room.tombstone" | "m.space.child" | "m.space.parent" | "m.room.redaction" |
    "m.room.message" | "m.room.encrypted" | "m.sticker" | "m.call.invite" | "m.call.candidates" | "m.call.answer" |
    "m.call.hangup" | "m.call.reject" | "m.call.select_answer" | "m.call.negotiate" | "m.call.replaces" |
    "m.call.asserted_identity" | "org.matrix.call.asserted_identity" | "m.key.verification.request" |
    "m.key.verification.start" | "m.key.verification.cancel" | "m.key.verification.mac" | "m.key.verification.done" |
    "m.room.message.feedback" | "m.reaction" | "m.typing" | "m.receipt" | "m.presence" | "m.fully_read" | "m.tag" |
    "m.push_rules" | "m.direct" | "m.ignored_user_list" | "m.room_key" | "m.room_key_request" | "m.forwarded_room_key" |
    "m.dummy";

export interface Event<T extends string = EventType> {
    type: T;
    content: object;
}

export interface RoomEvent extends Event {
    event_id: string;
    sender: string;
    origin_server_ts: number;
    room_id: string;
    unsigned?: UnsignedData;
}

export interface StateEvent extends RoomEvent {
    prev_content?: this["content"];
    state_key: string;
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

export type MatrixEvent = RoomMemberEvent | RoomMessageEvent; // TODO