const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const { getFlagPair } = require("../data/teamFlags");

GlobalFonts.registerFromPath(
  path.join(__dirname, "../assets/fonts/Poppins-Bold.ttf"),
  "PoppinsBold"
);
GlobalFonts.registerFromPath(
  path.join(__dirname, "../assets/fonts/Poppins-Medium.ttf"),
  "PoppinsMedium"
);

const TEMPLATES = [
  path.join(__dirname, "../assets/templates/goal_1.png"),
  path.join(__dirname, "../assets/templates/goal_2.png"),
];

function pickRandomTemplate() {
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}' ${String(s).padStart(2, "0")}"`;
}

/**
 * Renders a goal alert card.
 *
 * @param {object} opts
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 * @param {number} opts.homeGoals
 * @param {number} opts.awayGoals
 * @param {number} opts.scoredAtSeconds - match clock at the moment the goal was detected
 * @param {string} opts.scoringTeam - name of the team that scored (e.g. "France")
 * @param {number} opts.currentSeconds - match clock right now (may be slightly ahead)
 * @param {string} opts.ballImagePath - path to the real ball photo, pre-masked to a circle PNG
 * @param {string|null} [opts.scorerName] - the scoring player's real name, if resolved; omitted from the card entirely if not provided
 * @returns {Promise<Buffer>} PNG image buffer, ready to post
 */
async function renderGoalCard(opts) {
  const {
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    scoredAtSeconds,
    scoringTeam,
    currentSeconds,
    ballImagePath,
    scorerName,
  } = opts;

  const templatePath = pickRandomTemplate();
  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const gold = "#F4C400";
  const white = "#F5F5F5";
  const gray = "#969CAA";

  const x = 990;
  const panelTop = 40;

  ctx.fillStyle = gold;
  ctx.font = "66px PoppinsBold";
  ctx.fillText("GOAL!!!", x, panelTop + 100);

  // Flags — only if BOTH teams resolve; otherwise skip both (agreed design)
  const { home: homeFlagPath, away: awayFlagPath } = getFlagPair(homeTeam, awayTeam);
  const showFlags = Boolean(homeFlagPath && awayFlagPath);

  let rowY = panelTop + 190;
  const rowH = 82;
  const rows = [
    { team: homeTeam, goals: homeGoals, flagPath: homeFlagPath },
    { team: awayTeam, goals: awayGoals, flagPath: awayFlagPath },
  ];

  for (const row of rows) {
    if (showFlags) {
      const flagImg = await loadImage(row.flagPath);
      ctx.drawImage(flagImg, x, rowY, 70, 50);
    }
    ctx.fillStyle = white;
    ctx.font = "36px PoppinsMedium";
    ctx.fillText(row.team, x + (showFlags ? 90 : 0), rowY + 40);

    ctx.font = "42px PoppinsBold";
    const scoreText = String(row.goals);
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.fillText(scoreText, x + 420 - scoreWidth, rowY + 40);

    rowY += rowH;
  }

  const dividerY = rowY + 16;
  ctx.strokeStyle = "#464C5C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, dividerY);
  ctx.lineTo(x + 420, dividerY);
  ctx.stroke();

  let ty = dividerY + 20;
  ctx.fillStyle = "#E23C3C";
  ctx.beginPath();
  ctx.arc(x + 5, ty + 9, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(`${scoringTeam} scored at ${formatClock(scoredAtSeconds)}`, x + 20, ty + 18);

  // Scorer name — only shown if we actually resolved one. Not every goal
  // will have this (own goals, missing lineup data, etc.) — omitting it
  // cleanly is the correct fallback, not an error.
  if (scorerName) {
    ty += 34;
    ctx.fillStyle = white;
    ctx.font = "28px PoppinsBold";
    ctx.fillText(scorerName, x + 20, ty + 18);
  }

  ty += 38;
  ctx.font = "26px PoppinsMedium";
  ctx.fillStyle = gray;
  ctx.fillText(`Match time: ${formatClock(currentSeconds)}  ·  Live`, x + 20, ty + 18);

  // Ball graphic filling remaining space
  const ball = await loadImage(ballImagePath);
  ctx.drawImage(ball, x + 110, ty + 55, 190, 190);

  return canvas.toBuffer("image/png");
}

const YELLOW_TEMPLATES = [
  path.join(__dirname, "../assets/templates/yellow_1.png"),
  path.join(__dirname, "../assets/templates/yellow_2.png"),
];
const RED_TEMPLATES = [
  path.join(__dirname, "../assets/templates/red_1.png"),
  path.join(__dirname, "../assets/templates/red_2.png"),
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Draws a simple flat card icon (rounded rect) in the given color. */
function drawCardIcon(ctx, x, y, color) {
  const w = 120;
  const h = 170;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.12);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 14);
  ctx.fill();
  ctx.restore();
}

