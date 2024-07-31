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

const postSlackMessage = async (client, channel, blocks) => {
	await client.chat.postMessage({
		channel: channel,
		blocks: blocks,
	});
};

const fetchSlackData = async (url, token, params) => {
	const response = await axios.get(url, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		params: params,
	});
	return response.data;
};

const gatherChannelData = async (token, workspace, channel, from, to) => {
	let params;
	if (from && to) {
		params = {
			team: workspace,
			reactions: "1",
			channel: channel.id,
			oldest: dayjs(from).unix(),
			latest: dayjs(to).unix(),
		};
	} else {
		params = {
			team: workspace,
			reactions: "1",
			channel: channel.id,
		};
	}
	const response = await fetchSlackData("https://slack.com/api/discovery.conversations.history", token, params);
	return response.messages;
};

const processData = (messages, bots, users) => {
	let totalMessages = 0;
	let totalReactions = 0;
	let totalThreads = 0;
	let newMembersCount = 0;
	let messageCountsByMonth = {};
	let userMessageCounts = {};
	let userReactionCounts = {};
	let userActiveDays = {};
	let threadMessages = [];
	let activeUsersLast28Days = new Set(); // 追加：28日以内にアクティブなユーザーを追跡

	for (const message of messages) {
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

		// ユーザー別月別メッセージ数(Botは除外)
		if (message.user && bots.indexOf(message.user) === -1) {
			if (!userMessageCounts[message.user]) {
				userMessageCounts[message.user] = {};
			}
			if (!userMessageCounts[message.user][month]) {
				userMessageCounts[message.user][month] = 0;
			}
			userMessageCounts[message.user][month]++;

			// 追加：28日以内にアクティブなユーザーを追跡
			if (messageDate.isAfter(dayjs().subtract(28, 'days'))) {
				activeUsersLast28Days.add(message.user);
			}
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

	// 月別メッセージ数を年月の降順にソートする
	messageCountsByMonth = Object.entries(messageCountsByMonth)
		.sort((a, b) => b[0].localeCompare(a[0]))
		.reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

	return {
		totalMessages,
		totalReactions,
		totalThreads,
		messageCountsByMonth,
		userMessageCounts,
		userReactionCounts,
		userActiveDays,
		userParticipationRates,
		threadMessages,
		newMembersCount,
		activeUsersLast28Days: activeUsersLast28Days.size // 追加：28日以内のアクティブユーザー数を返す
	};
};

const createNoDataBlock = () => ({
	type: "section",
	text: {
		type: "mrkdwn",
		text: "_データがありません_",
	},
});

const createSaveButtonBlock = (action_id) => ({
	type: "actions",
	elements: [
		{
			type: "button",
			text: {
				type: "plain_text",
				text: `保存`,
			},
			action_id: action_id,
		},
	],
});


// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }) => {

	const from = process.env.FROM;
	const to = process.env.TO;
	const workspace = process.env.WORKSPACE;
	// const workspaceName = client.team.info({
	// 	token:context.botToken,
	// 	team:workspace});
	const channelList = process.env.CHANNELS;
  const channelDir = process.env.CHANNEL;
  const selectUser =  process.env.SELECTUSER;

	console.log(`controllers.stats.calc body ${JSON.stringify(channelList)}`);
	console.log(`controllers.stats.calc from ${JSON.stringify(from)} to ${to}`);
	try {
		const token = process.env.SLACK_USER_TOKEN;
		const response = await fetchSlackData("https://slack.com/api/discovery.users.list", token, {});

		// 1. ユーザー数（種別情報を含む）
		const userResponse = response.users;
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
			const isSelectedUser = selectUser && selectUser.indexOf(user.id) === 0;
			const isNotBot = bots.indexOf(user.id) === -1;
	
			if (isSelectedUser || isNotBot) {
					// ユーザの配列に追加
					users.push(user);
			}
		});

		// 2. bMAU（ビジネス上の月間アクティブユーザー）
		// bMAUはAPIで直接取得できるメトリックではないため、月間のアクティブユーザーを手動で計算する必要があります。
		// ここでは仮に全ユーザーがアクティブであると仮定します。
		const bMAU = totalUsers;

		// 3. チャンネル数（Public/Privateの数を含む）
		const fetchAllChannels = async (token, workspace, onlyPublic) => {
			let allChannels = [];
			let hasMore = true;
			let offset = undefined;

			while (hasMore) {
				const params = {
					team: workspace,
					only_public: onlyPublic,
					offset: offset,
				};
				const result = await fetchSlackData("https://slack.com/api/discovery.conversations.list", token, params);
				allChannels = allChannels.concat(result.channels);
				offset = result.response_metadata ? result.response_metadata.offset : undefined;
				hasMore = !!offset;
			}
			return allChannels;
		};

		const publicChannelsResult = await fetchAllChannels(token, workspace, "true");
		const privateChannelsResult = await fetchAllChannels(token, workspace, "false");

		// Publicチャンネルの合計
		const totalPublicChannels = publicChannelsResult.length;
		// Privateチャンネルの合計
		const totalPrivateChannels = privateChannelsResult.length;
		const channels = publicChannelsResult.concat(privateChannelsResult);

		// ユーザー数とアクティブユーザー数を表示
		const initialBlocks = generateInitialBlocks({
			totalUsers,
			userTypes,
			bMAU,
			totalPublicChannels,
			totalPrivateChannels,
			activeUsersLast28Days: users.length,
		});
		await postSlackMessage(client, channelDir, initialBlocks);

		if (!channelList || channelList.length === 0) {
			// チャンネルリストが空の場合、全てのチャンネルのデータを集計
			let allMessages = [];
			for (const channel of channels) {
				const messages = await gatherChannelData(token, workspace, channel, from, to);
				allMessages = allMessages.concat(messages);
			}
			const data = processData(allMessages, bots, users);
			const blocks = generateBlocks(data);

			// チャンネルに投稿
			await postSlackMessage(client, channelDir, blocks);
		} else {
			// チャンネルリストがある場合、各チャンネルごとにデータを集計
			for (const channel of channels) {
				if (channelList && channelList.includes(channel.id)) {
					const messages = await gatherChannelData(token, workspace, channel, from, to);
					const data = processData(messages, bots, users);

					const blocks = generateBlocks(data, channel);

					// チャンネルに投稿
					await postSlackMessage(client, channelDir, blocks);
				}
			}
		}
		console.log("Message posted successfully");
	} catch (error) {
		console.error("Error fetching Slack data:", error);
	}
});

