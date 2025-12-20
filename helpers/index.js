const errors = {
    ALREADY_FRIENDS: "You are already friends with this user.",
    ALREADY_SENT: "You have already sent a friend request to this user.",
    USER_BLOCKED: "You cannot send a friend request to this user.",
    USER_NOT_FOUND: "User not found.",
    MEMBER_NOT_FOUND: "Member not found.",
    CHANNEL_NOT_FOUND: "Could not find a channel with this ID.",
    MESSAGE_NOT_FOUND: "Message not found.",
    FRIENDSHIP_NOT_FOUND: "Friendship not found.",
    ID_OR_USERNAME_REQUIRED: "User ID or username is required.",
    BOTS_CANT_BE_FRIEND: "Cannot send friend request to bots.",
    CANT_BE_FRIENDS_WITH_YOURSELF: "You cannot add yourself as a friend.",
    ACCESS_DENIED_CH: "Access denied to this channel.",
    NOT_CH_MEMBER: "You are not a member of this channel.",
    CAN_ONLY_INVITE_FRIEND: "You can only invite users who are your friends.",
    USER_ALREADY_IN_CHANNEL: "User is already a member of the channel.",
    USER_ADD_SUCCESS: "User added to channel successfully.",
    NO_INVITE_PERMISSION: "You do not have permission to invite users.",
    NO_MANAGE_PERMISSION: "You do not have permission to manage members.",
    NO_REMOVE_PERMISSION: "You do not have permission to remove members.",
    NO_READ_PERMISSION: "You do not have permission to read messages in this channel.",
    CH_OR_MSG_ID_INVALID: "Invalid channelId or messageId.",
    CH_OR_MSG_ID_MUST_BE_INTEGER: "channelId or messageId must be integers.",
    CH_OR_MSG_ID_OUT_OF_RANGE: "channelId or messageId out of valid range.",
    ONLY_OWNER_CAN_WTF: "Only the owner can modify another owner.",
    NO_FIELDS_TO_UPDATE: "No fields to update.",
    NO_FILES_UPLOADED: "No file uploaded.",
    INVALID_STATUS: "Invalid status.",
    ERR_CHANNEL_NAME_EMPTY: "Channel name cannot be empty.",
    ERR_CHANNEL_NAME_TOO_LONG: "Channel name is too long.",
    ERR_CHANNEL_NAME_INVALID_CHARS: "Channel name contains invalid characters.",
    ERR_CHANNEL_DESCRIPTION_EMPTY: "Channel description cannot be empty.",
    ERR_CHANNEL_DESCRIPTION_TOO_LONG: "Channel description is too long.",
    ERR_CHANNEL_DESCRIPTION_INVALID_CHARS: "Channel description contains invalid characters.",
    ERR_PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
    ERR_PASSWORD_TOO_LONG: "Password cannot be more than 128 characters.",
    ERR_PASSWORD_MISMATCH: "Passwords do not match.",
    ERR_PASSWORD_SAME_AS_CURRENT: "New password cannot be the same as the current one.",
    ERR_EMAIL_INVALID: "Please enter a valid email address.",
    ERR_EMAIL_SAME_AS_CURRENT: "New email cannot be the same as the current one.",
    ERR_PASSWORD_EMPTY: "Password is required.",
    ERR_DISPLAY_NAME_EMPTY: "Display name is required.",
    ERR_USERNAME_TOO_SHORT: "Username must be at least 3 characters.",
    ERR_USERNAME_INVALID_CHARS: "Username can only contain lowercase letters, numbers, and underscores.",
    INTERNAL_SERVER_ERROR: "Something went wrong. Please contact support.",
    ERR_USERNAME_EMPTY: "Username cannot be empty.",
    ERR_USERNAME_TOO_LONG: "Username is too long.",
    ERR_DISPLAY_NAME_TOO_LONG: "Display name is too long.",
    ERR_DISPLAY_NAME_INVALID_CHARS: "Display name contains invalid characters.",
    ERR_EMAIL_EMPTY: "Email cannot be empty.",
    ERR_EMAIL_TOO_LONG: "Email is too long.",
    ERR_INVALID_CREDENTIALS: "Invalid credentials.",
    ERR_PASSWORD_INCORRECT: "Incorrect password.",
    ERR_STATUS_INVALID: "Invalid status.",
    ERR_URL_TOO_LONG: "URL is too long.",
    ERR_URL_INVALID: "URL is invalid.",
    FILE_TOO_LARGE: "This file is too large.",
};

function formatUrl(url) {
    const base = 'https://api.beniocord.site';
    if (!url) return null;
    if (url.startsWith(base) || url.startsWith('http')) return url;
    return base + (url.startsWith('/') ? url : '/' + url);
}
function stripDomain(url) {
    try {
        const u = new URL(url);
        return u.pathname;
    } catch {
        return url;
    }
};
function parseErrors(message) {
    return errors[message] || message;
}

module.exports = { formatUrl, stripDomain, parseErrors }