/** Draws a simple flat corner-flag icon (pole + triangular flag). */
function drawCornerFlagIcon(ctx, x, y, color) {
  const poleHeight = 150;
  const flagW = 70;
  const flagH = 50;
  ctx.save();
  ctx.translate(x, y);

  // Pole
  ctx.fillStyle = "#D8D8D8";
  ctx.fillRect(-4, 0, 8, poleHeight);

  // Triangular flag
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(4, 8);
  ctx.lineTo(4 + flagW, 8 + flagH / 2);
  ctx.lineTo(4, 8 + flagH);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Shared renderer for yellow/red card alerts — same layout skeleton as the
 * goal card (header, team rows with running card counts, time footer, icon)
 * but themed per card type.
 */
async function renderCardEvent(opts) {
  const {
    templates,
    headerText,
    headerColor,
    iconColor,
    homeTeam,
    awayTeam,
    bookedTeam,
    eventAtSeconds,
    currentSeconds,
    playerName, // optional — the booked player's real name, if resolved
  } = opts;

  const templatePath = pickRandom(templates);
  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const white = "#F5F5F5";
  const gray = "#969CAA";
  const x = 990;
  const panelTop = 40;

  ctx.fillStyle = headerColor;
  ctx.font = "60px PoppinsBold";
  ctx.fillText(headerText, x, panelTop + 100);

  // Only the booked team is shown — flags still need BOTH teams to resolve
  // (per the agreed rule: skip the flag entirely if either side is unmapped),
  // but only the booked team's flag/name actually gets drawn.
  const { home: homeFlagPath, away: awayFlagPath } = getFlagPair(homeTeam, awayTeam);
  const bookedFlagPath = bookedTeam === homeTeam ? homeFlagPath : awayFlagPath;
  const showFlag = Boolean(homeFlagPath && awayFlagPath);

  let rowY = panelTop + 190;
  if (showFlag) {
    const flagImg = await loadImage(bookedFlagPath);
    ctx.drawImage(flagImg, x, rowY, 84, 60);
  }
  ctx.fillStyle = white;
  ctx.font = "48px PoppinsBold";
  ctx.fillText(bookedTeam, x + (showFlag ? 104 : 0), rowY + 45);

  const dividerY = rowY + 100;
  ctx.strokeStyle = "#464C5C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, dividerY);
  ctx.lineTo(x + 420, dividerY);
  ctx.stroke();

  let ty = dividerY + 20;
  ctx.fillStyle = headerColor;
  ctx.beginPath();
  ctx.arc(x + 5, ty + 9, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(`Booked at ${formatClock(eventAtSeconds)}`, x + 20, ty + 18);

  // Player name — only shown if resolved (not every card event will have
  // one; omitting cleanly is correct, not an error), same pattern as the
  // goal card's scorer name.
  if (playerName) {
    ty += 34;
    ctx.fillStyle = white;
    ctx.font = "28px PoppinsBold";
    ctx.fillText(playerName, x + 20, ty + 18);
  }

  ty += 38;
  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(`Match time: ${formatClock(currentSeconds)}  ·  Live`, x + 20, ty + 18);

  drawCardIcon(ctx, x + 150, ty + 40, iconColor);

  return canvas.toBuffer("image/png");
}

/**
 * @param {object} opts - same shape as renderCardEvent minus templates/colors
 */
async function renderYellowCard(opts) {
  return renderCardEvent({
    ...opts,
    templates: YELLOW_TEMPLATES,
    headerText: "YELLOW CARD!",
    headerColor: "#F4C400",
    iconColor: "#F4C400",
  });
}

/**
 * @param {object} opts - same shape as renderCardEvent
 */
async function renderRedCard(opts) {
  return renderCardEvent({
    ...opts,
    templates: RED_TEMPLATES,
    headerText: "RED CARD!",
    headerColor: "#E23C3C",
    iconColor: "#E23C3C",
  });
}

const fetch = require("node-fetch");
const os = require("os");
const fsPromises = require("fs").promises;

/**
 * Downloads an image and returns it masked to a circle, ready to draw.
 *
 * WORKAROUND: @napi-rs/canvas's loadImage() has a bug where it mis-detects
 * PNG buffers as SVG and fails ("Invalid SVG image"), even with valid PNG
 * bytes — confirmed by testing the exact same bytes via file path (works)
 * vs. Buffer (always fails). Loading from a file path is reliable, so we
 * write the fetched bytes to a temp file first rather than passing the
 * buffer directly.
 */
async function loadCircularAvatar(url, size) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());

  const tempPath = path.join(os.tmpdir(), `onside-avatar-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await fsPromises.writeFile(tempPath, buf);

  let img;
  try {
    img = await loadImage(tempPath);
  } finally {
    fsPromises.unlink(tempPath).catch(() => {});
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();
  return canvas;
}

/**
 * Renders the "Called It First!" card for the single earliest correct
 * predictor. Falls back gracefully if their profile picture fails to load.
 *
 * @param {object} opts
 * @param {string} opts.templatePath - path to the winner card background template
 * @param {string} opts.matchLabel - e.g. "France v England"
 * @param {string} opts.username - X handle (without @)
 * @param {string} opts.profileImageUrl
 * @param {string} opts.predictedTeam - the team they correctly called
 */
/**
 * Renders the "Called it first!" winner announcement card.
 *
 * Layout, top to bottom: bold result headline (e.g. "ENGLAND WINS!" or a
 * closest-guess result) shown BEFORE the profile picture, then the avatar,
 * username, "Called it first!", the winner's actual quoted reply text, and
 * a footer.
 *
 * @param {object} opts
 * @param {string} opts.templatePath
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 * @param {string} opts.username
 * @param {string} opts.profileImageUrl
 * @param {string} opts.resultHeadline - bold announcement text, e.g. "ENGLAND WINS!" or "CLOSEST GUESS: 5 GOALS"
 * @param {string|null} [opts.commentText] - the winner's actual reply text, shown as a quote; omitted if not available
 */
async function renderFirstCorrectCard(opts) {
  const { templatePath, homeTeam, awayTeam, username, profileImageUrl, resultHeadline, commentText } = opts;

  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const gold = "#F4C400";
  const white = "#F5F5F5";
  const gray = "#969CAA";

  const panelLeft = 990;
  const panelRight = canvas.width - 60;
  const panelCenterX = (panelLeft + panelRight) / 2;
  const panelWidth = panelRight - panelLeft;

  ctx.textAlign = "center";

  // Bold result headline — the whole point of the card, shown first,
  // before anything else including the pfp.
  let headlineFontSize = 50;
  ctx.font = `${headlineFontSize}px PoppinsBold`;
  while (ctx.measureText(resultHeadline).width > panelWidth - 30 && headlineFontSize > 30) {
    headlineFontSize -= 3;
    ctx.font = `${headlineFontSize}px PoppinsBold`;
  }
  ctx.fillStyle = gold;
  ctx.fillText(resultHeadline, panelCenterX, 95);

  const matchLabel = `${homeTeam} v ${awayTeam}`;
  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(matchLabel, panelCenterX, 130);

  const avatarSize = 160;
  const avatarY = 170;
  const avatarX = panelCenterX - avatarSize / 2;

  try {
    const avatar = await loadCircularAvatar(profileImageUrl, avatarSize);
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch {
    ctx.fillStyle = "#26262E";
    ctx.beginPath();
    ctx.arc(panelCenterX, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(panelCenterX, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  let ty = avatarY + avatarSize + 50;

  ctx.fillStyle = white;
  ctx.font = "38px PoppinsBold";
  ctx.fillText(`@${username}`, panelCenterX, ty);

  ty += 44;
  ctx.fillStyle = gold;
  ctx.font = "30px PoppinsBold";
  ctx.fillText("Called it first!", panelCenterX, ty);

  // The winner's actual reply, shown as a quote — only if we have it.
  // Wrapped and truncated so a long reply can't overflow the panel.
  if (commentText) {
    ty += 46;
    ctx.fillStyle = white;
    ctx.font = "24px PoppinsMedium";
    const maxQuoteLen = 90;
    const trimmed = commentText.length > maxQuoteLen
      ? commentText.slice(0, maxQuoteLen).trim() + "…"
      : commentText;
    const quoteText = `"${trimmed}"`;

    // Simple word-wrap across up to 2 lines within the panel width
    const words = quoteText.split(" ");
    let line1 = "";
    let line2 = "";
    for (const word of words) {
      if (ctx.measureText(line1 + word).width < panelWidth - 30 && !line2) {
        line1 += (line1 ? " " : "") + word;
      } else {
        line2 += (line2 ? " " : "") + word;
      }
    }
    ctx.fillText(line1, panelCenterX, ty);
    if (line2) {
      ty += 32;
      ctx.fillText(line2, panelCenterX, ty);
    }
  }

  ty += 50;
  ctx.fillStyle = gray;
  ctx.font = "20px PoppinsMedium";
  ctx.fillText("Verified correct by TxODDS", panelCenterX, ty);

  ctx.textAlign = "left"; // reset for any future drawing on this context

  return canvas.toBuffer("image/png");
}

/**
 * Renders the "Who wins?" prediction prompt card — posted at kickoff to
 * invite replies. Shows both teams with flags (safe here, unlike the
 * card-event templates, since there's no goal/score context to confuse it
 * with) and the 30-minute reply window.
 *
 * @param {object} opts
 * @param {string} opts.templatePath
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 */
async function renderPredictionPromptCard(opts) {
  const { templatePath, homeTeam, awayTeam } = opts;

  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const gold = "#F4C400";
  const white = "#F5F5F5";
  const gray = "#969CAA";

  const panelLeft = 990;
  const panelRight = canvas.width - 60;
  const panelCenterX = (panelLeft + panelRight) / 2;

  ctx.textAlign = "center";

  ctx.fillStyle = gold;
  ctx.font = "64px PoppinsBold";
  ctx.fillText("WHO WINS?", panelCenterX, 130);

  const { home: homeFlagPath, away: awayFlagPath } = getFlagPair(homeTeam, awayTeam);
  const showFlags = Boolean(homeFlagPath && awayFlagPath);

  const rowY = 210;
  const rowGap = 90;

  for (const [i, team] of [homeTeam, awayTeam].entries()) {
    const y = rowY + i * rowGap;
    if (showFlags) {
      const flagImg = await loadImage(i === 0 ? homeFlagPath : awayFlagPath);
      const flagW = 64;
      const flagH = 46;
      ctx.drawImage(flagImg, panelCenterX - 160, y - flagH / 2, flagW, flagH);
      ctx.textAlign = "left";
      ctx.fillStyle = white;
      ctx.font = "40px PoppinsBold";
      ctx.fillText(team, panelCenterX - 80, y + 14);
      ctx.textAlign = "center";
    } else {
      ctx.fillStyle = white;
      ctx.font = "40px PoppinsBold";
      ctx.fillText(team, panelCenterX, y + 14);
    }
    if (i === 0) {
      ctx.fillStyle = gray;
      ctx.font = "26px PoppinsMedium";
      ctx.fillText("vs", panelCenterX, y + rowGap / 2 + 10);
    }
  }

  const footerY = rowY + rowGap * 2 + 50;
  ctx.strokeStyle = "#464C5C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(panelLeft, footerY);
  ctx.lineTo(panelRight, footerY);
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = "28px PoppinsBold";
  ctx.fillText("Reply with your pick!", panelCenterX, footerY + 45);

  ctx.fillStyle = gray;
  ctx.font = "22px PoppinsMedium";
  ctx.fillText("You have 30 minutes", panelCenterX, footerY + 78);

  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

/**
 * Renders a numeric-guess prediction prompt card — used for "How many
 * total goals?", "How many yellow cards?", "How many red cards?".
 * Same visual language as renderPredictionPromptCard (WHO WINS) but
 * shows a single big question instead of a team-vs-team pick, since
 * these are number guesses, not team selections.
 *
 * @param {object} opts
 * @param {string} opts.templatePath
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 * @param {string} opts.questionText - e.g. "HOW MANY GOALS?"
 */
async function renderNumberPredictionCard(opts) {
  const { templatePath, homeTeam, awayTeam, questionText } = opts;

  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const gold = "#F4C400";
  const white = "#F5F5F5";
  const gray = "#969CAA";

  const panelLeft = 990;
  const panelRight = canvas.width - 60;
  const panelCenterX = (panelLeft + panelRight) / 2;

  ctx.textAlign = "center";

  // Question text — same font size as WHO WINS, auto-shrinks slightly if
  // the question is longer so it doesn't overflow the panel width.
  let fontSize = 58;
  ctx.font = `${fontSize}px PoppinsBold`;
  while (ctx.measureText(questionText).width > panelRight - panelLeft - 40 && fontSize > 34) {
    fontSize -= 4;
    ctx.font = `${fontSize}px PoppinsBold`;
  }
  ctx.fillStyle = gold;
  ctx.fillText(questionText, panelCenterX, 130);

  const matchLabel = `${homeTeam} v ${awayTeam}`;
  ctx.fillStyle = white;
  ctx.font = "36px PoppinsMedium";
  ctx.fillText(matchLabel, panelCenterX, 210);

  const footerY = 330;
  ctx.strokeStyle = "#464C5C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(panelLeft, footerY);
  ctx.lineTo(panelRight, footerY);
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = "28px PoppinsBold";
  ctx.fillText("Reply with your guess!", panelCenterX, footerY + 45);

  ctx.fillStyle = gray;
  ctx.font = "22px PoppinsMedium";
  ctx.fillText("Closest guess wins · You have 30 minutes", panelCenterX, footerY + 78);

  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

/**
 * Renders a corner alert card — team rows with running corner tallies
 * (unlike cards, corners are naturally a running comparison, so both
 * teams are shown, similar to the goal card's layout).
 *
 * @param {object} opts
 * @param {string} opts.templatePath
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 * @param {number} opts.homeCorners
 * @param {number} opts.awayCorners
 * @param {string} opts.wonByTeam - which team just won this corner
 * @param {number} opts.eventAtSeconds
 * @param {number} opts.currentSeconds
 */
async function renderCornerCard(opts) {
  const {
    templatePath,
    homeTeam,
    awayTeam,
    wonByTeam,
    eventAtSeconds,
    currentSeconds,
  } = opts;

  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0);

  const cornerColor = "#3FA9F5"; // distinct blue, not overlapping goal/card colors
  const white = "#F5F5F5";
  const gray = "#969CAA";
  const x = 990;
  const panelTop = 40;

  ctx.fillStyle = cornerColor;
  ctx.font = "56px PoppinsBold";
  ctx.fillText("CORNER!", x, panelTop + 90);

  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(`${homeTeam} v ${awayTeam}`, x, panelTop + 130);

  // Single, prominent "won by" display — no side-by-side team/count rows,
  // since those read like a scoreboard and get confused for the goal
  // score. Just the flag (if available) and the team name, large.
  const { home: homeFlagPath, away: awayFlagPath } = getFlagPair(homeTeam, awayTeam);
  const wonByFlagPath = wonByTeam === homeTeam ? homeFlagPath : awayFlagPath;
  const showFlag = Boolean(wonByFlagPath);

  const blockY = panelTop + 210;

  if (showFlag) {
    const flagImg = await loadImage(wonByFlagPath);
    ctx.drawImage(flagImg, x, blockY, 110, 78);
  }

  ctx.fillStyle = white;
  ctx.font = "52px PoppinsBold";
  ctx.fillText(wonByTeam, x + (showFlag ? 130 : 0), blockY + 55);

  const dividerY = blockY + 130;
  ctx.strokeStyle = "#464C5C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, dividerY);
  ctx.lineTo(x + 420, dividerY);
  ctx.stroke();

  let ty = dividerY + 20;
  ctx.fillStyle = cornerColor;
  ctx.beginPath();
  ctx.arc(x + 5, ty + 9, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = gray;
  ctx.font = "26px PoppinsMedium";
  ctx.fillText(`Taken at ${formatClock(eventAtSeconds)}`, x + 20, ty + 18);

  ty += 38;
  ctx.fillText(`Match time: ${formatClock(currentSeconds)}  ·  Live`, x + 20, ty + 18);

  drawCornerFlagIcon(ctx, x + 150, ty + 30, cornerColor);

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderGoalCard,
  renderYellowCard,
  renderRedCard,
  renderFirstCorrectCard,
  renderPredictionPromptCard,
  renderNumberPredictionCard,
  renderCornerCard,
};