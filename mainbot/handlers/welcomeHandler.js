const { EmbedBuilder } = require('discord.js');
const { guildid, welcomechannel, memberrole } = require('../../config.json');


const invites = new Map();


const colorPalette = [
    '#c086cb', '#cefe8f', '#eae4c2', '#87cfd6', '#ef98b7',
    '#b4b1e7', '#ecb387', '#e0b0ab', '#aa8cc1', '#b39be4',
    '#b0b693', '#868ed3', '#b28fef', '#a5d8ff', '#ffb7b2',
    '#9bf6ff', '#fdffb6', '#ffd6a5', '#caffbf', '#ffadad',
    '#bdb2ff', '#ffc6ff', '#fffffc', '#a0c4ff', '#f4a261'
];


const getRandomColor = () => {
    return colorPalette[Math.floor(Math.random() * colorPalette.length)];
};


function setupMemberHandler(client) {
    
    client.on('ready', async () => {
        client.guilds.cache.forEach(async guild => {
            try {
                const guildInvites = await guild.invites.fetch();
                invites.set(guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
                
            } catch (err) {
                console.error(`MemberHandler|Error|Failed to cache invites for ${guild.name}: ${err.message}`);
            }
        });
    });

    
    client.on('inviteCreate', async invite => {
        try {
            const guildInvites = invites.get(invite.guild.id) || new Map();
            guildInvites.set(invite.code, invite.uses);
            invites.set(invite.guild.id, guildInvites);
            
        } catch (err) {
            console.error(`MemberHandler|Error|Failed to cache new invite: ${err.message}`);
        }
    });

    
    client.on('guildMemberAdd', async member => {
        try {
            
            if (member.guild.id !== guildid) {
                return;
            }
            
           
            
            const channel = member.guild.channels.cache.get(welcomechannel);
            if (!channel) {
                console.error(`MemberHandler|Error|Welcome channel ${welcomechannel} not found`);
                return;
            }

            
            try {
                const role = member.guild.roles.cache.get(memberrole);
                if (!role) {
                    console.error(`MemberHandler|Error|Member role ${memberrole} not found`);
                } else {
                    await member.roles.add(role);
                    
                }
            } catch (roleError) {
                console.error(`MemberHandler|Error|Failed to assign member role: ${roleError.message}`);
            }

            
            let inviteSource = "vanity"; 
            try {
                const newInvites = await member.guild.invites.fetch();
                const oldInvites = invites.get(member.guild.id) || new Map();
               
                
                const usedInvite = [...newInvites.values()].find(invite => {
                    const oldUses = oldInvites.get(invite.code) || 0;
                    return invite.uses > oldUses;
                });

                
                invites.set(member.guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));

                if (usedInvite) {
                    if (usedInvite.inviter) {
                        inviteSource = usedInvite.inviter.tag;
                    } else {
                        inviteSource = `invite: ${usedInvite.code}`;
                    }
                } else if (member.guild.vanityURLCode) {
                    inviteSource = "vanity";
                }
            } catch (err) {
                console.error(`MemberHandler|Error|Failed to track invite: ${err.message}`);
            }

            
const { sendComponentsV2, IS_COMPONENTS_V2 } = require('../utils/componentsV2');

function getOrdinalSuffix(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

            const config = require('../../config.json');
            const memberCountOrdinal = getOrdinalSuffix(member.guild.memberCount);
            const banner = config.welcomebanner || config.leaderboardbanner;
            const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });

            const welcomeContainerComponents = [];

            // 1. Media Gallery (Banner)
            if (banner && typeof banner === 'string' && banner.trim().startsWith('http')) {
                welcomeContainerComponents.push({
                    type: 12, // MEDIA_GALLERY
                    items: [
                        {
                            media: {
                                url: banner.trim()
                            },
                            description: "Welcome Banner"
                        }
                    ]
                });
            }

            // 2. Section (Text & Avatar Accessory)
            const section = {
                type: 9, // SECTION
                components: [
                    {
                        type: 10, // TEXT_DISPLAY
                        content: `## Welcome ${member.user.username} to ${member.guild.name}.\n\n🔅 Welcome **${member.user.username}**!\n🔅 You are the **${memberCountOrdinal}** member.\n🔅 Invited via: \`${inviteSource}\``
                    }
                ]
            };

            if (avatarUrl) {
                section.accessory = {
                    type: 11, // THUMBNAIL
                    media: {
                        url: avatarUrl
                    },
                    description: "Member Avatar"
                };
            }

            welcomeContainerComponents.push(section);

            // 3. Separator
            welcomeContainerComponents.push({
                type: 14, // SEPARATOR
                divider: true,
                spacing: 1
            });

            // 4. Footer timestamp
            welcomeContainerComponents.push({
                type: 10, // TEXT_DISPLAY
                content: `-# 🕒 ${getFormattedTime()}`
            });

            const welcomePayload = {
                flags: IS_COMPONENTS_V2,
                components: [
                    {
                        type: 17, // CONTAINER
                        accent_color: 0x2B2D31,
                        components: welcomeContainerComponents
                    }
                ]
            };

            await sendComponentsV2(client, welcomechannel, welcomePayload);
            
        } catch (error) {
            console.error(`MemberHandler|Error|${error.message}`);
        }
    });

    
    client.on('guildMemberRemove', async member => {
        try {
            
            if (member.guild.id !== guildid) {
                return;
            }
            
            const channel = member.guild.channels.cache.get(welcomechannel);
            if (!channel) {
                console.error(`MemberHandler|Error|Leave channel ${welcomechannel} not found`);
                return;
            }

            const config = require('../../config.json');
            const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
            const banner = config.welcomebanner || config.leaderboardbanner;

            const leaveContainerComponents = [];

            if (banner && typeof banner === 'string' && banner.trim().startsWith('http')) {
                leaveContainerComponents.push({
                    type: 12, // MEDIA_GALLERY
                    items: [
                        {
                            media: {
                                url: banner.trim()
                            },
                            description: "Banner"
                        }
                    ]
                });
            }

            const leaveSection = {
                type: 9, // SECTION
                components: [
                    {
                        type: 10, // TEXT_DISPLAY
                        content: `## Goodbye ${member.user.username}\n\n👋 **${member.user.username}** has left the server.\n🔅 Member count: **${member.guild.memberCount}**`
                    }
                ]
            };

            if (avatarUrl) {
                leaveSection.accessory = {
                    type: 11, // THUMBNAIL
                    media: {
                        url: avatarUrl
                    },
                    description: "Member Avatar"
                };
            }

            leaveContainerComponents.push(leaveSection);

            leaveContainerComponents.push({
                type: 14, // SEPARATOR
                divider: true,
                spacing: 1
            });

            leaveContainerComponents.push({
                type: 10, // TEXT_DISPLAY
                content: `-# 🕒 ${getFormattedTime()}`
            });

            const leavePayload = {
                flags: IS_COMPONENTS_V2,
                components: [
                    {
                        type: 17, // CONTAINER
                        accent_color: 0x2B2D31,
                        components: leaveContainerComponents
                    }
                ]
            };

            await sendComponentsV2(client, welcomechannel, leavePayload);
            
        } catch (error) {
            console.error(`MemberHandler|Error|${error.message}`, error);
        }
    });

    
}


function getFormattedTime() {
    const now = new Date();
    const day = String(now.getUTCDate()).padStart(2, '0');
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const year = now.getUTCFullYear();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
}


module.exports = { setupMemberHandler };