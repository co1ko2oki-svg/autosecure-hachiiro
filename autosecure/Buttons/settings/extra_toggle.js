const listExtraOptions = require("../../utils/settings/listExtraOptions");

module.exports = {
    name: "extra_toggle",
    callback: async (client, interaction) => {
        const ownerId = client.username;
        const userId = interaction.user.id;
        
        // Parameter check
        const param = interaction.customId.split("|")[1];
        if (!param) return interaction.reply({ content: "Invalid button", ephemeral: true });

        const users = await client.queryParams(
            `SELECT * FROM users WHERE user_id=? AND child=?`,
            [ownerId, userId]
        );

        if (userId !== ownerId && (users.length === 0 || users[0].editfeatures !== 1)) {
            return interaction.reply({
                content: "You don't have permission to edit features!",
                ephemeral: true
            });
        }

        const currentSettings = await client.queryParams(
            `SELECT * FROM autosecure WHERE user_id=?`,
            [ownerId]
        );
        
        if (currentSettings.length === 0) {
            return interaction.reply({ content: "Settings not found!", ephemeral: true });
        }

        const settings = currentSettings[0];
        
        // Handle toggles
        const allowedToggles = ["removecards", "removesubs", "removelinkednumbers", "leavefamily"];
        
        if (allowedToggles.includes(param)) {
            const currentValue = settings[param];
            const newValue = currentValue === 1 ? 0 : 1;
            
            await client.queryParams(
                `UPDATE autosecure SET ${param}=? WHERE user_id=?`,
                [newValue, ownerId]
            );
        } else if (param === "checkban") {
            // Edit ban check opens a modal to select hypixel/donut or just toggles? 
            // The screenshot says "Bancheck Options: Hypixel, Donut". 
            // We can just toggle them circularly for now: Both off -> Hypixel on -> Donut on -> Both on
            let h = settings.checkban_hypixel;
            let d = settings.checkban_donut;
            
            if (h === 0 && d === 0) { h = 1; d = 0; }
            else if (h === 1 && d === 0) { h = 0; d = 1; }
            else if (h === 0 && d === 1) { h = 1; d = 1; }
            else { h = 0; d = 0; }
            
            await client.queryParams(
                `UPDATE autosecure SET checkban_hypixel=?, checkban_donut=? WHERE user_id=?`,
                [h, d, ownerId]
            );
        }

        const msg = await listExtraOptions(client, ownerId);
        return interaction.update(msg);
    }
};
