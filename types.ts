// deno-lint-ignore-file camelcase ban-types

export interface MatrixError {
    errcode: string;
    error: string;
}

interface BaseLoginRequest {
    identifier: UserIdentifier;
    device_id?: string;
    initial_device_display_name?: string;
}

export type UserIdentifier = UserUserIdentifier | ThirdPartyUserIdentifier | PhoneUserIdentifier;

interface UserUserIdentifier {
    type: "m.id.user";
    user: string;
}

interface ThirdPartyUserIdentifier {
    type: "m.id.thirdparty";
    medium: string,
    address: string;
}

interface PhoneUserIdentifier {
    type: "m.id.phone",
    country: string;
    phone: string;
}

interface PasswordLoginRequest extends BaseLoginRequest {
    type: "m.login.password";
    password: string;
}

interface TokenLoginRequest extends BaseLoginRequest {
    type: "m.login.token";
    token: string;
}

export type LoginRequest = PasswordLoginRequest | TokenLoginRequest;

export interface LoginResponse {
    user_id: string;
    access_token: string;
    device_id?: string;
    well_known?: DiscoveryInformation;
}

interface DiscoveryInformation {
    ["m.homeserver"]: ServerInformation;
    ["m.identity_server"]?: ServerInformation;
    [key: string]: unknown;
}

interface ServerInformation {
    base_url: string;
}

interface MatrixEvent {
    content: object;
    type: string;
}

interface MatrixEvents<T extends MatrixEvent = MatrixEvent> {
    events: T[];
}

type Presence = "offline" | "online" | "unavailable";

export interface SyncRequest {
    filter?: string;
    since?: string;
    full_state?: boolean;
    set_presence?: Presence;
    timeout?: number;
}

export interface SyncResponse {
    next_batch: string;
    rooms?: Rooms;
    presence?: MatrixEvents;
    account_data?: MatrixEvents;
    to_device?: MatrixEvents;
    device_lists?: DeviceLists;
    device_one_time_keys_count?: Record<string, number>;
}

interface DeviceLists {
    changed?: string[];
    left?: string[];
}

interface Rooms {
    join?: Record<string, JoinedRoom | undefined>;
    invite?: Record<string, InvitedRoom | undefined>;
    leave?: Record<string, RoomUpdate | undefined>;
}

interface RoomUpdate {
    state?: MatrixEvents<StateEvent>;
    timeline?: Timeline;
    account_data?: MatrixEvents;
}

interface JoinedRoom extends RoomUpdate {
    summary?: RoomSummary;
    ephemeral?: MatrixEvents;
    unread_notifications?: UnreadNotificationCounts;
}

interface UnreadNotificationCounts {
    highlight_count?: number;
    notification_count?: number;
}

interface RoomSummary {
    ["m.heroes"]?: string[];
    ["m.joined_member_count"]?: number;
    ["m.invited_member_count"]?: number;
}

interface RoomEvent extends MatrixEvent {
    event_id: string;
    sender: string;
    origin_server_ts: number;
    unsigned?: UnsignedData;
}

interface StateEvent extends RoomEvent {
    prev_content?: StateEvent["content"];
    state_key: string;
}

interface UnsignedData {
    age?: number;
    redacted_because?: MatrixEvent;
    transaction_id?: string;
}

interface Timeline extends MatrixEvents<RoomEvent> {
    limited?: boolean;
    prev_batch?: string;
}

interface InvitedRoom {
    invite_state: MatrixEvents<StrippedStateEvent>;
}

interface StrippedStateEvent extends MatrixEvent {
    state_key: string;
    sender: string;
}

type RoomVisibility = "public" | "private";
type RoomPreset = "private_chat" | "public_chat" | "trusted_private_chat";

export interface CreateRoomRequest {
    visibility?: RoomVisibility;
    room_alias_name?: string;
    name?: string;
    topic?: string;
    invite?: string[];
    invite_3pid: Invite3pid[];
    room_version?: string;
    creation_content?: CreateEventContent;
    initial_state?: StateEvent[];
    preset?: RoomPreset;
    is_direct?: boolean;
    power_level_content_override?: PowerLevelsEventContent;
}

interface Invite3pid {
    id_server: string;
    id_access_token: string;
    medium: string;
    address: string;
}

interface CreateEventContent {
    creator: string;
    ["m.federate"]: boolean;
    room_version: string;
    predecessor?: RoomEvent;
}

interface PowerLevelsEventContent {
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

export interface InviteRequest {
    user_id: string;
}

export interface JoinRequest {
    third_party_signed?: ThirdPartySigned;
}

export interface JoinResponse {
    room_id: string;
}

interface ThirdPartySigned {
    sender: string;
    mxid: string;
    token: string;
    signatures: Record<string, Record<string, string>>;
}