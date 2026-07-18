const { TwitterApi } = require("twitter-api-v2");

/**
 * Uses the read-only Bearer Token (app-only auth) for searching replies —
 * separate from the OAuth1 posting credentials, no extra setup needed since
 * this was already generated alongside your other X keys.
 */
function getReadClient() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    throw new Error("TWITTER_BEARER_TOKEN not set in .env");
  }
  return new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
}

/**
 * Fetches replies to a specific tweet. Uses X's recent search with a
 * conversation_id filter — this only reaches tweets from the last 7 days,
 * which is fine since match-related replies happen within hours.
 *
 * NOTE: this costs real read credits per call (X's pay-per-use pricing) —
 * don't poll this as aggressively as the match-data loop.
 */
async function fetchReplies(tweetId, botUsername) {
  const client = getReadClient();
  // Simplified to just conversation_id — the "to:" operator may not be
  // available on all API access tiers, and was the prime suspect for
  // zero results despite a real reply existing.
  const query = `conversation_id:${tweetId}`;
  console.log(`[twitterReader] Searching with query: "${query}"`);

  const result = await client.v2.search(query, {
    "tweet.fields": ["author_id", "created_at", "text", "conversation_id"],
    expansions: ["author_id"],
    "user.fields": ["username", "profile_image_url"],
    max_results: 100,
  });

  console.log("[twitterReader] Raw search result:", JSON.stringify(result.data, null, 2));

  const users = new Map();
  for (const u of result.includes?.users ?? []) {
    users.set(u.id, u);
  }

  return result.data?.data
    ?.filter((tweet) => tweet.id !== tweetId) // exclude the prompt tweet itself
    ?.map((tweet) => ({
      text: tweet.text,
      authorId: tweet.author_id,
      createdAt: tweet.created_at,
      username: users.get(tweet.author_id)?.username,
      profileImageUrl: users.get(tweet.author_id)?.profile_image_url,
    })) ?? [];
}

/**
 * Matches a reply's text against known team names. Simple substring
 * matching — good enough for casual replies like "France!" or "I think
 * England tbh" but won't catch every phrasing (e.g. nicknames, misspellings).
 * Returns the matched team name, or null if no team name was found.
 */
function parsePredictionFromText(text, candidateTeams) {
  const lower = text.toLowerCase();
  for (const team of candidateTeams) {
    if (lower.includes(team.toLowerCase())) {
      return team;
    }
  }
  return null;
}

module.exports = { fetchReplies, parsePredictionFromText };