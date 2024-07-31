# Slackデータ分析ツール

## 概要

このツールはSlack APIを使用して、Slackワークスペースのデータを収集し、以下の情報を集計します：

- ユーザー数（管理者、所有者、ボットを含む）
- bMAU（ビジネス上の月間アクティブユーザー数）
- メッセージ数総数
- チャンネル数（Public/Privateチャンネルの数を含む）

## セットアップ方法

### 前提条件

- Node.jsとnpmがインストールされていること
- Serverless Frameworkがインストールされていること
- AWSアカウントがあること
- Slack APIのトークンがあること

### 1. リポジトリのクローン

以下のコマンドを使用してリポジトリをクローンします：

```bash
git clone https://github.com/your-repository/slack-data-analysis.git
cd slack-data-analysis
```

### 2. 必要なパッケージのインストール
```bash
npm install
```

### 3. Serverless Frameworkの設定
serverless.ymlファイルを作成し、以下の設定を追加します：

```bash
# "org" ensures this Service is used with the correct Serverless Framework Access Key.
org: YOUR-NAME
# "app" enables Serverless Framework Dashboard features and sharing them with other Services.
app: aws-stat
service: aws-stat
provider:
  name: aws
  runtime: nodejs20.x
  environment:
    SLACK_SIGNING_SECRET: ${env:SLACK_SIGNING_SECRET}
    SLACK_BOT_TOKEN: ${env:SLACK_BOT_TOKEN}
functions:
  slack:
    handler: app.handler
    events:
      - http:
          path: slack/events
          method: post
plugins:
  - serverless-offline
```
### 4. 環境変数の設定

AWS Lambdaで使用する環境変数を設定します。以下の変数が必要です：

- `SLACK_SIGNING_SECRET` - Slackアプリの署名シークレット
- `SLACK_BOT_TOKEN` - Slackボットのアクセストークン

これらの環境変数は、AWS Lambdaの設定で入力するか、`.env`ファイルに記述して使用します。

### 5. Lambda関数のデプロイ

Serverless Frameworkを使用してAWS Lambdaにデプロイします：

```bash
serverless deploy
```

### 6. テストとデバッグ

#### ローカルテスト

デプロイ後、以下のコマンドを使用してローカル環境でのテストを行うことができます：

```bash
serverless invoke local --function slackDataAnalysis
```
## トラブルシューティング

- **環境変数の設定ミス**: 環境変数が正しく設定されていることを確認してください。特にトークンやシークレットが正しいかどうかをチェックします。

- **API Gatewayのエラー**: API Gatewayの設定やURLが正しいか確認してください。また、Lambda関数のログでエラーの詳細を確認することができます。

- **データ取得の失敗**: Slack APIのレスポンスやエラーメッセージを確認し、必要に応じてリクエストパラメータを修正します。

- **Lambda関数のエラー**: Lambda関数のログでエラーのスタックトレースやメッセージを確認し、コードの修正が必要かどうかを判断します。

## 追加情報

詳しいAPIの使い方やServerless Frameworkの設定については、以下の公式ドキュメントを参照してください：

- [Slack API Documentation](https://api.slack.com/)
- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)