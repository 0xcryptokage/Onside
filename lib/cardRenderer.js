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

  ty += 38;
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

  ty += 38;
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
async function renderFirstCorrectCard(opts) {
  const { templatePath, homeTeam, awayTeam, username, profileImageUrl, predictedTeam } = opts;

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

  const matchLabel = `${homeTeam} v ${awayTeam}`;
  ctx.fillStyle = white;
  ctx.font = "38px PoppinsBold";
  ctx.fillText(matchLabel, panelCenterX, 118);

  const avatarSize = 180;
  const avatarY = 180;
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

  ctx.fillStyle = white;
  ctx.font = "44px PoppinsBold";
  ctx.fillText(`@${username}`, panelCenterX, avatarY + avatarSize + 60);

  ctx.fillStyle = gold;
  ctx.font = "38px PoppinsBold";
  ctx.fillText("Called it first!", panelCenterX, avatarY + avatarSize + 115);

  ctx.fillStyle = white;
  ctx.font = "28px PoppinsMedium";
  ctx.fillText(`Predicted ${predictedTeam}`, panelCenterX, avatarY + avatarSize + 160);

  ctx.fillStyle = gray;
  ctx.font = "22px PoppinsMedium";
  ctx.fillText("Verified correct by TxODDS", panelCenterX, avatarY + avatarSize + 192);

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

module.exports = {
  renderGoalCard,
  renderYellowCard,
  renderRedCard,
  renderFirstCorrectCard,
  renderPredictionPromptCard,
};