const { REST, Routes } = require("discord.js");
const config = require("../../config.json");

module.exports = async (clientid, commands, token) => {
    const rest = new REST().setToken(token);
    try {
        // Register to Guild commands (updates INSTANTLY in the server)
        if (config.guildid) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(clientid, config.guildid),
                    { body: commands }
                );
                console.log(`[SLASH] Successfully updated GUILD commands for server ${config.guildid} (Instant!)`);
                
                // Clear global commands to avoid duplicates
                await rest.put(
                    Routes.applicationCommands(clientid),
                    { body: [] }
                );
                console.log(`[SLASH] Cleared GLOBAL commands to prevent duplication.`);
            } catch (guildErr) {
                console.error("[SLASH] Failed to update guild commands:", guildErr.message);
            }
        } else {
            // Register to Global commands (for DMs and all servers)
            await rest.put(
                Routes.applicationCommands(clientid),
                { body: commands }
            );
            console.log(`[SLASH] Successfully updated GLOBAL application commands.`);
        }
    } catch (error) {
        console.error("[SLASH] Failed to update commands:", error);
    }
};
