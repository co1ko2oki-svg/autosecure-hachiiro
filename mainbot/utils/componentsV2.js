const { Routes } = require("discord.js");

const IS_COMPONENTS_V2 = 32768;

/**
 * Send a Components V2 message to a channel
 */
async function sendComponentsV2(client, channelId, payload) {
    const finalPayload = {
        flags: IS_COMPONENTS_V2,
        ...payload
    };

    try {
        if (client.rest) {
            const res = await client.rest.post(Routes.channelMessages(channelId), {
                body: finalPayload
            });
            return res;
        } else {
            const channel = await client.channels.fetch(channelId);
            return await channel.send(finalPayload);
        }
    } catch (err) {
        console.error(`[ComponentsV2] Error sending message to ${channelId}:`, err);
        // Fallback to channel.send if rest call fails
        try {
            const channel = await client.channels.fetch(channelId);
            return await channel.send(finalPayload);
        } catch (fallbackErr) {
            console.error(`[ComponentsV2] Fallback send failed:`, fallbackErr);
            throw fallbackErr;
        }
    }
}

/**
 * Edit an existing Components V2 message
 */
async function editComponentsV2(client, channelId, messageId, payload) {
    const finalPayload = {
        flags: IS_COMPONENTS_V2,
        ...payload
    };

    try {
        if (client.rest) {
            const res = await client.rest.patch(Routes.channelMessage(channelId, messageId), {
                body: finalPayload
            });
            return res;
        } else {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            return await message.edit(finalPayload);
        }
    } catch (err) {
        console.error(`[ComponentsV2] Error editing message ${messageId}:`, err);
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            return await message.edit(finalPayload);
        } catch (fallbackErr) {
            console.error(`[ComponentsV2] Fallback edit failed:`, fallbackErr);
            throw fallbackErr;
        }
    }
}

module.exports = {
    IS_COMPONENTS_V2,
    sendComponentsV2,
    editComponentsV2
};