const generateInitialBlocks = (meta) => {
	const { totalUsers, userTypes, bMAU, totalPublicChannels, totalPrivateChannels, activeUsersLast28Days } = meta;

	const blocks = [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*全体の統計情報:*",
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
					text: `*Adminユーザー:*\n${userTypes.admins}`,
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
					text: `*bMAU:*\n${activeUsersLast28Days}`,
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
					text: `*過去28日間のアクティブユーザー数:*\n${activeUsersLast28Days}`, // 追加：過去28日間のアクティブユーザー数
				},
			],
		},
		{
			type: "divider",
		},
	];

	return blocks;
};

const generateBlocks = (data, channel = null) => {
	const { totalMessages, totalReactions, totalThreads, messageCountsByMonth, userMessageCounts, userReactionCounts, userActiveDays, userParticipationRates, threadMessages, newMembersCount } = data;

	console.log(`userParticipationRates: ${JSON.stringify(userParticipationRates)}`);
	let channelName = channel ? `<#${channel.id}>` : "全てのチャンネル";
	let topMessage = `*Slack Workspace ${channelName} の利用状況:*`;

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
					text: `*新規ユーザ数:*\n${newMembersCount}`,
				},
				{
					type: "mrkdwn",
					text: `*合計メッセージ数:*\n${totalMessages}`,
				},
				{
					type: "mrkdwn",
					text: `*合計リアクション数:*\n${totalReactions}`,
				},
				{
					type: "mrkdwn",
					text: `*合計スレッド数:*\n${totalThreads}`,
				},
			]
		},
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*月別メッセージ数:*",
			},
		},
	];

	const generateMessageCountsFields = (start, end) => Object.keys(messageCountsByMonth).slice(start, end).map((month) => ({
		type: "mrkdwn",
		text: `*${month}:* ${messageCountsByMonth[month]} メッセージ`,
	}));
	
	// messageCountsByMonthのエントリ数に応じて動的にセクションを追加
	const step = 10; // 一度に表示する月数
	for (let i = 0; i < Object.keys(messageCountsByMonth).length; i += step) {
		const messageCountsFields = generateMessageCountsFields(i, i + step);
		if (messageCountsFields.length) {
			blocks.push({
				type: "section",
				fields: messageCountsFields,
			});
		} else {
			blocks.push(createNoDataBlock());
		}
	}

	blocks.push(
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*ユーザ別メッセージ数:*",
			},
		}
	);
	blocks.push(createSaveButtonBlock('view_messageCounts_details'));

	const userMessageCountsFields = Object.keys(userMessageCounts).slice(0, 10).map((user) => {
		const months = userMessageCounts[user];
		return {
			type: "mrkdwn",
			text: `*<@${user}>:*\n${Object.entries(months)
				.map(([month, count]) => `${month}: ${count}`)
				.join(", ")}`,
		};
	});
	if (userMessageCountsFields.length > 0) {
		blocks.push({
			type: "section",
			fields: userMessageCountsFields,
		});
	} else {
		blocks.push(createNoDataBlock());
	}
	blocks.push(createSaveButtonBlock('view_userMessageCounts_details'));
	blocks.push(
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*ユーザ別リアクション数:*",
			},
		}
	);

	const userReactionCountsFields = Object.keys(userReactionCounts).slice(0, 10).map((user) => {
		const months = userReactionCounts[user];
		return {
			type: "mrkdwn",
			text: `*<@${user}>:*\n${Object.entries(months)
				.map(([month, count]) => `${month}: ${count}`)
				.join(", ")}`,
		};
	});
	if (userReactionCountsFields.length > 0) {
		blocks.push({
			type: "section",
			fields: userReactionCountsFields,
		});
	} else {
		blocks.push(createNoDataBlock());
	}
	blocks.push(createSaveButtonBlock('view_userReactionCounts_details'));

	blocks.push(
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*ユーザー別アクティブ日数:*",
			},
		}
	);

	// Sort userActiveDays by number of active days (desc)
	const sortedUserActiveDays = Object.entries(userActiveDays)
	.sort((a, b) => b[1].size - a[1].size)
	.reduce((obj, [key, value]) => {
		obj[key] = value;
		return obj;
	}, {});

	const generateActiveDaysFields = (start, end) => Object.keys(sortedUserActiveDays).slice(start, end).map((user) => ({
		type: "mrkdwn",
		text: `*<@${user}>:* ${sortedUserActiveDays[user].size} 日`,
	}));

	for (let i = 0; i < Object.keys(sortedUserActiveDays).length; i += 10) {
		const userActiveDaysFields = generateActiveDaysFields(i, i + 10);
		if (userActiveDaysFields.length > 0) {
			blocks.push({
				type: "section",
				fields: userActiveDaysFields,
			});
		} else {
			blocks.push(createNoDataBlock());
		}
		blocks.push(createSaveButtonBlock('view_userActiveDays_details'));
	}

	blocks.push(
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*ユーザーの参加率:*",
			},
		}
	);

	// Sort userParticipationRates by rate (desc)
	const sortedUserParticipationRates = Object.entries(userParticipationRates)
		.sort((a, b) => b[1] - a[1])
		.reduce((obj, [key, value]) => {
			obj[key] = value;
			return obj;
		}, {});

	const generateParticipationRateFields = (start, end) => Object.keys(sortedUserParticipationRates).slice(start, end).map((user) => ({
		type: "mrkdwn",
		text: `*<@${user}>:* ${(sortedUserParticipationRates[user] * 100).toFixed(2)}%`,
	}));

	for (let i = 0; i < Object.keys(sortedUserParticipationRates).length; i += 10) {
		const userParticipationRatesFields = generateParticipationRateFields(i, i + 10);
		if (userParticipationRatesFields.length > 0) {
			blocks.push({
				type: "section",
				fields: userParticipationRatesFields,
			});
		} else {
			blocks.push(createNoDataBlock());
		}
		blocks.push(createSaveButtonBlock('view_userParticipationRates_details'));
	}

	blocks.push(
		{
			type: "divider",
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*Topスレッドメッセージ:*",
			},
		}
	);

	if (threadMessages.length === 0) {
		blocks.push(createNoDataBlock());
	} else {
		threadMessages.slice(0, 10).forEach((message) => {
			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*<@${message.user}>:* "${message.text}" (${message.replies} replies)`,
				},
			});
		});
	}
	blocks.push(createSaveButtonBlock('view_message_threds_details'));
	return blocks;
};


// Listens for an action from a button click
app.action('button_click', async ({ body, ack, say }) => {
  await ack();
  
  await say(`<@${body.user.id}> clicked the button`);
});

// Handle the Lambda function event
module.exports.handler = async (event, context, callback) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
}