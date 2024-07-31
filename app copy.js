const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { WebClient, LogLevel } = require("@slack/web-api");
const axios =require('axios');
const dayjs = require("dayjs");

// Initialize your custom receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Initializes your app with your bot token and the AWS Lambda ready receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,

  // When using the AwsLambdaReceiver, processBeforeResponse can be omitted.
  // If you use other Receivers, such as ExpressReceiver for OAuth flow support
  // then processBeforeResponse: true is required. This option will defer sending back
  // the acknowledgement until after your handler has run to ensure your function
  // isn't terminated early by responding to the HTTP request that triggered it.

  // processBeforeResponse: true
});

const client = new WebClient(process.env.SLACK_BOT_TOKEN, {
	// LogLevel can be imported and used to make debugging simpler
	logLevel: LogLevel.DEBUG
});

// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }) => {

  await client.chat.postMessage({
    channel: "D07BAEWUYE4",
    text: "post message",
  });

	const from = process.env.FROM;
	const to = process.env.TO;
	const workspace = process.env.WORKSPACE;
	// const workspaceName = client.team.info({
	// 	token:context.botToken,
	// 	team:workspace});
	const channelList = process.env.CHANNEL;

	// console.log(`controllers.stats.calc workspaceName ${JSON.stringify(workspaceName)}`);
	console.log(`controllers.stats.calc body ${JSON.stringify(channelList)}`);
	//console.log(`controllers.stats.calc view ${JSON.stringify(view)}`);
	console.log(`controllers.stats.calc from ${JSON.stringify(from)} to ${to}`);
	// console.log(`controllers.stats.calc workspace ${JSON.stringify(workspace)}`);
	// console.log(`controllers.stats.calc tenant ${context.tenant}`);
	try {
		const token = process.env.SLACK_USER_TOKEN;
		const response = await axios.get("https://slack.com/api/discovery.users.list", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		// 1. ユーザー数（種別情報を含む）
		const userResponse = response.data.users;
		const users = [];
		const totalUsers = userResponse.length;
		const bots = [];
		const userTypes = userResponse.reduce(
			(acc, user) => {
				if (user.is_admin) acc.admins++;
				if (user.is_owner) acc.owners++;
				if (user.is_bot) {
					acc.bots++;
					bots.push(user.id);
				}
				if (user.deleted) acc.deleted++;
				return acc;
			},
			{ admins: 0, owners: 0, bots: 0, deleted: 0 }
		);

		userResponse.forEach((user) => {
			//console.log(`user: ${JSON.stringify(user.id)}`);
			if (bots.indexOf(user.id) === -1) {
				users.push(user);
			}
		});
		// 2. bMAU（ビジネス上の月間アクティブユーザー）
		// bMAUはAPIで直接取得できるメトリックではないため、月間のアクティブユーザーを手動で計算する必要があります。
		// ここでは仮に全ユーザーがアクティブであると仮定します。
		const bMAU = totalUsers;

		// 3. チャンネル数（Public/Privateの数を含む）
		const publicChannelsResult = await axios.get("https://slack.com/api/discovery.conversations.list", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
			params: {
				team: workspace,
				only_public: "true",
			},
		});
		const privateChannelsResult = await axios.get("https://slack.com/api/discovery.conversations.list", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
			params: {
				team: workspace,
				only_private: "true",
			},
		});
		const totalPublicChannels = publicChannelsResult.data.channels.length;
		const totalPrivateChannels = privateChannelsResult.data.channels.length;
		const channels = publicChannelsResult.data.channels.concat(privateChannelsResult.data.channels);

		let totalMessages = 0;
		let totalReactions = 0;
		let messageCountsByMonth = {};
		let userMessageCounts = {};
		let userReactionCounts = {};
		let userActiveDays = {};
		let newMembersCount = 0;
		let threadMessages = [];
		// スレッドの数をカウントする変数を追加
		let totalThreads = 0;

		// 動的な範囲指定 開始日を指定（例：'2023-01-01'） 終了日を指定（例：'2023-12-31'）
		// 期間の開始日と終了日を計算
		let startDate, endDate;
		let params;
		if (from && to) {
			startDate = dayjs(from);
			endDate = dayjs(to);
			params = {
				team: workspace,
				reactions: "1",
				oldest: startDate.unix(),
				latest: endDate.unix(),
			};
		} else {
			// 直近の 1 ヶ月間の期間を設定
			// startDate = dayjs().subtract(1, 'month');
			// endDate = dayjs();
			params = {
				team: workspace,
				reactions: "1",
			};
		}

		//チャンネル単位で集計処理
		for (const channel of channels) {
			params["channel"] = channel.id;
			// チャンネル指定の場合、該当のチャンネル以外はスキップ
			if (channelList && channelList.length > 0 && channelList.indexOf(channel.id) === -1) {
				continue;
			}
			//ワークスペース単位で取得
			const response = await axios.get("https://slack.com/api/discovery.conversations.history", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
				params: params,
			});
			const historyResult = response.data;
			if (historyResult.error) {
				continue;
			}
			for (const message of historyResult.messages) {
				//console.log(`controllers.stats.calc message ${JSON.stringify(message)}`);

				const messageDate = dayjs.unix(message.ts);
				const month = messageDate.format("YYYY-MM");
				totalMessages++;

				// スレッドの数をカウント
				if (message.thread_ts) {
					totalThreads++;
				}
				// 月別メッセージ数
				if (!messageCountsByMonth[month]) {
					messageCountsByMonth[month] = 0;
				}
				messageCountsByMonth[month]++;

				// ユーザー別月別メッセージ数
				if (message.user && bots.indexOf(message.user) === -1) {
					if (!userMessageCounts[message.user]) {
						userMessageCounts[message.user] = {};
					}
					if (!userMessageCounts[message.user][month]) {
						userMessageCounts[message.user][month] = 0;
					}
					userMessageCounts[message.user][month]++;
				}

				// ユーザー別月別リアクション数
				if (message.reactions) {
					for (const reaction of message.reactions) {
						for (const user of reaction.users) {
							if (!userReactionCounts[user]) {
								userReactionCounts[user] = {};
							}
							if (!userReactionCounts[user][month]) {
								userReactionCounts[user][month] = 0;
							}
							userReactionCounts[user][month]++;
						}
						totalReactions++;
					}
				}

				// ユーザー別月別アクティブ日数
				// 取得したメッセージのユーザをアクティブとしてカウント
				// Botは除外
				if (message.user && bots.indexOf(message.user) === -1) {
					if (!userActiveDays[message.user]) {
						userActiveDays[message.user] = new Set();
					}
					userActiveDays[message.user].add(messageDate.format("YYYY-MM-DD"));
				}

				// スレッドの多い投稿およびその投稿者
				if (message.reply_count && message.reply_count > 0) {
					threadMessages.push({ user: message.user, text: message.text, replies: message.reply_count });
				}
			}
		}

		// 新規参加者数の計算
		// 過去1か月に新規作成されたユーザをカウント
		const oneMonthAgo = dayjs().subtract(1, "month");
		for (const user of users) {
			// Botは除外
			if(bots.indexOf(user) === -1) continue;
			const createdDate = dayjs.unix(user.created);
			if (body.start_date && body.end_date) {
				//日付がある場合
				if (createdDate.isBetween(startDate, endDate)) {
					newMembersCount++;
				}
			} else {
				//日付がない場合
				const createdDate = dayjs.unix(user.created);
				if (createdDate.isAfter(oneMonthAgo)) {
					newMembersCount++;
				}
			}
		}

		// ユーザー発言割合の計算
		const userParticipationRates = {};
		for (const [user, months] of Object.entries(userMessageCounts)) {
			const totalUserMessages = Object.values(months).reduce((a, b) => a + b, 0);
			userParticipationRates[user] = totalUserMessages / totalMessages;
		}

		// スレッドの多い投稿のソート
		threadMessages.sort((a, b) => b.replies - a.replies);
		//月別メッセージ数のソート
		// messageCountsByMonth = Object.entries(messageCountsByMonth)
		// .sort(([a, ], [b, ]) => b - a)
		// .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
		// 月別メッセージ数を年月の降順にソートする
		messageCountsByMonth = Object.entries(messageCountsByMonth)
			.sort((a, b) => b[0].localeCompare(a[0]))
			.reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

		let channelName = '';
		if (channelList && channelList.length > 0) {
			channelList.forEach((chanel) => {
				channelName += `<#${chanel}>,`;
			});
		} else {
			channelName = "全てのチャンネル";
		}
		let topMessage = `*Slack Workspace(${workspace}) ${channelName}の利用状況:*`;
		const blocks = [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: topMessage,
				},
			},
			{
				type: "divider",
			},
			{
				type: "section",
				fields: [
					{
						type: "mrkdwn",
						text: `*ユーザー数:*\n${totalUsers}`,
					},
					{
						type: "mrkdwn",
						text: `*Adminユーザ:*\n${userTypes.admins}`,
					},
					{
						type: "mrkdwn",
						text: `*オーナー:*\n${userTypes.owners}`,
					},
					{
						type: "mrkdwn",
						text: `*Botユーザー:*\n${userTypes.bots}`,
					},
					{
						type: "mrkdwn",
						text: `*削除されたユーザー:*\n${userTypes.deleted}`,
					},
					{
						type: "mrkdwn",
						text: `*bMAU:*\n${bMAU}`,
					},
					{
						type: "mrkdwn",
						text: `*Public Channelsの合計:*\n${totalPublicChannels}`,
					},
					{
						type: "mrkdwn",
						text: `*Private Channelsの合計:*\n${totalPrivateChannels}`,
					},
					{
						type: "mrkdwn",
						text: `*新規ユーザ数:*\n${newMembersCount}`,
					},
				],
			},
		];

		let block2 = [
			{
				type: "divider",
			},
			{
				type: "section",
				fields: [
					{
						type: "mrkdwn",
						text: `*Messageの合計:*\n${totalMessages}`,
					},
					{
						type: "mrkdwn",
						text: `*スレッドの数:*\n${totalThreads}`,
					},
					{
						type: "mrkdwn",
						text: `*Reactionの合計:*\n${totalReactions}`,
					},
				],
			},
			{
				type: "divider",
			},
		];

		const addFieldsToBlocks = (sectionTitle, data, formatter) => {
			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*${sectionTitle}*`,
				},
			});
			let fields = [];
			// データがない場合
			if (Object.keys(data).length === 0) {
				fields.push({
					type: "mrkdwn",
					text: "_No data available_",
				});
				blocks.push({ type: "section", fields: fields });
				return;
			}
			//データ出力
			Object.entries(data).forEach(([key, value], index) => {
				fields.push(formatter(key, value));
				if (fields.length === 10) {
					blocks.push({ type: "section", fields: fields });
					fields = [];
				}
			});
			if (fields.length > 0) {
				blocks.push({ type: "section", fields: fields });
			}
			blocks.push({
				type: "actions",
				elements: [
					{
						type: "button",
						text: {
							type: "plain_text",
							text: `保存`,
						},
						action_id: `view_${sectionTitle.replace(/\s+/g, "_").toLowerCase()}_details`,
					},
				],
			});
		};

		// Sort userActiveDays by number of active days (desc)
		const sortedUserActiveDays = Object.entries(userActiveDays)
			.sort((a, b) => b[1].size - a[1].size)
			.reduce((obj, [key, value]) => {
				obj[key] = value;
				return obj;
			}, {});

		// Sort userParticipationRates by rate (desc)
		const sortedUserParticipationRates = Object.entries(userParticipationRates)
			.sort((a, b) => b[1] - a[1])
			.reduce((obj, [key, value]) => {
				obj[key] = value;
				return obj;
			}, {});

		addFieldsToBlocks("月別メッセージ数", messageCountsByMonth, (month, count) => ({
			type: "mrkdwn",
			text: `*${month}:* ${count}`,
		}));

		addFieldsToBlocks("ユーザ別メッセージ数", userMessageCounts, (user, months) => ({
			type: "mrkdwn",
			text: `*<@${user}>:*\n${Object.entries(months)
				.map(([month, count]) => `${month}: ${count}`)
				.join(", ")}`,
		}));
		addFieldsToBlocks("ユーザ別リアクション数", userReactionCounts, (user, months) => ({
			type: "mrkdwn",
			text: `*<@${user}>:* ${Object.entries(months)
				.map(([month, count]) => `${month}: ${count}`)
				.join(", ")}`,
		}));

		addFieldsToBlocks("ユーザー別アクティブ日数", sortedUserActiveDays, (user, days) => ({
			type: "mrkdwn",
			text: `*<@${user}>:* ${[...days].length} days`,
		}));

		addFieldsToBlocks("ユーザの参加率", sortedUserParticipationRates, (user, rate) => ({
			type: "mrkdwn",
			text: `*<@${user}>:* ${(rate * 100).toFixed(2)}%`,
		}));

		console.log(`controllers.stats.calc threadMessages ${JSON.stringify(threadMessages)}`);
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Topスレッドメッセージ*`,
			},
		});
		let count = 0;
		threadMessages.forEach((message) => {
			const user = message.user;
			const text = message.text;
			const replies = message.replies;
			if (count == 10) {
				return;
			}

			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*<@${user}>:* "${text}" (${replies} replies)`,
				},
			});
			count += 1;
			console.log(`User: ${user}, Text: ${text}, Replies: ${replies}`);
		});
		blocks.push({
			type: "actions",
			elements: [
				{
					type: "button",
					text: {
						type: "plain_text",
						text: `保存`,
					},
					action_id: `view_ユーザの参加率_details`,
				},
			],
		});

		await client.chat.postMessage({
			channel: "D07BAEWUYE4",
			blocks,
		});
		console.log("Message posted successfully");
	} catch (error) {
		console.error("Error fetching Slack data:", error);
	}
});

// Listens for an action from a button click
app.action('button_click', async ({ body, ack, say }) => {
  await ack();
  
  await say(`<@${body.user.id}> clicked the button`);
});

// Listens to incoming messages that contain "goodbye"
app.message('goodbye', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`See ya later, <@${message.user}> :wave:`);
});

// Handle the Lambda function event
module.exports.handler = async (event, context, callback) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
}