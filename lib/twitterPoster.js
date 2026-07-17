/**
 * Twitter/X posting. Until TWITTER_API_KEY etc. are set in .env, this
 * silently skips posting rather than crashing the whole service — so
 * Telegram alerts keep working while you're still setting up X access.
 *
 * Once you have credentials (developer.x.com, app permissions set to
 * "Read and Write"), run: npm install twitter-api-v2
 * then uncomment the real implementation below.
 */

const isConfigured = Boolean(
  process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
);

let client = null;
function getClient() {
  if (!isConfigured) return null;
  if (!client) {
    // eslint-disable-next-line global-require
    const { TwitterApi } = require("twitter-api-v2");
    client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
  }
  return client;
}

async function postGoalTweet(imageBuffer, text) {
  if (!isConfigured) {
    console.log("Twitter not configured yet — skipping tweet:", text);
    return;
  }
  const twitterClient = getClient();
  const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: "image/png" });
  await twitterClient.v2.tweet({ text, media: { media_ids: [mediaId] } });
}

module.exports = { postGoalTweet, isConfigured };
