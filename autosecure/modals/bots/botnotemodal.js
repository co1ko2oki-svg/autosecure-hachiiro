const { editbotmsg } = require("../../utils/responses/editbotmessage");
const { queryParams } = require("../../../db/database");
const { autosecureMap } = require("../../../mainbot/handlers/botHandler");
const { EmbedBuilder, ActivityType } = require("discord.js");

module.exports = {
    name: "botnotemodal",
    editbot: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferUpdate();

            let noteText = interaction.fields.getTextInputValue('bot_note_input');
            if (!noteText || noteText.trim() === '') noteText = null;

            const [_, userId, botnumber] = interaction.customId.split('|');

            await queryParams(
                'UPDATE autosecure SET note = ? WHERE user_id = ? AND botnumber = ?',
                [noteText, userId, botnumber]
            );

            const key = `${userId}|${botnumber}`;
            const c = autosecureMap.get(key);
            if (c && c.user) {
                try {
                    let dbRow = await queryParams('SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?', [userId, botnumber]);
                    let actData = null;
                    if (dbRow.length > 0 && dbRow[0].activity) {
                        try {
                            actData = typeof dbRow[0].activity === 'string' ? JSON.parse(dbRow[0].activity) : dbRow[0].activity;
                        } catch (e) {}
                    }
                    const visibility = (actData?.visibility || 'online').toLowerCase();
                    const actType = actData?.type || actData?.activity;
                    let activityTypeNum = null;
                    if (actType) {
                        const lowerType = actType.toLowerCase();
                        if (lowerType.includes('playing')) activityTypeNum = ActivityType.Playing;
                        else if (lowerType.includes('streaming')) activityTypeNum = ActivityType.Streaming;
                        else if (lowerType.includes('listening')) activityTypeNum = ActivityType.Listening;
                        else if (lowerType.includes('watching')) activityTypeNum = ActivityType.Watching;
                        else if (lowerType.includes('competing')) activityTypeNum = ActivityType.Competing;
                    }

                    const activities = [];
                    if (noteText && noteText.trim() !== '') {
                        activities.push({
                            name: "Custom Status",
                            type: ActivityType.Custom,
                            state: noteText.trim()
                        });
                    }
                    const activityName = actData?.text || actData?.activityData;
                    if (activityTypeNum !== null && activityName) {
                        activities.push({
                            name: activityName,
                            type: activityTypeNum
                        });
                    }

                    await c.user.setPresence({
                        activities: activities,
                        status: visibility
                    });
                } catch (presErr) {
                    console.error("Error updating live presence for note:", presErr);
                }
            }

            let msg = await editbotmsg(client, interaction, botnumber, userId);
            return interaction.editReply(msg);

        } catch (error) {
            console.error("Error in botnotemodal:", error);
            const errorEmbed = new EmbedBuilder()
                .setColor(16711710)
                .setTitle('An error occurred while updating bot note.');
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
