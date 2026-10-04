const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "1LpLc-fbI35iCnE8WpB92xvpwLh_2eGDAjLpxZbkSR0Y";
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || "1556174615443677215";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ユーザーごとの利用回数記録マップ { userId: { count: number, date: string } }
const userUsageMap = new Map();

// 今日の日付文字列（日本時間 YYYY-MM-DD）を取得する関数
function getTodayString() {
  const options = { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('ja-JP', options);
  return formatter.format(new Date());
}

// ユーザーの本日利用回数をチェック＆カウントアップする関数（上限3回）
function checkAndUpdateUsage(userId) {
  const today = getTodayString();
  const userData = userUsageMap.get(userId);

  if (!userData || userData.date !== today) {
    // 初回利用、または日付が変わっている場合は1回目として記録
    userUsageMap.set(userId, { count: 1, date: today });
    return { allowed: true, remaining: 2 };
  }

  if (userData.count >= 3) {
    // すでに3回達している場合
    return { allowed: false, remaining: 0 };
  }

  // 2回目・3回目の利用
  userData.count += 1;
  userUsageMap.set(userId, userData);
  return { allowed: true, remaining: 3 - userData.count };
}

async function getUserPoints(userId) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;
    const response = await fetch(url);
    const text = await response.text();
    
    const jsonText = text.substring(47, text.length - 2);
    const data = JSON.parse(jsonText);
    const rows = data.table.rows;

    for (const row of rows) {
      if (!row.c || !row.c[0]) continue;
      const sheetUserId = String(row.c[0].v || row.c[0].f).trim();
      if (sheetUserId === String(userId).trim()) {
        return row.c[1] ? (row.c[1].v || 0) : 0;
      }
    }
  } catch (error) {
    console.error("スプレッドシート読み込みエラー:", error);
  }
  return 0;
}

client.once('ready', async () => {
  console.log(`Botがログインしました: ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (channel) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('check_points')
          .setLabel('ポイントを確認する (1日3回まで)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎁')
      );

      const messages = await channel.messages.fetch({ limit: 10 });
      const existingBotMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

      if (!existingBotMsg) {
        await channel.send({
          content: "👇 **以下のボタンを押すと、あなたの現在の合計ポイントが確認できます（1日3回まで）**",
          components: [row]
        });
        console.log("ポイント確認ボタンを送信しました。");
      }
    }
  } catch (e) {
    console.error("ボタン送信エラー:", e.message);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'check_points') {
    const userId = interaction.user.id;

    // 回数制限チェック（1日3回）
    const usage = checkAndUpdateUsage(userId);

    if (!usage.allowed) {
      await interaction.reply({
        content: `⚠️ <@${userId}> さん、本日のポイント確認上限（1日3回）に達しました。\n日付が変わってから（明日）再度ご確認ください！`,
        ephemeral: true
      });
      return;
    }

    const points = await getUserPoints(userId);

    await interaction.reply({
      content: `📊 **現在の合計ポイント**\n<@${userId}> さんの合計ポイントは **${points} pt** です！\n*(本日の残り確認可能回数: あと ${usage.remaining} 回)*`,
      ephemeral: true
    });
  }
});

client.login(BOT_TOKEN);
