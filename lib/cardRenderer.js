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

module.exports = { renderGoalCard, renderYellowCard, renderRedCard };