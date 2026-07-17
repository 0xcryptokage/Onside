/**
 * Maps team names exactly as TxLINE returns them (Participant1/Participant2)
 * to flag codes with pre-rendered PNGs in assets/flags-png/.
 *
 * England/Scotland/Wales/Northern Ireland use their own individual flags
 * (gb-eng, gb-sct, gb-wls, gb-nir), not the generic UK flag, since they
 * compete as separate national teams.
 *
 * If a team name isn't found here, getFlagCode() returns null. Per the
 * agreed design: if EITHER team in a match fails to resolve a flag, the
 * caller should skip flags for BOTH teams — never show one flag without
 * the other.
 */

const TEAM_TO_FLAG_CODE = {
  England: "gb-eng",
  Scotland: "gb-sct",
  Wales: "gb-wls",
  "Northern Ireland": "gb-nir",

  France: "fr",
  Spain: "es",
  Portugal: "pt",
  Germany: "de",
  Italy: "it",
  Netherlands: "nl",
  Belgium: "be",
  Croatia: "hr",
  Serbia: "rs",
  Poland: "pl",
  Switzerland: "ch",
  Austria: "at",
  Denmark: "dk",
  Norway: "no",
  Sweden: "se",
  Finland: "fi",
  "Czech Republic": "cz",
  Czechia: "cz",
  Slovakia: "sk",
  Slovenia: "si",
  Ukraine: "ua",
  Greece: "gr",
  Turkey: "tr",
  "Türkiye": "tr",
  Hungary: "hu",
  Romania: "ro",
  Iceland: "is",
  Ireland: "ie",
  "Republic of Ireland": "ie",

  Argentina: "ar",
  Brazil: "br",
  Uruguay: "uy",
  Colombia: "co",
  Ecuador: "ec",
  Peru: "pe",
  Paraguay: "py",
  Venezuela: "ve",
  Chile: "cl",
  Bolivia: "bo",

  Mexico: "mx",
  USA: "us",
  "United States": "us",
  Canada: "ca",
  "Costa Rica": "cr",
  Panama: "pa",
  Jamaica: "jm",
  Honduras: "hn",
  "El Salvador": "sv",
  Curacao: "cw",
  "Curaçao": "cw",
  Haiti: "ht",

  Morocco: "ma",
  Senegal: "sn",
  Ghana: "gh",
  Nigeria: "ng",
  Tunisia: "tn",
  Egypt: "eg",
  Cameroon: "cm",
  Algeria: "dz",
  "Ivory Coast": "ci",
  "Côte d'Ivoire": "ci",
  "South Africa": "za",
  "Cape Verde": "cv",
  "Cabo Verde": "cv",

  Japan: "jp",
  "South Korea": "kr",
  "Korea Republic": "kr",
  Iran: "ir",
  "Saudi Arabia": "sa",
  Qatar: "qa",
  Australia: "au",
  Jordan: "jo",
  Uzbekistan: "uz",
  Iraq: "iq",

  "New Zealand": "nz",
};

function getFlagCode(teamName) {
  return TEAM_TO_FLAG_CODE[teamName] ?? null;
}

/** Returns { home, away } PNG paths, or { home: null, away: null } if EITHER team is unmapped. */
function getFlagPair(homeTeam, awayTeam) {
  const homeCode = getFlagCode(homeTeam);
  const awayCode = getFlagCode(awayTeam);
  if (!homeCode || !awayCode) return { home: null, away: null };
  return {
    home: `${__dirname}/../assets/flags-png/${homeCode}.png`,
    away: `${__dirname}/../assets/flags-png/${awayCode}.png`,
  };
}

module.exports = { getFlagCode, getFlagPair };
